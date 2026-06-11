import mongoose from 'mongoose';

const userSchema = new mongoose.Schema(
  {
    telegramId: { type: Number, required: true, unique: true, index: true },
    firstName: String,
    lastName: String,
    username: String,
    // Language code Telegram reports for the user's client (e.g. "ru", "uz").
    telegramLanguageCode: String,
    // Last language our AI detected from the user's actual messages.
    lastDetectedLanguage: String,
    // Language the user picked on /start for the UI/intro (uz_latn | kk | ru).
    preferredLang: String,
    // Set by an admin to cut off an abusive user.
    isBlocked: { type: Boolean, default: false },
    messageCount: { type: Number, default: 0 },
    firstSeenAt: { type: Date, default: Date.now },
    lastSeenAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

export const User = mongoose.model('User', userSchema);
