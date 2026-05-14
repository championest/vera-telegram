import { db } from '../firebase.js';
import { FieldValue } from 'firebase-admin/firestore';

export async function setReminder(input: Record<string, unknown>, userId: string): Promise<string> {
  const remindAt = new Date(input['remind_at'] as string);
  if (isNaN(remindAt.getTime())) {
    return 'Invalid datetime format. Please provide an ISO 8601 string.';
  }
  const ref = await db.collection('vera-reminders').add({
    userId,
    message: input['message'],
    remindAt,
    repeat: input['repeat'] ?? 'none',
    status: 'pending',
    createdAt: FieldValue.serverTimestamp(),
  });
  const localTime = remindAt.toLocaleString('th-TH', { timeZone: 'Asia/Bangkok' });
  return `Reminder set for ${localTime}. ID: ${ref.id}`;
}
