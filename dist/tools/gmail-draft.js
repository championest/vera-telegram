import { google } from 'googleapis';
import { getAuthedClient, isConnected } from '../services/google-auth.js';
const NOT_CONNECTED = 'ยังไม่ได้เชื่อม Google ค่ะ — ส่ง /connect เพื่อเริ่มต้น';
export async function gmailCreateDraft(args) {
    if (!await isConnected())
        return NOT_CONNECTED;
    const auth = await getAuthedClient();
    if (!auth)
        return NOT_CONNECTED;
    const gmail = google.gmail({ version: 'v1', auth });
    const to = String(args.to ?? '');
    const subject = String(args.subject ?? '');
    const body = String(args.body ?? '');
    if (!subject || !body)
        return 'กรุณาระบุ subject และ body ค่ะ';
    const headers = `${to ? `To: ${to}\n` : ''}Subject: ${subject}\nContent-Type: text/plain; charset=utf-8\n`;
    const raw = Buffer.from(headers + '\n' + body)
        .toString('base64')
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/, '');
    const res = await gmail.users.drafts.create({
        userId: 'me',
        requestBody: { message: { raw } },
    });
    return `บันทึก draft สำเร็จค่ะ ✅\nDraft ID: \`${res.data.id}\`\nสามารถเปิดดูและแก้ไขใน Gmail ก่อนส่งได้เลย`;
}
export async function gmailListDrafts(args) {
    if (!await isConnected())
        return NOT_CONNECTED;
    const auth = await getAuthedClient();
    if (!auth)
        return NOT_CONNECTED;
    const gmail = google.gmail({ version: 'v1', auth });
    const maxResults = Number(args.max_results ?? 5);
    const res = await gmail.users.drafts.list({ userId: 'me', maxResults });
    const drafts = res.data.drafts ?? [];
    if (drafts.length === 0)
        return 'ไม่มี draft ค่ะ';
    const details = await Promise.all(drafts.map(d => gmail.users.drafts.get({ userId: 'me', id: d.id, format: 'metadata',
        fields: 'id,message(payload/headers)' })));
    const lines = details.map(d => {
        const headers = d.data.message?.payload?.headers ?? [];
        const subject = headers.find((h) => h.name === 'Subject')?.value ?? '(ไม่มีหัวข้อ)';
        const to = headers.find((h) => h.name === 'To')?.value ?? '(ยังไม่ระบุ)';
        return `• *${subject}*\n  ถึง: ${to}\n  ID: \`${d.data.id}\``;
    });
    return `📝 *Drafts (${drafts.length})*\n\n${lines.join('\n\n')}`;
}
