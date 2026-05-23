/**
 * Claude Code → Vera bridge memory.
 *
 * Hybrid storage:
 *   1. In-memory ring buffer (fast read, used by Vera's context queries)
 *   2. Firestore `claude-conversations` collection (durable backup, survives restart)
 *
 * Stop hook on Mac side ALSO writes Firestore directly as fallback —
 * so if Railway is asleep / endpoint fails, the data still lands.
 * On boot we re-hydrate the in-memory buffer from Firestore.
 */

import { db } from '../firebase.js';
import { FieldValue } from 'firebase-admin/firestore';

export interface ClaudeSyncEntry {
  user_msg: string;
  claude_summary: string;
  project: string;
  cwd: string;
  session_id: string;
  timestamp: string;
  source: 'claude-code';
}

const MAX_BUFFER = 30;
const buffer: ClaudeSyncEntry[] = [];
let hydrated = false;

export async function recordClaudeSync(entry: ClaudeSyncEntry): Promise<void> {
  buffer.unshift(entry);
  if (buffer.length > MAX_BUFFER) buffer.length = MAX_BUFFER;

  // Persist Firestore (idempotency vs stop-hook's direct write: both land,
  // duplicates are acceptable — query side dedupes by timestamp+user_msg)
  try {
    await db.collection('claude-conversations').add({
      ...entry,
      synced_to_vera: true,
      received_at: FieldValue.serverTimestamp(),
    });
  } catch (err) {
    console.warn('[claude-sync] firestore write failed:', (err as Error)?.message);
  }
}

export async function getRecentClaudeContext(limit = 7): Promise<ClaudeSyncEntry[]> {
  if (!hydrated) {
    await hydrateFromFirestore();
    hydrated = true;
  }
  return buffer.slice(0, limit);
}

async function hydrateFromFirestore(): Promise<void> {
  try {
    const snap = await db.collection('claude-conversations')
      .orderBy('timestamp', 'desc')
      .limit(MAX_BUFFER)
      .get();
    for (const doc of snap.docs) {
      const d = doc.data();
      buffer.push({
        user_msg: String(d['user_msg'] ?? ''),
        claude_summary: String(d['claude_summary'] ?? ''),
        project: String(d['project'] ?? ''),
        cwd: String(d['cwd'] ?? ''),
        session_id: String(d['session_id'] ?? ''),
        timestamp: String(d['timestamp'] ?? ''),
        source: 'claude-code',
      });
    }
  } catch (err) {
    console.warn('[claude-sync] hydrate failed:', (err as Error)?.message);
  }
}
