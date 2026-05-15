import { db } from '../firebase.js';
import { Timestamp } from 'firebase-admin/firestore';

export async function snoozeReminder(args: Record<string, unknown>, _userId: string): Promise<string> {
  const reminderId = String(args.reminder_id ?? '').trim();
  const minutes = Number(args.minutes ?? 60);
  if (!reminderId) return 'กรุณาระบุ reminder_id ค่ะ';

  const ref = db.collection('vera-reminders').doc(reminderId);
  const snap = await ref.get();
  if (!snap.exists) return `ไม่พบ reminder ID: ${reminderId}`;

  const snoozeUntil = new Date(Date.now() + minutes * 60 * 1000);
  await ref.update({ status: 'pending', remindAt: Timestamp.fromDate(snoozeUntil) });

  const timeStr = snoozeUntil.toLocaleTimeString('th-TH', { timeZone: 'Asia/Bangkok', hour: '2-digit', minute: '2-digit' });
  return `Snooze แล้วค่ะ — จะเตือนอีกครั้ง ${minutes} นาที (${timeStr}) ✅`;
}
