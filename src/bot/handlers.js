import { config, isAdmin } from '../config.js';
import { answerQuestion } from '../ai/gemini.js';
import { allowRequest } from '../services/rateLimiter.js';
import { logInteraction, getStats } from '../services/userService.js';
import { t, staticLang } from './messages.js';

const TELEGRAM_MAX = 4096;

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

export async function handleStart(ctx) {
  await reply(ctx, t('welcome', staticLang(ctx.from?.language_code)));
}

export async function handleHelp(ctx) {
  await reply(ctx, t('help', staticLang(ctx.from?.language_code)));
}

export async function handleNonText(ctx) {
  await reply(ctx, t('nonText', staticLang(ctx.from?.language_code)));
}

/** Admin-only stats. The AI can never reveal these — only this command can. */
export async function handleStats(ctx) {
  const lang = staticLang(ctx.from?.language_code);
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
  const fallbackLang = user?.lastDetectedLanguage || staticLang(from?.language_code);

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
