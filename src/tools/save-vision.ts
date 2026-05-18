import { db } from '../firebase.js';
import { FieldValue } from 'firebase-admin/firestore';

export async function saveVision(input: Record<string, unknown>): Promise<string> {
  const title = String(input['title'] ?? '').trim();
  if (!title) return 'ต้องระบุ title';

  const ref = await db.collection('champ-vision').add({
    title,
    body: input['body'] ?? '',
    category: input['category'] ?? 'personal',
    horizon: input['horizon'] ?? '1year',
    imageUrl: input['image_url'] ?? null,
    createdAt: FieldValue.serverTimestamp(),
  });

  return `บันทึก vision แล้ว: "${title}" | Horizon: ${input['horizon'] ?? '1year'} | ID: ${ref.id}`;
}
