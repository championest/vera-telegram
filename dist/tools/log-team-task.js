import { db } from '../firebase.js';
import { FieldValue } from 'firebase-admin/firestore';
// Map legacy codenames → current team roster so old dispatches still route correctly.
const MEMBER_ALIASES = {
    kai: 'cody', nova: 'coco', sam: 'scout', jade: 'spoty',
    iris: 'memo', pixel: 'arty', rena: 'amy', max: 'pi', sage: 'book', flux: 'spike',
};
function normalizeMember(raw) {
    const m = String(raw ?? '').trim().toLowerCase();
    return MEMBER_ALIASES[m] ?? m;
}
export async function logTeamTask(input, userId) {
    const taskId = String(input['task_id'] ?? '').trim();
    if (taskId) {
        const ref = db.collection('team-workflow').doc(taskId);
        const snap = await ref.get();
        if (!snap.exists)
            return `ไม่พบ task ID: ${taskId}`;
        const updates = { updatedAt: FieldValue.serverTimestamp(), updatedBy: userId };
        if (input['status'])
            updates['status'] = input['status'];
        if (input['notes'])
            updates['notes'] = input['notes'];
        if (input['handoff_to'])
            updates['handoff_to'] = input['handoff_to'];
        if (input['priority'])
            updates['priority'] = input['priority'];
        await ref.update(updates);
        return `Task ${taskId} updated. Status: ${input['status'] ?? 'unchanged'}`;
    }
    const member = normalizeMember(input['member']);
    const today = new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Bangkok' });
    const ref = await db.collection('team-workflow').add({
        member,
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
    return `Task logged. Member: ${member}, Status: ${input['status'] ?? 'TODO'}. ID: ${ref.id}`;
}
