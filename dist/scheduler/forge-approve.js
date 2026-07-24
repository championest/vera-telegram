import { db } from '../firebase.js';
import { FieldValue } from 'firebase-admin/firestore';
export async function handleForgeCallback(bot, action, // 'ok' | 'no'
bugId, chatId, messageId, callbackQueryId) {
    const ref = db.collection('bug-reports').doc(bugId);
    const snap = await ref.get();
    if (!snap.exists) {
        await bot.api.answerCallbackQuery(callbackQueryId, { text: 'ไม่พบ bug นี้แล้ว' });
        try {
            await bot.api.editMessageReplyMarkup(chatId, messageId);
        }
        catch { /* old */ }
        return;
    }
    const b = snap.data() || {};
    // Guard: only act on a PR that is still waiting. If it already shipped or was
    // decided, don't flip it — just report the current state.
    if (b['status'] !== 'pr-open') {
        await bot.api.answerCallbackQuery(callbackQueryId, { text: `จัดการไปแล้ว: ${b['status']}` });
        try {
            await bot.api.editMessageReplyMarkup(chatId, messageId);
        }
        catch { /* old */ }
        return;
    }
    if (action === 'ok') {
        await ref.update({
            status: 'approved',
            approvedVia: 'telegram-button',
            autoApproveHold: false,
            approvedAt: FieldValue.serverTimestamp(),
        });
        await bot.api.answerCallbackQuery(callbackQueryId, { text: '✅ อนุมัติ — กำลัง ship' });
        try {
            await bot.api.editMessageText(chatId, messageId, `✅ *อนุมัติแล้ว* — Forge กำลัง ship\n*${b['title'] ?? bugId}* (${b['project'] ?? ''})`, { parse_mode: 'Markdown' });
        }
        catch { /* old message — reply markup edit fallback */
            try {
                await bot.api.editMessageReplyMarkup(chatId, messageId);
            }
            catch { /* ok */ }
        }
    }
    else {
        await ref.update({
            status: 'rejected',
            rejectedVia: 'telegram-button',
            autoApproveHold: true,
            rejectedAt: FieldValue.serverTimestamp(),
        });
        await bot.api.answerCallbackQuery(callbackQueryId, { text: '❌ ปฏิเสธ — ไม่ ship' });
        try {
            await bot.api.editMessageText(chatId, messageId, `❌ *ปฏิเสธแล้ว* — ไม่ ship\n*${b['title'] ?? bugId}* (${b['project'] ?? ''})\n_PR ยังเปิดอยู่ ปิด/แก้ต่อได้ที่ dashboard_`, { parse_mode: 'Markdown' });
        }
        catch {
            try {
                await bot.api.editMessageReplyMarkup(chatId, messageId);
            }
            catch { /* ok */ }
        }
    }
}
