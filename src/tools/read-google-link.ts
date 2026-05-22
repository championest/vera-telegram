import { google } from 'googleapis';
import { getAuthedClient } from '../services/google-auth.js';

const MAX_LEN = 80_000;

interface ParsedLink {
  kind: 'doc' | 'sheet' | 'drive';
  id: string;
  gid?: string;
  range?: string;
}

/** Extract docId / sheetId / gid / range from a Google link */
export function parseGoogleLink(url: string): ParsedLink | null {
  try {
    const u = new URL(url);
    const host = u.hostname;
    if (!host.includes('google.com')) return null;

    const docMatch = u.pathname.match(/\/document\/d\/([a-zA-Z0-9_-]+)/);
    if (docMatch) return { kind: 'doc', id: docMatch[1] };

    const sheetMatch = u.pathname.match(/\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/);
    if (sheetMatch) {
      const gid = u.hash.match(/gid=(\d+)/)?.[1] ?? u.searchParams.get('gid') ?? undefined;
      const range = u.searchParams.get('range') ?? undefined;
      return { kind: 'sheet', id: sheetMatch[1], gid, range };
    }

    const fileMatch = u.pathname.match(/\/file\/d\/([a-zA-Z0-9_-]+)/);
    if (fileMatch) return { kind: 'drive', id: fileMatch[1] };

    const driveOpenId = u.searchParams.get('id');
    if (driveOpenId && u.pathname.includes('/open')) {
      return { kind: 'drive', id: driveOpenId };
    }

    return null;
  } catch {
    return null;
  }
}

function truncate(s: string): string {
  if (s.length <= MAX_LEN) return s;
  return s.slice(0, MAX_LEN) + `\n\n... [truncated ${s.length - MAX_LEN} chars]`;
}

async function fetchPublicExport(docId: string, format: 'txt' | 'csv', gid?: string): Promise<string | null> {
  const base = format === 'txt'
    ? `https://docs.google.com/document/d/${docId}/export?format=txt`
    : `https://docs.google.com/spreadsheets/d/${docId}/export?format=csv${gid ? `&gid=${gid}` : ''}`;
  try {
    const res = await fetch(base, { redirect: 'follow' });
    if (!res.ok) return null;
    const text = await res.text();
    // Google redirects unauthorized requests to a sign-in page (HTML) — detect that
    if (text.includes('<html') && text.toLowerCase().includes('sign in')) return null;
    return text;
  } catch {
    return null;
  }
}

export async function readGoogleDoc(args: Record<string, unknown>): Promise<string> {
  const url = String(args.url ?? '').trim();
  if (!url) return 'กรุณาส่ง url ของ Google Doc';

  const parsed = parseGoogleLink(url);
  if (!parsed || (parsed.kind !== 'doc' && parsed.kind !== 'drive')) {
    return 'URL นี้ไม่ใช่ Google Doc ที่ถูกต้อง';
  }

  // Try OAuth first (works for private docs owned by Champ)
  const auth = await getAuthedClient();
  if (auth) {
    try {
      const drive = google.drive({ version: 'v3', auth });
      const file = await drive.files.get({ fileId: parsed.id, fields: 'id,name,mimeType' });
      const name = file.data.name ?? 'document';
      const mimeType = file.data.mimeType ?? '';

      if (mimeType === 'application/vnd.google-apps.document') {
        const exportRes = await drive.files.export(
          { fileId: parsed.id, mimeType: 'text/plain' },
          { responseType: 'text' as const },
        );
        const text = typeof exportRes.data === 'string' ? exportRes.data : String(exportRes.data);
        return `📄 *${name}*\n\n${truncate(text)}`;
      }

      // For non-doc files (e.g. uploaded PDF), download raw text if possible
      if (mimeType.startsWith('text/') || mimeType === 'application/json') {
        const dl = await drive.files.get({ fileId: parsed.id, alt: 'media' }, { responseType: 'text' as const });
        const text = typeof dl.data === 'string' ? dl.data : String(dl.data);
        return `📄 *${name}* (${mimeType})\n\n${truncate(text)}`;
      }

      return `📄 *${name}* — mime type ${mimeType} อ่านตรงไม่ได้ ลองดาวน์โหลดส่งไฟล์มาก็ได้ค่ะ`;
    } catch (err: any) {
      // OAuth call failed (e.g. file not shared with Champ) → try public fallback
      console.warn('[readGoogleDoc] OAuth failed, trying public:', err?.message);
    }
  }

  // Public fallback (only works if "Anyone with link" sharing is enabled)
  const text = await fetchPublicExport(parsed.id, 'txt');
  if (text == null) {
    return auth
      ? 'อ่าน doc ไม่ได้ค่ะ — Champ มีสิทธิ์เข้าถึงไฟล์นี้หรือเปล่า? ถ้าเป็น public ลองตั้ง share เป็น Anyone with link'
      : 'อ่าน doc ไม่ได้ค่ะ — ถ้าเป็นไฟล์ส่วนตัวต้องใช้ /connect ก่อน, ถ้าเป็น public ลองตั้ง share เป็น Anyone with link';
  }
  return `📄 (public)\n\n${truncate(text)}`;
}

