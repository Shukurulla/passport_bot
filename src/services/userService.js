import { User } from '../db/models/User.js';
import { Message } from '../db/models/Message.js';

/** Create or refresh the user record from a Telegram `from` object. */
export async function upsertUser(from) {
  return User.findOneAndUpdate(
    { telegramId: from.id },
    {
      $set: {
        firstName: from.first_name,
        lastName: from.last_name,
        username: from.username,
        telegramLanguageCode: from.language_code,
        lastSeenAt: new Date(),
      },
      $setOnInsert: { firstSeenAt: new Date() },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );
}

/** Persist one question/answer interaction and bump the user's counters. */
export async function logInteraction(data) {
  await Message.create(data);
  await User.updateOne(
    { telegramId: data.telegramId },
    {
      $inc: { messageCount: 1 },
      $set: {
        lastDetectedLanguage: data.detectedLanguage,
        lastSeenAt: new Date(),
      },
    }
  );
}

/** Aggregate stats for the admin /stats command. */
export async function getStats() {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);

  const [totalUsers, totalMessages, todayMessages, todayUserIds, byLang, byIntent] =
    await Promise.all([
      User.countDocuments(),
      Message.countDocuments(),
      Message.countDocuments({ createdAt: { $gte: since } }),
      Message.distinct('telegramId', { createdAt: { $gte: since } }),
      Message.aggregate([
        { $group: { _id: '$detectedLanguage', n: { $sum: 1 } } },
        { $sort: { n: -1 } },
      ]),
      Message.aggregate([
        { $group: { _id: '$intent', n: { $sum: 1 } } },
        { $sort: { n: -1 } },
      ]),
    ]);

  return {
    totalUsers,
    totalMessages,
    todayMessages,
    todayUsers: todayUserIds.length,
    byLang,
    byIntent,
  };
}
