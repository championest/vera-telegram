import { GoogleGenerativeAI } from '@google/generative-ai';
import { config } from './config.js';
export const genAI = new GoogleGenerativeAI(config.GEMINI_API_KEY);
export const MODEL_NAME = 'gemini-2.5-flash';
export const FALLBACK_MODEL = 'gemini-2.0-flash';
/** Retry a Gemini call up to maxRetries times on 503/overloaded errors */
export async function withRetry(fn, maxRetries = 3, baseDelayMs = 3000) {
    let lastErr;
    for (let attempt = 0; attempt < maxRetries; attempt++) {
        try {
            return await fn();
        }
        catch (err) {
            const msg = err?.message ?? String(err);
            const is503 = msg.includes('503') || msg.includes('Service Unavailable') || msg.includes('overloaded');
            if (!is503)
                throw err;
            lastErr = err;
            const delay = baseDelayMs * Math.pow(2, attempt); // 3s, 6s, 12s
            console.warn(`[Gemini] 503 attempt ${attempt + 1}/${maxRetries}, retry in ${delay}ms`);
            await new Promise(r => setTimeout(r, delay));
        }
    }
    throw lastErr;
}
/** Get a model instance, falling back to FALLBACK_MODEL on 503 */
export async function withFallback(primaryFn) {
    try {
        return await withRetry(() => primaryFn(MODEL_NAME));
    }
    catch (err) {
        const msg = err?.message ?? String(err);
        const is503 = msg.includes('503') || msg.includes('Service Unavailable') || msg.includes('overloaded');
        if (!is503)
            throw err;
        console.warn(`[Gemini] Primary model failed, switching to fallback: ${FALLBACK_MODEL}`);
        return await withRetry(() => primaryFn(FALLBACK_MODEL), 2, 2000);
    }
}
