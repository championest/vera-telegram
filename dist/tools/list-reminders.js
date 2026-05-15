import { db } from '../firebase.js';
export async function listReminders(input, userId) {
    const includePast = input['include_past'] ?? false;
    let q = db.collection('vera-reminders')
        .where('userId', '==', userId);
    if (!includePast) {
        q = q.where('status', '==', 'pending');
    }
    const snap = await q.orderBy('remindAt', 'asc').get();
    if (snap.empty)
        return 'ไม่มี reminder ค่ะ';
    const lines = snap.docs.map(d => {
        const r = d.data();
        const time = r['remindAt']
            .toDate()
            .toLocaleString('th-TH', { timeZone: 'Asia/Bangkok' });
        const repeat = r['repeat'] !== 'none' ? ` (${r['repeat']})` : '';
        return `• ${time}${repeat} — ${r['message']} [${r['status']}]`;
    });
    return lines.join('\n');
}
