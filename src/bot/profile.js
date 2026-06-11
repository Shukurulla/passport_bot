// Sets the bot's public profile via the Telegram Bot API:
//  - description       -> shown in the EMPTY chat, before the user taps Start
//  - short description -> shown on the bot's profile page
//  - commands          -> the menu next to the input box
// Trilingual (Uzbek / Karakalpak / Russian) so users see info before /start.

const DESCRIPTION =
  '🛂 Pasport va migratsiya xizmatlari boʻyicha yordamchi bot.\n' +
  '🛂 Pasport hám migratsiya xızmetleri boyınsha járdemshi bot.\n' +
  '🛂 Бот-помощник по паспортным и миграционным услугам.\n\n' +
  'Pasport, ID-karta, propiska, fuqarolik, taklifnoma.\n' +
  'Паспорт, ID-карта, прописка, гражданство, приглашение.\n\n' +
  '▶️ /start';

const SHORT_DESCRIPTION =
  'Pasport va migratsiya xizmatlari boti · Паспортные и миграционные услуги';

const COMMANDS = [
  { command: 'start', description: 'Boshlash · Начать · Baslaw' },
  { command: 'help', description: 'Yordam · Помощь · Járdem' },
];

export async function setBotProfile(bot) {
  try {
    await bot.telegram.setMyDescription(DESCRIPTION);
    await bot.telegram.setMyShortDescription(SHORT_DESCRIPTION);
    await bot.telegram.setMyCommands(COMMANDS);
    console.log('✅ Bot profile configured (description, commands)');
  } catch (err) {
    // Non-fatal: the bot still works without a profile.
    console.error('⚠️  Could not set bot profile:', err.message);
  }
}
