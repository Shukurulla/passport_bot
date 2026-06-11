import { fileURLToPath } from 'node:url';
import { Markup } from 'telegraf';
import { config, isAdmin } from '../config.js';
import { answerQuestion } from '../ai/gemini.js';
import { allowRequest } from '../services/rateLimiter.js';
import { logInteraction, getStats, setPreferredLang } from '../services/userService.js';
import { t, staticLang, LANG_PROMPT, LANG_BUTTONS } from './messages.js';

const TELEGRAM_MAX = 4096;

// Official Karakalpakstan flag, shown as the banner on the /start language picker.
const FLAG_PATH = fileURLToPath(
  new URL('../../assets/karakalpakstan-flag.png', import.meta.url)
);

// One button per language, stacked vertically. callback_data = "lang:<code>".
const langKeyboard = Markup.inlineKeyboard(
  LANG_BUTTONS.map((b) => [Markup.button.callback(b.label, `lang:${b.code}`)])
);

/** Best UI language for static messages: explicit choice > last detected > client locale. */
function uiLang(ctx) {
  const u = ctx.state?.user;
  return u?.preferredLang || u?.lastDetectedLanguage || staticLang(ctx.from?.language_code);
}

/** Send a possibly long reply, split into Telegram-sized chunks. */
async function reply(ctx, text) {
  if (!text) return;
  if (text.length <= TELEGRAM_MAX) {
    await ctx.reply(text, { disable_web_page_preview: true });
    return;
  }
  for (let i = 0; i < text.length; i += TELEGRAM_MAX) {
    await ctx.reply(text.slice(i, i + TELEGRAM_MAX), { disable_web_page_preview: true });
  }
}

// /start -> show the Karakalpakstan flag banner + ask which language to use,
// THEN (on button tap) show the intro in the chosen language.
export async function handleStart(ctx) {
  try {
    await ctx.replyWithPhoto(
      { source: FLAG_PATH },
      { caption: LANG_PROMPT, ...langKeyboard }
    );
  } catch (err) {
    // If the image can't be sent for any reason, fall back to a text picker.
    console.error('Could not send flag banner:', err.message);
    await ctx.reply(LANG_PROMPT, langKeyboard);
  }
}

// Tap on a language button -> remember it and reveal the intro in that language.
export async function handleLangChoice(ctx) {
  const lang = ctx.match?.[1] || 'uz_latn';
  try {
    await setPreferredLang(ctx.from.id, lang);
  } catch (err) {
    console.error('setPreferredLang failed:', err.message);
  }
  await ctx.answerCbQuery().catch(() => {});

  // Remove the buttons from the picker (works whether it's a photo or text),
  // then send the intro in the chosen language as a fresh message.
  await ctx.editMessageReplyMarkup({ inline_keyboard: [] }).catch(() => {});
  await reply(ctx, t('welcome', lang));
}

export async function handleHelp(ctx) {
  await reply(ctx, t('help', uiLang(ctx)));
}

export async function handleNonText(ctx) {
  await reply(ctx, t('nonText', uiLang(ctx)));
}

/** Admin-only stats. The AI can never reveal these — only this command can. */
export async function handleStats(ctx) {
  const lang = uiLang(ctx);
  if (!isAdmin(ctx.from?.id)) {
    await reply(ctx, t('adminOnly', lang));
    return;
  }

  const s = await getStats();
  const langLines = s.byLang.map((r) => `   ${r._id || '—'}: ${r.n}`).join('\n') || '   —';
  const intentLines = s.byIntent.map((r) => `   ${r._id || '—'}: ${r.n}`).join('\n') || '   —';

  const text =
    '📊 Statistika\n\n' +
    `👥 Jami foydalanuvchilar: ${s.totalUsers}\n` +
    `💬 Jami savollar: ${s.totalMessages}\n\n` +
    `🆕 Oxirgi 24 soat: ${s.todayMessages} savol, ${s.todayUsers} foydalanuvchi\n\n` +
    `🗣 Tillar bo‘yicha:\n${langLines}\n\n` +
    `🏷 Turlari bo‘yicha (intent):\n${intentLines}`;

  await reply(ctx, text);
}

/** Main path: a free-text question routed through Gemini. */
export async function handleText(ctx) {
  const from = ctx.from;
  const user = ctx.state.user;
  const fallbackLang =
    user?.lastDetectedLanguage || user?.preferredLang || staticLang(from?.language_code);

  // Anti-flood: cap AI calls per user per minute.
  if (!allowRequest(from.id, config.maxMessagesPerMinute)) {
    await reply(ctx, t('rateLimited', fallbackLang));
    return;
  }

  let text = (ctx.message.text || '').trim();
  if (!text) return;
  // Hard cap input length to prevent prompt-stuffing / oversized payloads.
  if (text.length > config.maxMessageLength) {
    text = text.slice(0, config.maxMessageLength);
  }

  await ctx.sendChatAction('typing').catch(() => {});

  const startedAt = Date.now();
  let result = null;
  let errMsg;
  try {
    result = await answerQuestion(text);
  } catch (err) {
    errMsg = err?.message;
    console.error('answerQuestion threw:', err);
  }
  const latencyMs = Date.now() - startedAt;

  // Model failed or returned no usable answer -> graceful error, still logged.
  if (!result || !result.answer) {
    const lang = result?.language || fallbackLang;
    await reply(ctx, t('error', lang));
    await safeLog({
      telegramId: from.id,
      username: from.username,
      question: text,
      answer: '',
      detectedLanguage: result?.language,
      intent: result?.intent,
      lowConfidence: result?.lowConfidence,
      model: config.gemini.model,
      latencyMs,
      error: errMsg || 'empty_answer',
    });
    return;
  }

  let outgoing = result.answer;
  // Only nudge for clearer wording on genuine (best-guess) questions — never on
  // an out-of-scope / manipulation / greeting refusal, where it would read as
  // nonsense ("I can't help with that. Please write in official language.").
  if (result.lowConfidence && (result.intent === 'in_scope' || result.intent === 'unclear')) {
    outgoing += t('footerClarify', result.language);
  }

  await reply(ctx, outgoing);

  await safeLog({
    telegramId: from.id,
    username: from.username,
    question: text,
    answer: outgoing,
    detectedLanguage: result.language,
    intent: result.intent,
    lowConfidence: result.lowConfidence,
    model: config.gemini.model,
    latencyMs,
  });
}

// Never let a logging failure break the user-facing reply.
async function safeLog(data) {
  try {
    await logInteraction(data);
  } catch (err) {
    console.error('logInteraction failed:', err.message);
  }
}
