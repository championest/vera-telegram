// Auto-recall — ported from Hermes Agent's MemoryManager.prefetch_all().
//
// Before Vera answers, we embed the incoming message once and pull the most
// relevant long-term memory (rolled-up session summaries + saved facts) straight
// into the system prompt.
//
// Why not just keep `search_memory`? Because that tool is model-gated: Vera had
// to *decide* to search, which cost a whole extra model round-trip before she
// could answer "เราตกลงเรื่อง X ว่าไง". On mobile that round-trip is the
// difference between a 3s reply and a 12s one. Recall now costs one embed call
// (~100ms) and happens on every turn whether the model thinks to ask or not.
// `search_memory` stays as the explicit deep-search escape hatch.
import { db } from '../firebase.js';
import { embed, cosineSim } from '../services/embedding.js';

/** How many memories to inject. Small on purpose — recall is a nudge, not a dump. */
const TOP_K = 6;
/** Cosine floor. Below this the "match" is usually just topical noise. */
const MIN_SCORE = 0.5;

const SESSION_SCAN = 300;
const FACT_SCAN = 200;
/**
 * Long on purpose. Every writer of this corpus (the rollup, save_fact) calls
 * invalidateRecallCache, so the TTL is only a backstop against a write from
 * another process — not the freshness mechanism. A short TTL here would mean
 * re-downloading hundreds of 768-float embeddings mid-conversation, which is
 * exactly the stall this feature exists to remove.
 */
const CACHE_TTL_MS = 30 * 60_000;

interface MemoryDoc {
  kind: 'session' | 'fact';
  text: string;
  embedding?: number[];
  at?: Date;
}

interface CacheEntry {
  docs: MemoryDoc[];
  expiresAt: number;
}

const cache = new Map<string, CacheEntry>();
/** In-flight loads, so N concurrent turns can't each start their own corpus read. */
const inflight = new Map<string, Promise<MemoryDoc[]>>();

/** Drop the cached corpus for a user — called right after a rollup writes new memory. */
export function invalidateRecallCache(userId?: string): void {
  if (userId) cache.delete(userId);
  else cache.clear();
}

function toDate(v: any): Date | undefined {
  return typeof v?.toDate === 'function' ? v.toDate() : undefined;
}

/**
 * Firestore needs a composite index for (userId, orderBy). If it is missing or
 * still building, fall back to an unordered read rather than losing recall
 * entirely — a slightly stale corpus beats no memory at all.
 */
async function readCollection(
  name: string,
  userId: string,
  orderField: string,
  limit: number,
): Promise<FirebaseFirestore.QueryDocumentSnapshot[]> {
  const base = db.collection(name).where('userId', '==', userId);
  try {
    const snap = await base.orderBy(orderField, 'desc').limit(limit).get();
    return snap.docs;
  } catch (err: any) {
    console.warn(`[recall] ${name} ordered read failed (${err?.message ?? err}) — reading unordered`);
    try {
      const snap = await base.limit(limit).get();
      return snap.docs;
    } catch {
      return [];
    }
  }
}

async function loadCorpus(userId: string): Promise<MemoryDoc[]> {
  const hit = cache.get(userId);
  if (hit && hit.expiresAt > Date.now()) return hit.docs;

  const running = inflight.get(userId);
  if (running) return running;

  const load = fetchCorpus(userId).finally(() => inflight.delete(userId));
  inflight.set(userId, load);
  return load;
}

async function fetchCorpus(userId: string): Promise<MemoryDoc[]> {
  const [sessionDocs, factDocs] = await Promise.all([
    readCollection('vera-sessions', userId, 'createdAt', SESSION_SCAN),
    readCollection('vera-facts', userId, 'createdAt', FACT_SCAN),
  ]);

  const docs: MemoryDoc[] = [];

  for (const d of sessionDocs) {
    const data = d.data();
    const summary = String(data['summary'] ?? '').trim();
    if (!summary) continue;
    docs.push({
      kind: 'session',
      text: summary,
      embedding: data['embedding'] as number[] | undefined,
      at: toDate(data['createdAt']),
    });
  }

  for (const d of factDocs) {
    const data = d.data();
    const fact = String(data['fact'] ?? '').trim();
    if (!fact) continue;
    docs.push({
      kind: 'fact',
      text: `[${data['category'] ?? 'general'}] ${fact}`,
      embedding: data['embedding'] as number[] | undefined,
      at: toDate(data['createdAt']),
    });
  }

  cache.set(userId, { docs, expiresAt: Date.now() + CACHE_TTL_MS });
  return docs;
}

/**
 * Pull the corpus in at boot so the first message of the day doesn't pay for it.
 * Fire-and-forget — a failure here just means the first recall loads it instead.
 */
export function warmRecallCache(userId: string): void {
  loadCorpus(userId)
    .then(docs => console.log(`[recall] warmed ${docs.length} memories`))
    .catch(err => console.warn('[recall] warm failed:', err?.message ?? err));
}

/**
 * Returns a system-prompt block of memories relevant to `query`, or '' when
 * nothing clears the bar. Never throws — memory is an enhancement, and a recall
 * failure must not take down the reply.
 */
export async function prefetchRecall(userId: string, query: string): Promise<string> {
  const clean = query.trim();
  if (!clean) return '';

  try {
    const [queryVec, corpus] = await Promise.all([
      embed(clean).catch(() => null),
      loadCorpus(userId),
    ]);
    if (corpus.length === 0) return '';

    const lowered = clean.toLowerCase();
    const scored: Array<{ score: number; doc: MemoryDoc }> = [];

    for (const doc of corpus) {
      let score = 0;
      if (queryVec && Array.isArray(doc.embedding) && doc.embedding.length === queryVec.length) {
        score = cosineSim(queryVec, doc.embedding);
      } else if (doc.text.toLowerCase().includes(lowered)) {
        // Pre-embedding docs, or the embed call failed — substring still beats nothing.
        score = 0.6;
      }
      if (score >= MIN_SCORE) scored.push({ score, doc });
    }

    if (scored.length === 0) return '';
    scored.sort((a, b) => b.score - a.score);

    const lines = scored.slice(0, TOP_K).map(({ doc }) => {
      const when = doc.at
        ? doc.at.toLocaleDateString('th-TH', { day: 'numeric', month: 'short', timeZone: 'Asia/Bangkok' })
        : '';
      const tag = doc.kind === 'session' ? 'คุยกันไว้' : 'จำไว้';
      return `- (${tag}${when ? ` ${when}` : ''}) ${doc.text}`;
    });

    return [
      '',
      '## Recall — ความทรงจำที่เกี่ยวกับข้อความนี้',
      'ดึงมาอัตโนมัติจากบทสนทนาเก่า ใช้ได้เลยโดยไม่ต้องเรียก search_memory',
      'ถ้าไม่เกี่ยวกับที่ Champ ถามตอนนี้ ให้ข้ามไป อย่าเอามาตอบมั่ว',
      ...lines,
    ].join('\n');
  } catch (err: any) {
    console.warn('[recall] prefetch failed:', err?.message ?? err);
    return '';
  }
}
