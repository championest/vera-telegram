// Meta-loop proposals bridge for Telegram.
// meta-loop.mjs (on the Mac) writes `meta-loop-proposals` (status=proposed) and
// pings Champ. These let Champ review + promote them to the executor queue
// straight from Telegram — the same job meta-approve.mjs does on the CLI.
import { db } from '../firebase.js';
import { FieldValue } from 'firebase-admin/firestore';

interface Proposal { id: string; n: number; title: string; task: string; project?: string; source?: string; weight?: number; }

// Same ordering the CLI uses (weight desc) so the numbers Champ sees are stable.
async function openProposals(): Promise<Proposal[]> {
  const snap = await db.collection('meta-loop-proposals').where('status', '==', 'proposed').get();
  const rows = snap.docs.map((d) => ({ id: d.id, data: d.data() as Record<string, unknown> }));
  rows.sort((a, b) => Number(b.data['weight'] ?? 0) - Number(a.data['weight'] ?? 0));
  return rows.map((r, i) => ({
    id: r.id, n: i + 1,
    title: String(r.data['title'] ?? r.id), task: String(r.data['task'] ?? ''),
    project: r.data['project'] ? String(r.data['project']) : undefined,
    source: r.data['source'] ? String(r.data['source']) : undefined,
    weight: Number(r.data['weight'] ?? 0),
  }));
}

export async function listProposals(): Promise<string> {
  const ps = await openProposals();
  if (!ps.length) return 'ไม่มีงานค้างรออนุมัติค่ะ ✅ (meta-loop ยังไม่เจออะไรใหม่)';
  const lines = ['*งานค้างรออนุมัติ* (meta-loop)\n'];
  for (const p of ps) lines.push(`*${p.n}.* ${p.title}\n   \`${p.task.slice(0, 120)}\``);
  lines.push('\nสั่งรัน: `/queue 1 3` · ทิ้ง: `/dismiss 2`');
  return lines.join('\n');
}

function parseNums(arg: string): number[] {
  return (arg || '').split(/[\s,]+/).map(Number).filter((n) => Number.isInteger(n) && n > 0);
}

export async function queueProposals(arg: string): Promise<string> {
  const nums = parseNums(arg);
  if (!nums.length) return 'ระบุเลขงานที่จะสั่งรันด้วยค่ะ เช่น `/queue 1 3`';
  const ps = await openProposals();
  const chosen = ps.filter((p) => nums.includes(p.n));
  if (!chosen.length) return 'ไม่พบเลขงานที่ตรงกับรายการปัจจุบันค่ะ ลอง `/proposals` ดูใหม่';
  const done: string[] = [];
  for (const p of chosen) {
    await db.collection('claude-tasks').add({
      task: p.task, project: p.project ?? null, status: 'pending', priority: p.weight ?? 1,
      source: 'meta-loop', proposal_id: p.id, created_at: FieldValue.serverTimestamp(),
    });
    await db.collection('meta-loop-proposals').doc(p.id).update({ status: 'queued' });
    done.push(`✓ #${p.n} ${p.title}`);
  }
  return `ส่งเข้าคิว executor แล้วค่ะ ✅\n${done.join('\n')}\nเสร็จแล้ว Vera จะส่งผลมาให้ในแชทนี้ค่ะ`;
}

export async function dismissProposals(arg: string): Promise<string> {
  const nums = parseNums(arg);
  if (!nums.length) return 'ระบุเลขงานที่จะทิ้งด้วยค่ะ เช่น `/dismiss 2`';
  const ps = await openProposals();
  const chosen = ps.filter((p) => nums.includes(p.n));
  if (!chosen.length) return 'ไม่พบเลขงานที่ตรงกับรายการปัจจุบันค่ะ';
  for (const p of chosen) await db.collection('meta-loop-proposals').doc(p.id).update({ status: 'dismissed' });
  return `ทิ้งแล้วค่ะ 🗑️\n${chosen.map((p) => `✗ #${p.n} ${p.title}`).join('\n')}`;
}
