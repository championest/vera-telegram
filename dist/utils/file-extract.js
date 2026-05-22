import mammoth from 'mammoth';
import * as XLSX from 'xlsx';
const MAX_TEXT_LEN = 200_000; // 200KB cap to avoid blowing context
/**
 * Convert a downloaded Telegram document into a NormalizedFile suitable for the LLM.
 * - PDF + images: pass through as binary (LLM handles natively)
 * - docx: mammoth → plain text
 * - xlsx/xls: xlsx → CSV per sheet
 * - csv/txt/json/md and any text/*: pass through as UTF-8 text
 * - Unknown binary: returns null (caller decides what to tell the user)
 */
export async function extractFile(buffer, mimeType, filename) {
    const mime = (mimeType || '').toLowerCase();
    const ext = (filename?.split('.').pop() ?? '').toLowerCase();
    // Native binary types — LLM handles directly
    if (mime === 'application/pdf' || ext === 'pdf') {
        return { buffer, mimeType: 'application/pdf', filename };
    }
    if (mime.startsWith('image/')) {
        return { buffer, mimeType: mime, filename };
    }
    // DOCX → text
    const isDocx = mime === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
        ext === 'docx';
    if (isDocx) {
        try {
            const { value } = await mammoth.extractRawText({ buffer });
            return {
                buffer: Buffer.from(truncate(value), 'utf-8'),
                mimeType: 'text/plain',
                filename: filename ?? 'document.docx',
            };
        }
        catch (err) {
            throw new Error(`อ่าน docx ไม่ได้: ${err?.message ?? 'unknown'}`);
        }
    }
    // XLSX / XLS → CSV (each sheet concatenated)
    const isXlsx = mime === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
        mime === 'application/vnd.ms-excel' ||
        ext === 'xlsx' || ext === 'xls';
    if (isXlsx) {
        try {
            const wb = XLSX.read(buffer, { type: 'buffer' });
            const parts = [];
            for (const name of wb.SheetNames) {
                const csv = XLSX.utils.sheet_to_csv(wb.Sheets[name]);
                parts.push(`### Sheet: ${name}\n${csv}`);
            }
            return {
                buffer: Buffer.from(truncate(parts.join('\n\n')), 'utf-8'),
                mimeType: 'text/csv',
                filename: filename ?? 'spreadsheet.xlsx',
            };
        }
        catch (err) {
            throw new Error(`อ่าน xlsx ไม่ได้: ${err?.message ?? 'unknown'}`);
        }
    }
    // Plain text family
    const isText = mime.startsWith('text/') ||
        mime === 'application/json' ||
        mime === 'application/javascript' ||
        mime === 'application/xml' ||
        ['txt', 'csv', 'tsv', 'json', 'md', 'markdown', 'log', 'yml', 'yaml', 'xml', 'js', 'ts', 'html', 'css'].includes(ext);
    if (isText) {
        const text = buffer.toString('utf-8');
        return {
            buffer: Buffer.from(truncate(text), 'utf-8'),
            mimeType: 'text/plain',
            filename,
        };
    }
    return null;
}
function truncate(s) {
    if (s.length <= MAX_TEXT_LEN)
        return s;
    return s.slice(0, MAX_TEXT_LEN) + `\n\n... [truncated ${s.length - MAX_TEXT_LEN} chars]`;
}
