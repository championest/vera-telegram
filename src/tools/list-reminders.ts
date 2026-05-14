import { db } from '../firebase.js';
import type { Query, CollectionReference, DocumentData } from 'firebase-admin/firestore';

export async function listReminders(input: Record<string, unknown>, userId: string): Promise<string> {
  const includePast = (input['include_past'] as boolean) ?? false;

  let q: Query<DocumentData> = (db.collection('vera-reminders') as CollectionReference<DocumentData>)
    .where('userId', '==', userId);
  if (!includePast) {
    q = q.where('status', '==', 'pending');
  }

  const snap = await q.orderBy('remindAt', 'asc').get();
  if (snap.empty) return 'ไม่มี reminder ค่ะ';

  const lines = snap.docs.map(d => {
    const r = d.data();
    const time = (r['remindAt'] as FirebaseFirestore.Timestamp)
      .toDate()
      .toLocaleString('th-TH', { timeZone: 'Asia/Bangkok' });
    const repeat = r['repeat'] !== 'none' ? ` (${r['repeat']})` : '';
    return `• ${time}${repeat} — ${r['message']} [${r['status']}]`;
  });
  return lines.join('\n');
}
