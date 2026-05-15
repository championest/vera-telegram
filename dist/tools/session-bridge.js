import { db } from '../firebase.js';
import admin from 'firebase-admin';
export async function getSessionContext(args) {
    const limit = Number(args.limit ?? 5);
    // Read recent Flux logs from team-workflow (written by Claude Code sessions)
    const snap = await db.collection('team-workflow')
        .orderBy('timestamp', 'desc')
        .limit(limit * 3)
        .get();
    if (snap.empty)
        return 'ยังไม่มี session log จากคอมค่ะ';
    const entries = snap.docs.map(d => d.data());
    // Group by session date
    const bySession = {};
    for (const e of entries) {
        const key = e['session'] ?? 'unknown';
        if (!bySession[key])
            bySession[key] = [];
        bySession[key].push(e);
    }
    const sessions = Object.keys(bySession).sort().reverse().slice(0, 3);
    const lines = ['*Session log จากคอม (ล่าสุด)*\n'];
    for (const session of sessions) {
        lines.push(`*📅 ${session}*`);
        for (const e of bySession[session].slice(0, limit)) {
            const status = e['status'] ?? '';
            const member = e['member'] ?? e['actor'] ?? '';
            const task = e['task'] ?? e['action'] ?? '';
            const emoji = status === 'DONE' ? '✅' : status === 'BLOCKED' ? '🚫' : '⏳';
            lines.push(`  ${emoji} *${member}*: ${task}`);
        }
        lines.push('');
    }
    return lines.join('\n');
}
export async function writeNoteToClaude(args) {
    const note = String(args.note ?? '');
    const topic = String(args.topic ?? 'general');
    if (!note)
        return 'กรุณาระบุ note ค่ะ';
    await db.collection('claude-notes').add({
        note,
        topic,
        source: 'vera-telegram',
        read: false,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    return `บันทึกโน้ตให้คอมสำเร็จค่ะ ✅\nคุณ Champ เปิดคอมครั้งต่อไป Ace จะอ่านโน้ตนี้ให้ค่ะ\n\n📝 _"${note}"_`;
}
