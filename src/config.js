import 'dotenv/config';

/** Read a required env var or exit with a clear message. */
function required(name) {
  const value = process.env[name];
  if (!value || !value.trim()) {
    console.error(`❌ Missing required environment variable: ${name}`);
    console.error('   Copy .env.example to .env and fill it in.');
    process.exit(1);
  }
  return value.trim();
}

function optional(name, fallback) {
  const value = process.env[name];
  return value && value.trim() ? value.trim() : fallback;
}

export const config = {
  botToken: required('BOT_TOKEN'),

  gemini: {
    apiKey: required('GEMINI_API_KEY'),
    model: optional('GEMINI_MODEL', 'gemini-2.5-flash'),
  },

  mongoUri: optional('MONGODB_URI', 'mongodb://127.0.0.1:27017/passportstol_bot'),

  // Numeric Telegram ids that may run /stats (kept as strings for easy compare).
  adminIds: (process.env.ADMIN_IDS || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),

  maxMessagesPerMinute: Number(process.env.MAX_MESSAGES_PER_MINUTE) || 12,
  maxMessageLength: Number(process.env.MAX_MESSAGE_LENGTH) || 1000,
};

export function isAdmin(telegramId) {
  return config.adminIds.includes(String(telegramId));
}
