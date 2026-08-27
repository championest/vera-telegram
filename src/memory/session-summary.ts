// Session rollup — ported from Hermes Agent's MemoryManager.on_session_end().
//
// `vera-memory` is a raw message log: the live window is the last 20 messages
// and everything older is dead weight that eventually gets trimmed away. So
// anything Champ said three days ago was simply gone.
//
// This turns each finished conversation into one durable, searchable record:
// a Thai summary + the decisions + what is still open, embedded so recall.ts
// can find it, plus any durable facts about Champ worth keeping forever.
// Runs on a cron (scheduler/memory-rollup.ts), never in the reply path.
import { db } from '../firebase.js';
import { FieldValue } from 'firebase-admin/firestore';
import { genAI, MODEL_NAME, FALLBACK_MODEL } from '../gemini.js';
import { embed, cosineSim } from '../services/embedding.js';
import { invalidateRecallCache } from './recall.js';

/** A conversation is "over" once this much silence has passed. */
const IDLE_GAP_MS = 30 * 60_000;
/** Not worth a summary below this — a one-line "ขอบคุณ" is not a session. */
const MIN_MESSAGES = 6;
/** Ceiling per rollup so one backlog can't blow up the prompt or the bill. */
const MAX_MESSAGES = 300;
/** Two facts this similar say the same thing — keep the one we already have. */
const FACT_DUPE_SCORE = 0.88;

const STATE_COLLECTION = 'vera-memory-state';

interface Rollup {
  summary: string;
  topics: string[];
  decisions: string[];
  openThreads: string[];
  facts: Array<{ fact: string; category: string }>;
}

const EMPTY: Rollup = { summary: '', topics: [], decisions: [], openThreads: [], facts: [] };

function buildPrompt(transcript: string): string {
  return `สรุปบทสนทนาระหว่าง Champ (เจ้าของธุรกิจ Up Level Guild) กับ Vera (เลขาฯ AI) ด้านล่าง

ตอบเป็น JSON อย่างเดียว ไม่ต้องมี markdown fence ไม่ต้องมีคำอธิบายอื่น:
{
  "summary": "สรุปภาษาไทย 2-4 ประโยค ว่าคุยเรื่องอะไร ได้ข้อสรุปอะไร",
  "topics": ["หัวข้อสั้นๆ", "..."],
  "decisions": ["สิ่งที่ตัดสินใจแล้ว", "..."],
  "openThreads": ["เรื่องที่ยังค้าง ยังไม่จบ", "..."],
  "facts": [{"fact": "ข้อเท็จจริงถาวรเกี่ยวกับ Champ/ธุรกิจ ที่ควรจำตลอดไป", "category": "business|preference|people|schedule|general"}]
}

กฎของ "facts":
- เก็บเฉพาะสิ่งที่ยังจริงในอีก 6 เดือน (เช่น ชื่อร้าน ราคาสินค้าประจำ วิธีที่ Champ ชอบให้ทำงาน คนในทีม)
- ห้ามเก็บเรื่องชั่วคราว (นัดวันนี้ ราคาที่ถามครั้งเดียว สถานะงานที่กำลังทำ)
- ถ้าไม่มีอะไรถาวรเลย ให้ใส่ []

บทสนทนา:
${transcript}`;
}

function parseRollup(raw: string): Rollup {
  const cleaned = raw.replace(/```json\s*/gi, '').replace(/```/g, '').trim();
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start === -1 || end <= start) return EMPTY;

  try {
    const parsed = JSON.parse(cleaned.slice(start, end + 1));
    const strArray = (v: unknown): string[] =>
      Array.isArray(v) ? v.map(x => String(x).trim()).filter(Boolean).slice(0, 12) : [];

    return {
      summary: String(parsed.summary ?? '').trim(),
      topics: strArray(parsed.topics),
      decisions: strArray(parsed.decisions),
      openThreads: strArray(parsed.openThreads),
      facts: Array.isArray(parsed.facts)
        ? parsed.facts
            .map((f: any) => ({
              fact: String(f?.fact ?? '').trim(),
              category: String(f?.category ?? 'general').trim() || 'general',
            }))
            .filter((f: { fact: string }) => f.fact.length > 0)
            .slice(0, 10)
        : [],
    };
  } catch (err: any) {
    console.warn('[rollup] JSON parse failed:', err?.message ?? err);
    return EMPTY;
  }
}

async function summarize(transcript: string): Promise<Rollup> {
  const prompt = buildPrompt(transcript);
  for (const modelName of [MODEL_NAME, FALLBACK_MODEL]) {
    try {
      const model = genAI.getGenerativeModel({ model: modelName });
      const res = await model.generateContent(prompt);
      const parsed = parseRollup(res.response.text());
      if (parsed.summary) return parsed;
    } catch (err: any) {
      console.warn(`[rollup] ${modelName} failed:`, err?.message ?? err);
    }
  }
  return EMPTY;
}

