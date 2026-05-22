import { db } from '../firebase.js';
import { FieldValue } from 'firebase-admin/firestore';
import { config } from '../config.js';
import { embed } from '../services/embedding.js';

export type MessageParam = { role: 'user' | 'assistant'; content: string };

const MAX = parseInt(config.MAX_MEMORY_MESSAGES, 10);

export async function loadHistory(userId: string): Promise<MessageParam[]> {
  const snap = await db.collection('vera-memory')
    .where('userId', '==', userId)
    .orderBy('timestamp', 'asc')
    .limitToLast(MAX)
    .get();

  return snap.docs.map(d => ({
    role: d.data()['role'] as 'user' | 'assistant',
    content: d.data()['content'] as string,
  }));
}

export async function appendMessage(
  userId: string,
  role: 'user' | 'assistant',
  content: string
): Promise<void> {
  const ref = await db.collection('vera-memory').add({
    userId,
    role,
    content,
    timestamp: FieldValue.serverTimestamp(),
  });

  // Fire-and-forget embedding so write latency stays low
  embed(content)
    .then(vec => ref.update({ embedding: vec }))
    .catch(err => console.warn('[memory] embed failed:', err?.message ?? err));

  // Trim oldest beyond MAX (only deletes from short-term window; semantic search reads all)
  const snap = await db.collection('vera-memory')
    .where('userId', '==', userId)
    .orderBy('timestamp', 'asc')
    .get();

  if (snap.size > MAX * 50) {
    // Hard cap to keep collection from growing unbounded — keep most recent MAX*50
    const toDelete = snap.docs.slice(0, snap.size - MAX * 50);
    const batch = db.batch();
    toDelete.forEach(d => batch.delete(d.ref));
    await batch.commit();
  }
}
