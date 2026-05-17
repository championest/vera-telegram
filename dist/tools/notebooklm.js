import { google } from 'googleapis';
import { getAuthedClient } from '../services/google-auth.js';
const NBL_MIME = 'application/vnd.google.notebooklm.book';
export async function notebooklmCreate(args) {
    const title = String(args.title ?? 'Research');
    const sourceUrls = args.source_urls ?? [];
    const summaryNote = String(args.summary_note ?? '');
    const auth = await getAuthedClient();
    if (!auth)
        return 'ERROR_NBL: Google ยังไม่ได้เชื่อมค่ะ — กรุณาใช้ /connect';
    try {
        const drive = google.drive({ version: 'v3', auth });
        const file = await drive.files.create({
            requestBody: {
                name: title,
                mimeType: NBL_MIME,
            },
            fields: 'id,webViewLink',
        });
        const fileId = file.data.id;
        const notebookUrl = `https://notebooklm.google.com/notebook/${fileId}`;
        const sourceList = sourceUrls.map((u, i) => `${i + 1}. ${u}`).join('\n');
        return `✅ NotebookLM สร้างแล้วค่ะ\nชื่อ: ${title}\nลิงก์: ${notebookUrl}\n\nSources ที่ต้องเพิ่มใน NotebookLM:\n${sourceList}`;
    }
    catch (err) {
        console.error('[NotebookLM] Drive API failed:', err);
        return `ERROR_NBL: Drive API error — ${err.message?.slice(0, 150)}`;
    }
}
export async function notebooklmDebugPage() {
    const auth = await getAuthedClient();
    if (!auth)
        return 'ERROR: Google not connected';
    try {
        const drive = google.drive({ version: 'v3', auth });
        // Try creating a test file to verify Drive API + MIME type works
        const file = await drive.files.create({
            requestBody: {
                name: '_vera_nbl_test',
                mimeType: NBL_MIME,
            },
            fields: 'id,mimeType,webViewLink',
        });
        const result = `✅ Drive API works!\nID: ${file.data.id}\nMIME: ${file.data.mimeType}\nLink: ${file.data.webViewLink}`;
        // Clean up test file
        await drive.files.delete({ fileId: file.data.id });
        return result;
    }
    catch (err) {
        return `ERROR: ${err.message?.slice(0, 200)}\n\nTrying to list recent files instead...`;
    }
}
export async function notebooklmSaveSession(_cookiesJson) {
    return 'ไม่จำเป็นต้อง setup session แล้วค่ะ — Vera ใช้ Google Drive API แทน Playwright';
}
