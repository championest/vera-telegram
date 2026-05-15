import { db } from '../firebase.js';
import { FieldValue } from 'firebase-admin/firestore';
export async function saveFact(args, userId) {
    const fact = String(args.fact ?? '').trim();
    const category = String(args.category ?? 'general').trim();
    if (!fact)
        return 'กรุณาระบุ fact ที่อยากบันทึกค่ะ';
    await db.collection('vera-facts').add({
        userId,
        fact,
        category,
        createdAt: FieldValue.serverTimestamp(),
    });
    return `บันทึก fact สำเร็จค่ะ ✅\n_"${fact}"_ [${category}]`;
}
export async function recallFacts(args, userId) {
    const category = String(args.category ?? '').trim();
    let query = db.collection('vera-facts').where('userId', '==', userId);
    if (category)
        query = query.where('category', '==', category);
    const snap = await query.orderBy('createdAt', 'desc').limit(20).get();
    if (snap.empty)
        return 'ยังไม่มี fact ที่บันทึกไว้ค่ะ';
    const lines = snap.docs.map((d) => {
        const data = d.data();
        return `• [${data['category'] ?? 'general'}] ${data['fact']}`;
    });
    return `*Facts ที่บันทึกไว้*\n\n${lines.join('\n')}`;
}
export async function loadFactsForPrompt(userId) {
    const snap = await db.collection('vera-facts')
        .where('userId', '==', userId)
        .orderBy('createdAt', 'desc')
        .limit(15)
        .get();
    if (snap.empty)
        return '';
    const lines = snap.docs.map(d => {
        const data = d.data();
        return `- [${data['category'] ?? 'general'}] ${data['fact']}`;
    });
    return `\n## Long-term Memory (สิ่งที่ Vera จำเกี่ยวกับ Champ)\n${lines.join('\n')}`;
}