/**
 * Store facts that we don't already know. Dedupe is semantic, not exact-match:
 * "Champ ชอบให้ตอบสั้น" and "แชมป์อยากได้คำตอบกระชับ" are the same fact, and
 * without this the facts block fills up with restatements within a week.
 */
async function persistFacts(userId: string, facts: Rollup['facts']): Promise<number> {
  if (facts.length === 0) return 0;

  const existing = await db.collection('vera-facts').where('userId', '==', userId).limit(300).get();
  const existingVecs = existing.docs
    .map(d => d.data()['embedding'] as number[] | undefined)
    .filter((v): v is number[] => Array.isArray(v));
  const existingText = new Set(
    existing.docs.map(d => String(d.data()['fact'] ?? '').trim().toLowerCase()),
  );

  let saved = 0;
  for (const { fact, category } of facts) {
    if (existingText.has(fact.toLowerCase())) continue;

    let vec: number[] | null = null;
    try {
      vec = await embed(fact);
    } catch {
      /* embedding is optional — the fact is still worth keeping */
    }

    if (vec && existingVecs.some(v => v.length === vec!.length && cosineSim(v, vec!) >= FACT_DUPE_SCORE)) {
      continue;
    }

    await db.collection('vera-facts').add({
      userId,
      fact,
      category,
      source: 'session-rollup',
      ...(vec ? { embedding: vec } : {}),
      createdAt: FieldValue.serverTimestamp(),
    });
    if (vec) existingVecs.push(vec);
    existingText.add(fact.toLowerCase());
    saved++;
  }
  return saved;
}

export interface RollupResult {
  status: 'ok' | 'skipped';
  reason?: string;
  messages?: number;
  factsSaved?: number;
  summary?: string;
}

/**
 * Roll up everything said since the last rollup. Safe to call on a timer —
 * it no-ops while a conversation is still live or when nothing new was said.
 */
export async function rollupSessions(userId: string): Promise<RollupResult> {
  const stateRef = db.collection(STATE_COLLECTION).doc(userId);
  const state = await stateRef.get();
  const lastRollupAt: Date = state.data()?.['lastRollupAt']?.toDate?.() ?? new Date(0);

  let query = db
    .collection('vera-memory')
    .where('userId', '==', userId)
    .orderBy('timestamp', 'asc')
    .limit(MAX_MESSAGES);
  if (lastRollupAt.getTime() > 0) {
    query = db
      .collection('vera-memory')
      .where('userId', '==', userId)
      .where('timestamp', '>', lastRollupAt)
      .orderBy('timestamp', 'asc')
      .limit(MAX_MESSAGES);
  }

  const snap = await query.get();
  if (snap.size < MIN_MESSAGES) return { status: 'skipped', reason: 'too few messages', messages: snap.size };

  const docs = snap.docs;
  const lastTs: Date | undefined = docs[docs.length - 1].data()['timestamp']?.toDate?.();

  // Still talking — summarizing now would split one conversation into fragments.
  if (lastTs && Date.now() - lastTs.getTime() < IDLE_GAP_MS) {
    return { status: 'skipped', reason: 'session still active', messages: snap.size };
  }

  const transcript = docs
    .map(d => {
      const data = d.data();
      const who = data['role'] === 'user' ? 'Champ' : 'Vera';
      return `${who}: ${String(data['content'] ?? '').slice(0, 1500)}`;
    })
    .join('\n');

  const rollup = await summarize(transcript);
  if (!rollup.summary) return { status: 'skipped', reason: 'summarizer returned nothing', messages: snap.size };

  // Embed the summary plus its topics — a query about "ราคาบัตร GT5" should hit
  // the session even when the prose summary never says it that way.
  const embedText = [rollup.summary, rollup.topics.join(' '), rollup.decisions.join(' ')]
    .filter(Boolean)
    .join('\n');
  let vec: number[] | null = null;
  try {
    vec = await embed(embedText);
  } catch (err: any) {
    console.warn('[rollup] summary embed failed:', err?.message ?? err);
  }

  const firstTs: Date | undefined = docs[0].data()['timestamp']?.toDate?.();

  await db.collection('vera-sessions').add({
    userId,
    summary: rollup.summary,
    topics: rollup.topics,
    decisions: rollup.decisions,
    openThreads: rollup.openThreads,
    messageCount: snap.size,
    ...(firstTs ? { from: firstTs } : {}),
    ...(lastTs ? { to: lastTs } : {}),
    ...(vec ? { embedding: vec } : {}),
    createdAt: FieldValue.serverTimestamp(),
  });

  const factsSaved = await persistFacts(userId, rollup.facts);

  await stateRef.set(
    { lastRollupAt: lastTs ?? new Date(), updatedAt: FieldValue.serverTimestamp() },
    { merge: true },
  );

  invalidateRecallCache(userId);

  return { status: 'ok', messages: snap.size, factsSaved, summary: rollup.summary };
}
