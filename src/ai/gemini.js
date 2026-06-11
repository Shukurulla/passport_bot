import { GoogleGenAI } from '@google/genai';
import { config } from '../config.js';
import { buildSystemPrompt } from './systemPrompt.js';
import { responseSchema } from './schema.js';

const ai = new GoogleGenAI({ apiKey: config.gemini.apiKey });

// Built once at startup — the knowledge base does not change at runtime.
const systemInstruction = buildSystemPrompt();

const generationConfig = {
  systemInstruction,
  temperature: 0.2, // deterministic, fact-faithful answers
  // Generous budget: answers in Cyrillic/Karakalpak are token-heavy and the
  // JSON wrapper adds overhead. Too low a cap truncates the JSON mid-string and
  // makes JSON.parse throw, so keep comfortable headroom.
  maxOutputTokens: 2500,
  responseMimeType: 'application/json',
  responseSchema,
};

/**
 * Ask Gemini to answer a user's message.
 * The raw user text is wrapped in <user_message> delimiters so the model can
 * tell genuine question content apart from any embedded instructions.
 *
 * @returns {Promise<{language:string,intent:string,lowConfidence:boolean,answer:string}|null>}
 */
export async function answerQuestion(userText) {
  const contents = `<user_message>\n${userText}\n</user_message>`;

  let lastError;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const response = await ai.models.generateContent({
        model: config.gemini.model,
        contents,
        config: generationConfig,
      });

      const raw = response.text;
      if (!raw) {
        // Empty text usually means the response was filtered/blocked.
        lastError = new Error('Empty response from model');
        continue;
      }

      const parsed = JSON.parse(raw);
      return normalize(parsed);
    } catch (err) {
      lastError = err;
      // Brief backoff before the single retry (transient 5xx / network).
      if (attempt === 0) await sleep(500);
    }
  }

  console.error('Gemini failed after retries:', lastError?.message);
  return null;
}

function normalize(parsed) {
  const validLangs = ['uz_latn', 'uz_cyrl', 'kk', 'ru', 'other'];
  const validIntents = ['in_scope', 'out_of_scope', 'greeting', 'manipulation', 'unclear'];
  return {
    language: validLangs.includes(parsed?.language) ? parsed.language : 'other',
    intent: validIntents.includes(parsed?.intent) ? parsed.intent : 'unclear',
    lowConfidence: Boolean(parsed?.lowConfidence),
    answer: typeof parsed?.answer === 'string' ? parsed.answer.trim() : '',
  };
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
