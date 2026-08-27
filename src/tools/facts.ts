import { db } from '../firebase.js';
import { FieldValue } from 'firebase-admin/firestore';
import { embed } from '../services/embedding.js';
import { invalidateRecallCache } from '../memory/recall.js';

export async function saveFact(args: Record<string, unknown>, userId: string): Promise<string> {
  const fact = String(args.fact ?? '').trim();
  const category = String(args.category ?? 'general').trim();
  if (!fact) return 'กรุณาระบุ fact ที่อยากบันทึกค่ะ';

  // Embed on write so this fact is reachable by auto-recall, and so the rollup's
  // semantic dedupe can tell it apart from facts it later extracts on its own.
  let embedding: number[] | null = null;
  try {
    embedding = await embed(fact);
  } catch (err: any) {
    console.warn('[facts] embed failed:', err?.message ?? err);
  }

  await db.collection('vera-facts').add({
    userId,
    fact,
    category,
    ...(embedding ? { embedding } : {}),
    createdAt: FieldValue.serverTimestamp(),
  });

  invalidateRecallCache(userId);

  return `บันทึก fact สำเร็จค่ะ ✅\n_"${fact}"_ [${category}]`;
}

export async function recallFacts(args: Record<string, unknown>, userId: string): Promise<string> {
  const category = String(args.category ?? '').trim();
  let query = db.collection('vera-facts').where('userId', '==', userId);
  if (category) query = (query as any).where('category', '==', category);

  const snap = await (query as any).orderBy('createdAt', 'desc').limit(20).get();
  if (snap.empty) return 'ยังไม่มี fact ที่บันทึกไว้ค่ะ';

  const lines = snap.docs.map((d: any) => {
    const data = d.data();
    return `• [${data['category'] ?? 'general'}] ${data['fact']}`;
  });

  return `*Facts ที่บันทึกไว้*\n\n${lines.join('\n')}`;
}

export async function loadFactsForPrompt(userId: string): Promise<string> {
  let snap: any;
  try {
    snap = await db.collection('vera-facts')
      .where('userId', '==', userId)
      .orderBy('createdAt', 'desc')
      .limit(15)
      .get();
  } catch {
    return ''; // index still building or no data — skip gracefully
  }

  if (snap.empty) return '';

  const lines = snap.docs.map((d: any) => {
    const data = d.data();
    return `- [${data['category'] ?? 'general'}] ${data['fact']}`;
  });

  return `\n## Long-term Memory (สิ่งที่ Vera จำเกี่ยวกับ Champ)\n${lines.join('\n')}`;
}
