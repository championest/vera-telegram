import { db } from '../firebase.js';
import { FieldValue } from 'firebase-admin/firestore';
export async function saveChampTask(input) {
    const title = String(input['title'] ?? '').trim();
    if (!title)
        return 'ต้องระบุ title ของงาน';
    const ref = await db.collection('champ-tasks').add({
        title,
        status: input['status'] ?? 'TODO',
        priority: input['priority'] ?? 'normal',
        tags: input['tags'] ?? [],
        notes: input['notes'] ?? '',
        dueDate: input['due_date'] ?? null,
        source: 'vera-bot',
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
    });
    return `บันทึกงานแล้ว: "${title}" | Status: ${input['status'] ?? 'TODO'} | ID: ${ref.id}`;
}
export async function updateChampTask(input) {
    const taskId = String(input['task_id'] ?? '').trim();
    if (!taskId)
        return 'ต้องระบุ task_id';
    const ref = db.collection('champ-tasks').doc(taskId);
    const snap = await ref.get();
    if (!snap.exists)
        return `ไม่พบ task ID: ${taskId}`;
    const updates = { updatedAt: FieldValue.serverTimestamp() };
    if (input['status'])
        updates['status'] = input['status'];
    if (input['priority'])
        updates['priority'] = input['priority'];
    if (input['notes'])
        updates['notes'] = input['notes'];
    if (input['due_date'])
        updates['dueDate'] = input['due_date'];
    await ref.update(updates);
    return `Task ${taskId} updated. Status: ${input['status'] ?? 'unchanged'}`;
}
