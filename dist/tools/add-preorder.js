import { db } from '../firebase.js';
import { FieldValue } from 'firebase-admin/firestore';
export async function addPreorder(input) {
    const customerName = String(input['customer_name'] ?? '').trim();
    const items = String(input['items'] ?? '').trim();
    if (!customerName || !items)
        return 'ต้องระบุชื่อลูกค้าและรายการสินค้า';
    const depositPaid = Number(input['deposit_paid'] ?? 0);
    const totalPrice = Number(input['total_price'] ?? 0);
    const ref = await db.collection('champ-preorders').add({
        customerName,
        phone: String(input['phone'] ?? '').trim(),
        items,
        depositPaid,
        totalPrice,
        expectedDate: String(input['expected_date'] ?? '').trim(),
        status: 'pending',
        notes: String(input['notes'] ?? '').trim(),
        createdAt: FieldValue.serverTimestamp(),
    });
    const remaining = totalPrice - depositPaid;
    return [
        `บันทึก pre-order แล้ว ✅`,
        `ลูกค้า: ${customerName}`,
        `สินค้า: ${items}`,
        totalPrice > 0 ? `มัดจำ: ฿${depositPaid.toLocaleString('th-TH')} | ค้างชำระ: ฿${remaining.toLocaleString('th-TH')}` : '',
        input['expected_date'] ? `คาดได้รับ: ${input['expected_date']}` : '',
        `ID: ${ref.id}`,
    ].filter(Boolean).join('\n');
}
