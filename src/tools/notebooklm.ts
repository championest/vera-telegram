import { google } from 'googleapis';
import { getAuthedClient } from '../services/google-auth.js';

const NBL_MIME = 'application/vnd.google.notebooklm.book';

export async function notebooklmCreate(args: Record<string, unknown>): Promise<string> {
  const title = String(args.title ?? 'Research');
  const sourceUrls = (args.source_urls as string[]) ?? [];
  const summaryNote = String(args.summary_note ?? '');

  const auth = await getAuthedClient();
  if (!auth) return 'ERROR_NBL: Google ยังไม่ได้เชื่อมค่ะ — กรุณาใช้ /connect';

  try {
    const drive = google.drive({ version: 'v3', auth });

    const file = await drive.files.create({
      requestBody: {
        name: title,
        mimeType: NBL_MIME,
      },
      fields: 'id,webViewLink',
    });

    const notebookUrl = file.data.webViewLink ?? `https://notebooklm.google.com/notebook/${file.data.id}`;
    const sourceList = sourceUrls.map((u, i) => `${i + 1}. ${u}`).join('\n');

    return `✅ NotebookLM สร้างแล้วค่ะ\nชื่อ: ${title}\nลิงก์: ${notebookUrl}\n\nSources ที่ต้องเพิ่มใน NotebookLM:\n${sourceList}`;
  } catch (err: any) {
    console.error('[NotebookLM] Drive API failed:', err);
    return `ERROR_NBL: Drive API error — ${err.message?.slice(0, 150)}`;
  }
}

export async function notebooklmDebugPage(): Promise<string> {
  const auth = await getAuthedClient();
  if (!auth) return 'ERROR: Google not connected';

  try {
    // Step 1: Check token scopes
    const { token } = await auth.getAccessToken();
    const infoRes = await fetch(`https://oauth2.googleapis.com/tokeninfo?access_token=${token}`);
    const info = await infoRes.json() as any;
    const scopes = info.scope ?? 'unknown';
    const hasDrive = scopes.includes('drive');

    if (!hasDrive) {
      return `❌ Token missing drive scope\n\nCurrent scopes:\n${scopes.replace(/ /g, '\n')}\n\nต้อง /connect ใหม่แล้วอนุมัติ Google Drive access`;
    }

    // Step 2: Try Drive API
    const drive = google.drive({ version: 'v3', auth });
    const file = await drive.files.create({
      requestBody: { name: '_vera_nbl_test', mimeType: NBL_MIME },
      fields: 'id,mimeType,webViewLink',
    });

    const result = `✅ Drive API works!\nScope has drive: ${hasDrive}\nID: ${file.data.id}\nMIME: ${file.data.mimeType}\nLink: ${file.data.webViewLink}`;
    await drive.files.delete({ fileId: file.data.id! });
    return result;
  } catch (err: any) {
    return `ERROR: ${err.message?.slice(0, 300)}`;
  }
}

export async function notebooklmSaveSession(_cookiesJson: string): Promise<string> {
  return 'ไม่จำเป็นต้อง setup session แล้วค่ะ — Vera ใช้ Google Drive API แทน Playwright';
}
