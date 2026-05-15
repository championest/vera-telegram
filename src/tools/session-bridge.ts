import { db } from '../firebase.js';
import admin from 'firebase-admin';

const NOISE_PATTERNS = ['pre-push gate', 'Claude response complete', 'Session started', 'Auto-logged'];

export async function getSessionContext(args: Record<string, unknown>): Promise<string> {
  const perSession = Number(args.limit ?? 10);

  const snap = await db.collection('team-workflow')
    .orderBy('timestamp', 'desc')
    .limit(150)
    .get();

  if (snap.empty) return 'ยังไม่มี session log จากคอมค่ะ';

  // Filter noise, group by session date
  const bySession: Record<string, FirebaseFirestore.DocumentData[]> = {};
  for (const doc of snap.docs) {
    const e = doc.data();
    const task = String(e['task'] ?? e['action'] ?? '');
    if (NOISE_PATTERNS.some(p => task.includes(p))) continue;

    const key = e['session'] ?? 'unknown';
    if (!bySession[key]) bySession[key] = [];
    bySession[key].push(e);
  }

  const sessions = Object.keys(bySession).sort().reverse().slice(0, 3);
  if (sessions.length === 0) return 'ไม่มี session log ที่น่าสนใจค่ะ';

  const lines: string[] = ['*Session log จากคอม (ล่าสุด)*\n'];

  for (const session of sessions) {
    lines.push(`*📅 ${session}*`);
    for (const e of bySession[session].slice(0, perSession)) {
      const status = String(e['status'] ?? '');
      const member = String(e['member'] ?? e['actor'] ?? '');
      const task = String(e['task'] ?? e['action'] ?? '');
      const emoji = status === 'DONE' ? '✅' : status === 'BLOCKED' ? '🚫' : status === 'HANDOFF' ? '🔀' : '⏳';
      lines.push(`  ${emoji} *${member}*: ${task}`);
    }
    lines.push('');
  }

  return lines.join('\n');
}

export async function readAceNotes(args: Record<string, unknown>): Promise<string> {
  const limit = Number(args.limit ?? 10);
  const snap = await db.collection('claude-notes')
    .orderBy('createdAt', 'desc')
    .limit(limit * 2)
    .get();

  if (snap.empty) return 'ไม่มีโน้ตใน claude-notes ค่ะ';

  const notes = snap.docs
    .map(d => ({ id: d.id, ...d.data() } as Record<string, unknown>))
    .filter(n => n['source'] !== 'vera-telegram')
    .slice(0, limit);

  if (notes.length === 0) return 'ไม่มีโน้ตจากนอก Vera ค่ะ';

  const lines = notes.map(n => {
    const status = n['read'] ? '✅ อ่านแล้ว' : '📬 ยังไม่ได้อ่าน';
    const topic = n['topic'] ? `[${n['topic']}]` : '';
    return `${status} ${topic} ${n['note']}`;
  });

  return `*โน้ตสำหรับ Ace*\n\n${lines.join('\n\n')}`;
}

export async function writeNoteToClaude(args: Record<string, unknown>): Promise<string> {
  const note = String(args.note ?? '');
  const topic = String(args.topic ?? 'general');
  if (!note) return 'กรุณาระบุ note ค่ะ';

  await db.collection('claude-notes').add({
    note,
    topic,
    source: 'vera-telegram',
    read: false,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  });

  return `บันทึกโน้ตให้คอมสำเร็จค่ะ ✅\nคุณ Champ เปิดคอมครั้งต่อไป Ace จะอ่านโน้ตนี้ให้ค่ะ\n\n📝 _"${note}"_`;
}
