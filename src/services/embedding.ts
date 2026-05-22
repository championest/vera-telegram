import { genAI } from '../gemini.js';

const EMBED_MODEL = 'text-embedding-004';
export const EMBED_DIM = 768;

/** Returns a 768-dim embedding vector for the input text. */
export async function embed(text: string): Promise<number[]> {
  const clean = text.trim();
  if (!clean) return new Array(EMBED_DIM).fill(0);
  const model = genAI.getGenerativeModel({ model: EMBED_MODEL });
  const res = await model.embedContent(clean.slice(0, 8000));
  return res.embedding.values;
}

/** Cosine similarity between two equal-length vectors. */
export function cosineSim(a: number[], b: number[]): number {
  if (!a || !b || a.length !== b.length) return 0;
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 0 : dot / denom;
}
