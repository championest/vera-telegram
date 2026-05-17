import { google } from 'googleapis';
import { getAuthedClient } from '../services/google-auth.js';
export async function googleDriveSave(args) {
    const title = String(args.title ?? '');
    const content = String(args.content ?? '');
    const folderName = String(args.folder ?? 'Vera Research');
    if (!title || !content)
        return 'กรุณาระบุ title และ content';
    const auth = await getAuthedClient();
    if (!auth)
        return 'Google ยังไม่ได้เชื่อมค่ะ — กรุณาใช้ /connect';
    try {
        const drive = google.drive({ version: 'v3', auth });
        const docs = google.docs({ version: 'v1', auth });
        // Find or create "Vera Research" folder
        let folderId;
        const folderSearch = await drive.files.list({
            q: `name='${folderName}' and mimeType='application/vnd.google-apps.folder' and trashed=false`,
            fields: 'files(id)',
        });
        if (folderSearch.data.files?.length) {
            folderId = folderSearch.data.files[0].id;
        }
        else {
            const folder = await drive.files.create({
                requestBody: { name: folderName, mimeType: 'application/vnd.google-apps.folder' },
                fields: 'id',
            });
            folderId = folder.data.id;
        }
        // Create Google Doc
        const file = await drive.files.create({
            requestBody: {
                name: title,
                mimeType: 'application/vnd.google-apps.document',
                parents: folderId ? [folderId] : [],
            },
            fields: 'id,webViewLink',
        });
        const docId = file.data.id;
        // Insert content
        await docs.documents.batchUpdate({
            documentId: docId,
            requestBody: {
                requests: [{ insertText: { location: { index: 1 }, text: content } }],
            },
        });
        return `✅ บันทึกใน Google Drive แล้วค่ะ\nชื่อ: ${title}\nโฟลเดอร์: ${folderName}\nลิงก์: ${file.data.webViewLink}`;
    }
    catch (err) {
        return `Google Drive error: ${err.message}`;
    }
}
