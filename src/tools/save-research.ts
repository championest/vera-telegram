import { db } from '../firebase.js';
import { FieldValue } from 'firebase-admin/firestore';

interface Finding {
  point: string;
  confidence: 'verified' | 'uncertain' | 'conflicting';
  source_url?: string;
}

interface Source {
  title: string;
  url: string;
}

export async function saveResearch(args: Record<string, unknown>): Promise<string> {
  const topic = String(args.topic ?? '');
  const summary = String(args.summary ?? '');
  const findings = (args.findings as Finding[]) ?? [];
  const sources = (args.sources as Source[]) ?? [];
  const tags = (args.tags as string[]) ?? [];

  if (!topic || !summary) return 'กรุณาระบุ topic และ summary';

  const ref = await db.collection('vera-research').add({
    topic,
    summary,
    findings,
    sources,
    tags,
    createdAt: FieldValue.serverTimestamp(),
  });

  return `บันทึก research สำเร็จค่ะ ✅\nหัวข้อ: ${topic}\nID: ${ref.id}\nFindings: ${findings.length} รายการ | Sources: ${sources.length}`;
}

export async function listResearch(args: Record<string, unknown>): Promise<string> {
  const limit = Number(args.limit ?? 10);

  const snap = await db.collection('vera-research')
    .orderBy('createdAt', 'desc')
    .limit(limit)
    .get();

  if (snap.empty) return 'ยังไม่มีงาน research ที่บันทึกไว้ค่ะ';

  const lines = snap.docs.map(d => {
    const r = d.data();
    const date = r['createdAt']?.toDate?.()?.toLocaleDateString('th-TH', { timeZone: 'Asia/Bangkok' }) ?? '';
    return `• *${r['topic']}* (${date})\n  ID: \`${d.id}\``;
  });

  return `*📚 Research ที่บันทึกไว้ (${snap.docs.length})*\n\n${lines.join('\n\n')}`;
}

export async function getResearch(args: Record<string, unknown>): Promise<string> {
  const id = String(args.id ?? '');
  if (!id) return 'กรุณาระบุ ID';

  const doc = await db.collection('vera-research').doc(id).get();
  if (!doc.exists) return `ไม่พบ research ID: ${id}`;

  const r = doc.data()!;
  const findings = (r['findings'] as Finding[]) ?? [];
  const sources = (r['sources'] as Source[]) ?? [];

  const LABEL: Record<string, string> = {
    verified: '✅',
    uncertain: '⚠️',
    conflicting: '❌',
  };

  const lines = [
    `📚 *${r['topic']}*\n`,
    `*สรุป:*\n${r['summary']}\n`,
  ];

  if (findings.length > 0) {
    lines.push('*Findings:*');
    findings.forEach(f => {
      lines.push(`${LABEL[f.confidence] ?? '•'} ${f.point}${f.source_url ? `\n  🔗 ${f.source_url}` : ''}`);
    });
    lines.push('');
  }

  if (sources.length > 0) {
    lines.push('*Sources:*');
    sources.forEach(s => lines.push(`• [${s.title}](${s.url})`));
  }

  return lines.join('\n');
}
