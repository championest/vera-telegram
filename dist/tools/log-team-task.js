import { db } from '../firebase.js';
import { FieldValue } from 'firebase-admin/firestore';
export async function logTeamTask(input, userId) {
    const today = new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Bangkok' });
    const ref = await db.collection('team-workflow').add({
        member: input['member'],
        task: input['task'],
        status: input['status'] ?? 'TODO',
        notes: input['notes'] ?? '',
        handoff_to: input['handoff_to'] ?? '',
        priority: input['priority'] ?? 'normal',
        session: today,
        source: 'vera-bot',
        dispatchedBy: userId,
        timestamp: FieldValue.serverTimestamp(),
    });
    return `Task logged. Member: ${input['member']}, Status: ${input['status'] ?? 'TODO'}. ID: ${ref.id}`;
}
