import { Telegraf } from 'telegraf';
import { message } from 'telegraf/filters';
import { config } from '../config.js';
import { upsertUser } from '../services/userService.js';
import { t, staticLang } from './messages.js';
import {
  handleStart,
  handleLangChoice,
  handleHelp,
  handleStats,
  handleText,
  handleNonText,
} from './handlers.js';

export function createBot() {
  const bot = new Telegraf(config.botToken);

  // Load / refresh the user on every update and enforce blocks.
  bot.use(async (ctx, next) => {
    if (!ctx.from || ctx.from.is_bot) return; // ignore channel posts, other bots
    try {
      const user = await upsertUser(ctx.from);
      ctx.state.user = user;
      if (user.isBlocked) {
        await ctx.reply(t('blocked', user.preferredLang || staticLang(ctx.from.language_code)));
        return; // stop the pipeline for blocked users
      }
    } catch (err) {
      console.error('user middleware error:', err.message);
      // Degrade gracefully: continue without a user record.
    }
    return next();
  });

  bot.start(handleStart);
  bot.help(handleHelp);
  bot.command('stats', handleStats);

  // Language picker buttons shown on /start.
  bot.action(/^lang:(uz_latn|kk|ru)$/, handleLangChoice);

  // Text questions -> AI. Anything else (photo, sticker, voice, ...) -> hint.
  bot.on(message('text'), handleText);
  bot.on('message', handleNonText);

  bot.catch((err, ctx) => {
    console.error(`Unhandled bot error for update ${ctx?.update?.update_id}:`, err);
  });

  return bot;
}
