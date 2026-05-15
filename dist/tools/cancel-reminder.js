import { db } from '../firebase.js';
import { FieldValue } from 'firebase-admin/firestore';
export async function cancelReminder(args, _userId) {
    const reminderId = String(args.reminder_id ?? '').trim();
    if (!reminderId)
        return 'กรุณาระบุ reminder_id ค่ะ';
    const ref = db.collection('vera-reminders').doc(reminderId);
    const snap = await ref.get();
    if (!snap.exists)
        return `ไม่พบ reminder ID: ${reminderId}`;
    await ref.update({ status: 'cancelled', cancelledAt: FieldValue.serverTimestamp() });
    return `ยกเลิก reminder สำเร็จค่ะ ✅`;
}
