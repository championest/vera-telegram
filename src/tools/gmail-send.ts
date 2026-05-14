import { google } from 'googleapis';
import { getAuthedClient, isConnected } from '../services/google-auth.js';

const NOT_CONNECTED = 'ยังไม่ได้เชื่อม Google ค่ะ — ส่ง /connect เพื่อเริ่มต้น';

export async function gmailSend(args: Record<string, unknown>): Promise<string> {
  if (!await isConnected()) return NOT_CONNECTED;
  const auth = await getAuthedClient();
  if (!auth) return NOT_CONNECTED;

  const gmail = google.gmail({ version: 'v1', auth });
  const to = String(args.to ?? '');
  const subject = String(args.subject ?? '');
  const body = String(args.body ?? '');
  const replyToMessageId = args.reply_to_message_id ? String(args.reply_to_message_id) : undefined;

  if (!to || !subject || !body) return 'กรุณาระบุ to, subject, และ body ค่ะ';

  let headers = `To: ${to}\nSubject: ${subject}\nContent-Type: text/plain; charset=utf-8\n`;

  // Thread reply support
  if (replyToMessageId) {
    const detail = await gmail.users.messages.get({
      userId: 'me',
      id: replyToMessageId,
      format: 'metadata',
      metadataHeaders: ['Message-ID', 'References', 'Subject'],
    });
    const h = detail.data.payload?.headers ?? [];
    const msgId = h.find((x: any) => x.name === 'Message-ID')?.value;
    const refs = h.find((x: any) => x.name === 'References')?.value;
    if (msgId) {
      headers += `In-Reply-To: ${msgId}\n`;
      headers += `References: ${refs ? refs + ' ' + msgId : msgId}\n`;
    }
    headers += `Subject: Re: ${subject.replace(/^Re: /i, '')}\n`;
  }

  const raw = Buffer.from(headers + '\n' + body)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');

  const sendRes = await gmail.users.messages.send({
    userId: 'me',
    requestBody: { raw, threadId: replyToMessageId ? undefined : undefined },
  });

  return `ส่งอีเมลสำเร็จค่ะ ✅\nMessage ID: \`${sendRes.data.id}\``;
}
