import { google } from 'googleapis';
import { getAuthedClient, isConnected } from '../services/google-auth.js';

const NOT_CONNECTED = 'ยังไม่ได้เชื่อม Google ค่ะ — ส่ง /connect เพื่อเริ่มต้น';

function decodeBody(payload: any): string {
  if (!payload) return '';
  if (payload.body?.data) {
    return Buffer.from(payload.body.data, 'base64').toString('utf-8').slice(0, 2000);
  }
  for (const part of payload.parts ?? []) {
    const text = decodeBody(part);
    if (text) return text;
  }
  return '';
}

function getHeader(headers: any[], name: string): string {
  return headers.find((h: any) => h.name.toLowerCase() === name.toLowerCase())?.value ?? '';
}

export async function gmailListUnread(args: Record<string, unknown>): Promise<string> {
  if (!await isConnected()) return NOT_CONNECTED;
  const auth = await getAuthedClient();
  if (!auth) return NOT_CONNECTED;

  const gmail = google.gmail({ version: 'v1', auth });
  const limit = Number(args.limit ?? 5);

  const listRes = await gmail.users.messages.list({
    userId: 'me',
    labelIds: ['UNREAD', 'INBOX'],
    maxResults: limit,
  });

  const messages = listRes.data.messages ?? [];
  if (messages.length === 0) return 'ไม่มีอีเมลที่ยังไม่ได้อ่านค่ะ ✅';

  const lines: string[] = [`*อีเมลที่ยังไม่ได้อ่าน (${messages.length} ฉบับ)*\n`];
  for (const msg of messages) {
    const detail = await gmail.users.messages.get({
      userId: 'me',
      id: msg.id!,
      format: 'metadata',
      metadataHeaders: ['From', 'Subject', 'Date'],
    });
    const h = detail.data.payload?.headers ?? [];
    lines.push(`• *${getHeader(h, 'Subject') || '(ไม่มีหัวข้อ)'}*`);
    lines.push(`  จาก: ${getHeader(h, 'From')}`);
    lines.push(`  ID: \`${msg.id}\`\n`);
  }
  return lines.join('\n');
}

export async function gmailSearch(args: Record<string, unknown>): Promise<string> {
  if (!await isConnected()) return NOT_CONNECTED;
  const auth = await getAuthedClient();
  if (!auth) return NOT_CONNECTED;

  const gmail = google.gmail({ version: 'v1', auth });
  const query = String(args.query ?? '');
  const limit = Number(args.limit ?? 5);

  const listRes = await gmail.users.messages.list({ userId: 'me', q: query, maxResults: limit });
  const messages = listRes.data.messages ?? [];
  if (messages.length === 0) return `ไม่พบอีเมลที่ตรงกับ: "${query}"`;

  const lines: string[] = [`*ผลค้นหา: "${query}" (${messages.length} ฉบับ)*\n`];
  for (const msg of messages) {
    const detail = await gmail.users.messages.get({
      userId: 'me',
      id: msg.id!,
      format: 'metadata',
      metadataHeaders: ['From', 'Subject', 'Date'],
    });
    const h = detail.data.payload?.headers ?? [];
    lines.push(`• *${getHeader(h, 'Subject') || '(ไม่มีหัวข้อ)'}*`);
    lines.push(`  จาก: ${getHeader(h, 'From')}`);
    lines.push(`  วันที่: ${getHeader(h, 'Date')}`);
    lines.push(`  ID: \`${msg.id}\`\n`);
  }
  return lines.join('\n');
}

export async function gmailRead(args: Record<string, unknown>): Promise<string> {
  if (!await isConnected()) return NOT_CONNECTED;
  const auth = await getAuthedClient();
  if (!auth) return NOT_CONNECTED;

  const gmail = google.gmail({ version: 'v1', auth });
  const messageId = String(args.message_id ?? '');
  if (!messageId) return 'กรุณาระบุ message_id ค่ะ';

  const detail = await gmail.users.messages.get({ userId: 'me', id: messageId, format: 'full' });
  const h = detail.data.payload?.headers ?? [];
  const body = decodeBody(detail.data.payload);

  return [
    `*หัวข้อ:* ${getHeader(h, 'Subject') || '(ไม่มี)'}`,
    `*จาก:* ${getHeader(h, 'From')}`,
    `*ถึง:* ${getHeader(h, 'To')}`,
    `*วันที่:* ${getHeader(h, 'Date')}`,
    `\n*เนื้อหา:*\n${body || '(ไม่มีเนื้อหา)'}`,
  ].join('\n');
}
