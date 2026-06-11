import { config } from './config.js';
import { connectDb, disconnectDb } from './db/connection.js';
import { createBot } from './bot/bot.js';

async function main() {
  await connectDb();

  if (config.adminIds.length === 0) {
    console.warn(
      '⚠️  ADMIN_IDS is empty — the /stats command is disabled for everyone. ' +
        'Set ADMIN_IDS in .env to enable admin statistics.'
    );
  }

  const bot = createBot();

  // Long polling. For production behind HTTPS you can switch to webhooks.
  bot.launch({ dropPendingUpdates: true });
  console.log(`🤖 Bot is running (model: ${config.gemini.model})`);

  const shutdown = async (signal) => {
    console.log(`\n${signal} received, shutting down…`);
    bot.stop(signal);
    await disconnectDb();
    process.exit(0);
  };
  process.once('SIGINT', () => shutdown('SIGINT'));
  process.once('SIGTERM', () => shutdown('SIGTERM'));
}

main().catch((err) => {
  console.error('Fatal startup error:', err);
  process.exit(1);
});
