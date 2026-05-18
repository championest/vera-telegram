import { db } from '../firebase.js';
import { FieldValue } from 'firebase-admin/firestore';

export async function quickSale(input: Record<string, unknown>): Promise<string> {
  const itemName = String(input['item_name'] ?? '').trim();
  const qty      = Math.max(1, Number(input['qty'] ?? 1));
  if (!itemName) return 'ต้องระบุชื่อสินค้า';

  // Find matching inventory item (case-insensitive contains)
  const snap = await db.collection('champ-inventory').get();
  const matches = snap.docs.filter(d => {
    const name = String(d.data()['name'] ?? '').toLowerCase();
    return name.includes(itemName.toLowerCase());
  });

  if (matches.length === 0) return `ไม่พบสินค้า "${itemName}" ใน Inventory`;
  if (matches.length > 1) {
    const names = matches.map(d => d.data()['name']).join(', ');
    return `พบหลายรายการ: ${names}\nกรุณาระบุชื่อให้ชัดขึ้น`;
  }

  const itemDoc = matches[0];
  const item = itemDoc.data();
  const currentQty = Number(item['qty'] ?? 0);
  if (currentQty < qty) {
    return `สต็อกไม่พอ — "${item['name']}" เหลือ ${currentQty} ชิ้น แต่ขอขาย ${qty}`;
  }

  const pricePerUnit = Number(input['price'] ?? item['pricePerUnit'] ?? 0);
  const totalAmount  = pricePerUnit * qty;
  const newQty       = currentQty - qty;

  await itemDoc.ref.update({ qty: newQty, updatedAt: FieldValue.serverTimestamp() });

  const month = new Date().toISOString().slice(0, 7);
  await db.collection('champ-finance').add({
    type:      'income',
    label:     `ขาย ${item['name']}${qty > 1 ? ` x${qty}` : ''}`,
    amount:    totalAmount,
    currency:  'THB',
    month,
    category:  item['game'] === 'Pokemon' ? 'ขาย Pokemon' : item['game'] === 'Lorcana' ? 'ขาย Lorcana' : 'ขายสินค้า',
    notes:     `quick_sale via Vera`,
    createdAt: FieldValue.serverTimestamp(),
  });

  return [
    `ขาย "${item['name']}" x${qty} ✅`,
    `รายรับ: ฿${totalAmount.toLocaleString('th-TH')}`,
    `สต็อกเหลือ: ${newQty} ชิ้น${newQty <= Number(item['threshold'] ?? 5) ? ' ⚠️ ใกล้หมด' : ''}`,
    `บันทึกลง Finance เดือน ${month} แล้ว`,
  ].join('\n');
}
