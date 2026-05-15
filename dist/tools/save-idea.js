import { db } from '../firebase.js';
import { FieldValue } from 'firebase-admin/firestore';
export async function saveIdea(input) {
    const ref = await db.collection('vera-ideas').add({
        title: input['title'],
        body: input['body'],
        tags: input['tags'] ?? [],
        createdAt: FieldValue.serverTimestamp(),
    });
    return `Idea saved. ID: ${ref.id}`;
}
