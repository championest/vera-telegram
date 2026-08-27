import { db } from '../firebase.js';
import { embed, cosineSim } from '../services/embedding.js';

const SCAN_LIMIT = 1000;   // max messages to consider per query
const MIN_SCORE = 0.55;    // cosine similarity floor

interface MemoryHit {
  score: number;
  role: string;
  content: string;
  timestamp?: FirebaseFirestore.Timestamp;
}

/**
 * Rolled-up session summaries reach back past the raw-message window, which is
 * capped and eventually trimmed. Searching them alongside raw messages is what
 * lets "เราคุยเรื่องราคา GT5 ไว้ว่าไง" still work a month later.
 */
async function searchSessions(userId: string, queryVec: number[] | null, lowered: string): Promise<MemoryHit[]> {
  let docs: FirebaseFirestore.QueryDocumentSnapshot[];
  try {
    const snap = await db.collection('vera-sessions')
      .where('userId', '==', userId)
      .orderBy('createdAt', 'desc')
      .limit(200)
      .get();
    docs = snap.docs;
  } catch {
    return []; // index missing/building — raw-message search still answers
  }

  const hits: MemoryHit[] = [];
  for (const doc of docs) {
    const data = doc.data();
    const summary = String(data['summary'] ?? '');
    if (!summary) continue;

    const docEmbed = data['embedding'] as number[] | undefined;
    let score = 0;
    if (queryVec && Array.isArray(docEmbed) && docEmbed.length === queryVec.length) {
      score = cosineSim(queryVec, docEmbed);
    } else if (summary.toLowerCase().includes(lowered)) {
      score = 0.6;
    }
    if (score < MIN_SCORE) continue;

    const decisions = Array.isArray(data['decisions']) ? (data['decisions'] as string[]) : [];
    const open = Array.isArray(data['openThreads']) ? (data['openThreads'] as string[]) : [];
    const extra = [
      decisions.length ? `ตัดสินใจ: ${decisions.join(' · ')}` : '',
      open.length ? `ค้าง: ${open.join(' · ')}` : '',
    ].filter(Boolean).join(' | ');

    hits.push({
      score,
      role: 'session',
      content: extra ? `${summary} (${extra})` : summary,
      timestamp: data['createdAt'],
    });
  }
  return hits;
}

export async function searchMemory(input: Record<string, unknown>, userId: string): Promise<string> {
  const query = String(input['query'] ?? '').trim();
  const limit = Number(input['limit'] ?? 10);
  if (!query) return 'กรุณาระบุคำที่ต้องการค้น';

  let queryVec: number[] | null = null;
  try {
    queryVec = await embed(query);
  } catch (err: any) {
    console.warn('[search-memory] embed failed, falling back to substring:', err?.message);
  }

  const snap = await db.collection('vera-memory')
    .where('userId', '==', userId)
    .orderBy('timestamp', 'desc')
    .limit(SCAN_LIMIT)
    .get();

  const hits: MemoryHit[] = [];
  const lowered = query.toLowerCase();

  for (const doc of snap.docs) {
    const data = doc.data();
    const content = String(data['content'] ?? '');
    if (!content) continue;

    const docEmbed = data['embedding'] as number[] | undefined;
    let score = 0;

    if (queryVec && Array.isArray(docEmbed) && docEmbed.length === queryVec.length) {
      score = cosineSim(queryVec, docEmbed);
    } else if (content.toLowerCase().includes(lowered)) {
      // Fallback for old messages without embeddings, or when embed API failed
      score = 0.6;
    }

    if (score >= MIN_SCORE) {
      hits.push({
        score,
        role: String(data['role'] ?? ''),
        content,
        timestamp: data['timestamp'],
      });
    }
  }

  hits.push(...await searchSessions(userId, queryVec, lowered));

  hits.sort((a, b) => b.score - a.score);
  const top = hits.slice(0, limit);

  if (top.length === 0) return `ไม่พบข้อความที่ใกล้เคียง "${query}" ในความทรงจำ`;

  return top.map(h => {
    const ts = h.timestamp?.toDate().toLocaleString('th-TH', { timeZone: 'Asia/Bangkok' }) ?? '';
    const who = h.role === 'session' ? '📌 สรุปที่คุยกัน' : h.role === 'user' ? 'Champ' : 'Vera';
    return `[${ts}] (${h.score.toFixed(2)}) ${who}: ${h.content}`;
  }).join('\n');
}
