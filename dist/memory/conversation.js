import { db } from '../firebase.js';
import { FieldValue } from 'firebase-admin/firestore';
import { config } from '../config.js';
const MAX = parseInt(config.MAX_MEMORY_MESSAGES, 10);
export async function loadHistory(userId) {
    const snap = await db.collection('vera-memory')
        .where('userId', '==', userId)
        .orderBy('timestamp', 'asc')
        .limitToLast(MAX)
        .get();
    return snap.docs.map(d => ({
        role: d.data()['role'],
        content: d.data()['content'],
    }));
}
export async function appendMessage(userId, role, content) {
    await db.collection('vera-memory').add({
        userId,
        role,
        content,
        timestamp: FieldValue.serverTimestamp(),
    });
    const snap = await db.collection('vera-memory')
        .where('userId', '==', userId)
        .orderBy('timestamp', 'asc')
        .get();
    if (snap.size > MAX) {
        const toDelete = snap.docs.slice(0, snap.size - MAX);
        const batch = db.batch();
        toDelete.forEach(d => batch.delete(d.ref));
        await batch.commit();
    }
}