export async function readGoogleSheet(args: Record<string, unknown>): Promise<string> {
  const url = String(args.url ?? '').trim();
  const argRange = args.range ? String(args.range) : undefined;
  if (!url) return 'กรุณาส่ง url ของ Google Sheet';

  const parsed = parseGoogleLink(url);
  if (!parsed || parsed.kind !== 'sheet') {
    return 'URL นี้ไม่ใช่ Google Sheet ที่ถูกต้อง';
  }

  const auth = await getAuthedClient();
  if (auth) {
    try {
      const sheets = google.sheets({ version: 'v4', auth });
      const meta = await sheets.spreadsheets.get({ spreadsheetId: parsed.id, fields: 'properties.title,sheets(properties(sheetId,title))' });
      const title = meta.data.properties?.title ?? 'spreadsheet';
      const allSheets = meta.data.sheets ?? [];

      // Pick target sheet
      let targetSheetTitle: string | undefined;
      if (parsed.gid != null) {
        const gidNum = parseInt(parsed.gid, 10);
        const match = allSheets.find(s => s.properties?.sheetId === gidNum);
        targetSheetTitle = match?.properties?.title ?? undefined;
      }
      const sheetsToRead = targetSheetTitle
        ? [targetSheetTitle]
        : allSheets.map(s => s.properties?.title ?? '').filter(Boolean);

      const parts: string[] = [];
      for (const sheetTitle of sheetsToRead) {
        const range = argRange ?? sheetTitle;
        const valRes = await sheets.spreadsheets.values.get({
          spreadsheetId: parsed.id,
          range,
          valueRenderOption: 'FORMATTED_VALUE',
        });
        const rows = valRes.data.values ?? [];
        const csv = rows.map(r => r.map(c => {
          const s = String(c ?? '');
          return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
        }).join(',')).join('\n');
        parts.push(`### ${sheetTitle}\n${csv || '(empty)'}`);
      }
      return `📊 *${title}*\n\n${truncate(parts.join('\n\n'))}`;
    } catch (err: any) {
      console.warn('[readGoogleSheet] OAuth failed, trying public:', err?.message);
    }
  }

  const text = await fetchPublicExport(parsed.id, 'csv', parsed.gid);
  if (text == null) {
    return auth
      ? 'อ่าน sheet ไม่ได้ค่ะ — Champ มีสิทธิ์เข้าถึงหรือเปล่า? ถ้าเป็น public ตั้ง share เป็น Anyone with link'
      : 'อ่าน sheet ไม่ได้ค่ะ — ถ้าเป็นไฟล์ส่วนตัวต้องใช้ /connect ก่อน, ถ้าเป็น public ลองตั้ง share เป็น Anyone with link';
  }
  return `📊 (public)\n\n${truncate(text)}`;
}
