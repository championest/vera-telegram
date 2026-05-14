import { db } from '../firebase.js';

export async function searchMemory(input: Record<string, unknown>, userId: string): Promise<string> {
  const query = (input['query'] as string).toLowerCase();
  const limit = (input['limit'] as number) ?? 10;

  const snap = await db.collection('vera-memory')
    .where('userId', '==', userId)
    .orderBy('timestamp', 'desc')
    .limit(100)
    .get();

  const matches = snap.docs
    .map(d => d.data())
    .filter(m => (m['content'] as string)?.toLowerCase().includes(query))
    .slice(0, limit);

  if (matches.length === 0) return `ไม่พบข้อความที่มีคำว่า "${query}" ในอดีตค่ะ`;

  return matches.map(m => {
    const ts = (m['timestamp'] as FirebaseFirestore.Timestamp | undefined)
      ?.toDate()
      .toLocaleString('th-TH', { timeZone: 'Asia/Bangkok' }) ?? '';
    const role = m['role'] === 'user' ? 'Champ' : 'Vera';
    return `[${ts}] ${role}: ${m['content']}`;
  }).join('\n');
}
