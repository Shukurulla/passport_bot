import mongoose from 'mongoose';

// One document per question the user asks, together with the answer we sent.
const messageSchema = new mongoose.Schema(
  {
    telegramId: { type: Number, required: true, index: true },
    username: String,
    question: { type: String, required: true },
    answer: String,
    // uz_latn | uz_cyrl | kk | ru | other
    detectedLanguage: String,
    // in_scope | out_of_scope | greeting | manipulation | unclear
    intent: String,
    lowConfidence: Boolean,
    model: String,
    latencyMs: Number,
    error: String,
  },
  { timestamps: true }
);

messageSchema.index({ createdAt: -1 });
messageSchema.index({ intent: 1 });

export const Message = mongoose.model('Message', messageSchema);
