import { db } from '../firebase.js';
import { FieldValue } from 'firebase-admin/firestore';
export async function logFinance(input) {
    const label = String(input['label'] ?? '').trim();
    const amount = Number(input['amount'] ?? 0);
    if (!label)
        return 'ต้องระบุ label';
    if (!amount)
        return 'ต้องระบุ amount';
    const now = new Date();
    const month = String(input['month'] ?? `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`);
    const ref = await db.collection('champ-finance').add({
        type: input['type'] ?? 'expense',
        label,
        amount,
        currency: 'THB',
        month,
        category: input['category'] ?? 'other',
        notes: input['notes'] ?? '',
        createdAt: FieldValue.serverTimestamp(),
    });
    const typeLabel = input['type'] === 'income' ? 'รายรับ' : input['type'] === 'goal' ? 'เป้าหมาย' : 'รายจ่าย';
    return `บันทึก${typeLabel}แล้ว: "${label}" ${amount.toLocaleString()} บาท | เดือน ${month} | ID: ${ref.id}`;
}
