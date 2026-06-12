import { db } from '../firebase.js';
import { FieldValue } from 'firebase-admin/firestore';

const HEARTBEAT_STALE_MS = 2 * 60_000;

async function executorOnline(): Promise<boolean> {
  try {
    const hb = await db.collection('claude-executor').doc('heartbeat').get();
    const lastSeen = hb.data()?.['last_seen']?.toDate?.()?.getTime() ?? 0;
    return Date.now() - lastSeen < HEARTBEAT_STALE_MS;
  } catch {
    return false;
  }
}

export async function dispatchClaudeTask(input: Record<string, unknown>): Promise<string> {
  const task = String(input['task'] ?? '').trim();
  if (!task) return 'ต้องระบุ task ที่จะให้ Claude Code ทำค่ะ';
  const project = String(input['project'] ?? '').trim();

  const ref = await db.collection('claude-tasks').add({
    task,
    project: project || null,
    status: 'pending',
    source: 'vera',
    created_at: FieldValue.serverTimestamp(),
  });

  const online = await executorOnline();
  const where = project ? ` (project: ${project})` : '';
  if (online) {
    return `ส่งงานให้ Claude Code บนเครื่อง Mac แล้วค่ะ ✅${where}\nTask ID: ${ref.id}\nเครื่องออนไลน์อยู่ — ปกติเริ่มทำภายใน ~20 วินาที เสร็จแล้ว Vera จะส่งผลมาในแชทนี้เลยค่ะ`;
  }
  return `คิวงานบันทึกแล้วค่ะ ⏳${where}\nTask ID: ${ref.id}\n⚠️ แต่ตอนนี้เครื่อง Mac ดูออฟไลน์อยู่ (ไม่เห็น heartbeat) — งานจะเริ่มทันทีที่เครื่องกลับมาออนไลน์ค่ะ`;
}

export async function checkClaudeTasks(input: Record<string, unknown>): Promise<string> {
  const limit = Math.min(Number(input['limit'] ?? 5), 15);
  const snap = await db.collection('claude-tasks').orderBy('created_at', 'desc').limit(limit).get();
  if (snap.empty) return 'ยังไม่มีงานที่เคยสั่งผ่าน remote executor ค่ะ';

  const online = await executorOnline();
  const lines: string[] = [`*Remote tasks ล่าสุด* (เครื่อง Mac: ${online ? '🟢 online' : '🔴 offline'})\n`];
  for (const d of snap.docs) {
    const t = d.data();
    const emoji =
      t['status'] === 'done' ? '✅' : t['status'] === 'failed' ? '❌' : t['status'] === 'running' ? '⚙️' : '⏳';
    const proj = t['project'] ? ` [${t['project']}]` : '';
    lines.push(`${emoji} ${String(t['task']).slice(0, 90)}${proj} — ${t['status']}`);
    if (t['status'] === 'done' && t['result']) {
      lines.push(`   ↳ ${String(t['result']).slice(0, 200)}`);
    }
  }
  return lines.join('\n');
}
