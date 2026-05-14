import { db } from '../firebase.js';
import { FieldValue } from 'firebase-admin/firestore';
import { config } from '../config.js';
import type Anthropic from '@anthropic-ai/sdk';

const MAX = parseInt(config.MAX_MEMORY_MESSAGES, 10);

export async function loadHistory(userId: string): Promise<Anthropic.MessageParam[]> {
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
  await db.collection('vera-memory').add({
    userId,
    role,
    content,
    timestamp: FieldValue.serverTimestamp(),
  });

  const snap = await db.collection('vera-memory')
    .where('userId', '==', userId)
    .orderBy('timestamp', 'asc')
    .get();

  if (snap.size > MAX) {
    const toDelete = snap.docs.slice(0, snap.size - MAX);
    const batch = db.batch();
    toDelete.forEach(d => batch.delete(d.ref));
    await batch.commit();
  }
}
