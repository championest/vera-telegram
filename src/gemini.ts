import { GoogleGenerativeAI } from '@google/generative-ai';
import { config } from './config.js';

export const genAI = new GoogleGenerativeAI(config.GEMINI_API_KEY);
export const MODEL_NAME = 'gemini-2.5-flash';
export const FALLBACK_MODEL = 'gemini-2.0-flash';

/** Retry a Gemini call up to maxRetries times on 503/overloaded errors */
export async function withRetry<T>(
  fn: () => Promise<T>,
  maxRetries = 3,
  baseDelayMs = 5000,
): Promise<T> {
  let lastErr: unknown;
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err: any) {
      const msg: string = err?.message ?? String(err);
      const is503 = msg.includes('503') || msg.includes('Service Unavailable') || msg.includes('overloaded');
      if (!is503) throw err; // non-retryable error
      lastErr = err;
      const delay = baseDelayMs * Math.pow(2, attempt); // 5s, 10s, 20s
      console.warn(`[Gemini] 503 on attempt ${attempt + 1}, retrying in ${delay}ms...`);
      await new Promise(r => setTimeout(r, delay));
    }
  }
  throw lastErr;
}
