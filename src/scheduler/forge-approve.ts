// Vera — Forge approve/reject from a Telegram inline button.
// Forge's notify/autoapprove steps send an approval-request message with two
// buttons whose callback_data is `fg:ok:<bugId>` / `fg:no:<bugId>`. Tapping one
// writes the decision straight to Firestore `bug-reports/{bugId}` so Champ never
// has to open the dashboard. deploy.mjs then ships anything marked `approved`.
import type { Bot } from 'grammy';
import { db } from '../firebase.js';
import { FieldValue } from 'firebase-admin/firestore';
import { mdEscape, editMd } from '../utils/telegram.js';

export async function handleForgeCallback(
  bot: Bot,
  action: string, // 'ok' | 'no'
  bugId: string,
  chatId: number,
  messageId: number,
  callbackQueryId: string,
): Promise<void> {
  const ref = db.collection('bug-reports').doc(bugId);
  const snap = await ref.get();
  if (!snap.exists) {
    await bot.api.answerCallbackQuery(callbackQueryId, { text: 'ไม่พบ bug นี้แล้ว' });
    try { await bot.api.editMessageReplyMarkup(chatId, messageId); } catch { /* old */ }
    return;
  }
  const b = snap.data() || {};

  // Guard: only act on a PR that is still waiting. If it already shipped or was
  // decided, don't flip it — just report the current state.
  if (b['status'] !== 'pr-open') {
    await bot.api.answerCallbackQuery(callbackQueryId, { text: `จัดการไปแล้ว: ${b['status']}` });
    try { await bot.api.editMessageReplyMarkup(chatId, messageId); } catch { /* old */ }
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
      await editMd(bot, chatId, messageId,
        `✅ *อนุมัติแล้ว* — Forge กำลัง ship\n*${mdEscape(b['title'] ?? bugId)}* (${mdEscape(b['project'] ?? '')})`);
    } catch { /* old message — reply markup edit fallback */
      try { await bot.api.editMessageReplyMarkup(chatId, messageId); } catch { /* ok */ }
    }
  } else {
    await ref.update({
      status: 'rejected',
      rejectedVia: 'telegram-button',
      autoApproveHold: true,
      rejectedAt: FieldValue.serverTimestamp(),
    });
    await bot.api.answerCallbackQuery(callbackQueryId, { text: '❌ ปฏิเสธ — ไม่ ship' });
    try {
      await editMd(bot, chatId, messageId,
        `❌ *ปฏิเสธแล้ว* — ไม่ ship\n*${mdEscape(b['title'] ?? bugId)}* (${mdEscape(b['project'] ?? '')})\n_PR ยังเปิดอยู่ ปิด/แก้ต่อได้ที่ dashboard_`);
    } catch {
      try { await bot.api.editMessageReplyMarkup(chatId, messageId); } catch { /* ok */ }
    }
  }
}
