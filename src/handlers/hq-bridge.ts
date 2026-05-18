import { db } from '../firebase.js';
import { handleUserMessage } from './message.js';
import { config } from '../config.js';
import admin from 'firebase-admin';
import type { Bot } from 'grammy';

const HQ_CHAT_COLLECTION = 'champ-hq-chat';
const WORKFLOW_COLLECTION = 'team-workflow';
const HQ_USER_ID = config.TELEGRAM_OWNER_CHAT_ID;
const POLL_INTERVAL_MS = 3000;

const MEMBER_ROLES: Record<string, string> = {
  ace:   'Chief of Staff — วางแผน ตัดสินใจ ประสานงาน',
  cody:  'Dev — วิเคราะห์ วางแผน spec โค้ด หรือ debug',
  coco:  'Content — เขียน copy, caption, script, โพสต์ social media',
  scout: 'Research — ค้นข้อมูล วิเคราะห์ตลาด หาคำตอบ',
  spoty: 'QA — ตรวจสอบ, review, หาข้อผิดพลาด',
  memo:  'Brain — บันทึก, สรุป, จัดระเบียบข้อมูล',
  arty:  'Design — spec UI/UX, เลือกสี, วาง layout',
  bolt:  'Tools & Automation — แนะนำ tool, วาง workflow อัตโนมัติ',
  amy:   'Customer Insight — วิเคราะห์ลูกค้า, persona, pain points',
  pi:    'Math & Physics — โจทย์คณิต-ฟิสิกส์, เนื้อหาสอน',
  book:  'Instructional Design — ออกแบบเนื้อหาการศึกษา',
  vera:  'Executive Secretary — จัดการ email, ตาราง, follow-up',
  spike: 'Workflow Monitor — ติดตามงาน, สรุป status, handoff',
};

const MEMBER_EMOJI: Record<string, string> = {
  ace: '⭐', cody: '💻', coco: '✍️', scout: '🔍', spoty: '🛡️',
  memo: '🧠', arty: '🎨', bolt: '⚡', amy: '👥', pi: '📐',
  book: '📚', vera: '📋', spike: '📊',
};

let pollingChat = false;
let pollingDispatch = false;

async function postToHQChat(content: string, extra: Record<string, unknown> = {}): Promise<void> {
  await db.collection(HQ_CHAT_COLLECTION).add({
    role: 'vera', content,
    timestamp: admin.firestore.FieldValue.serverTimestamp(),
    processed: true, read: false,
    ...extra,
  });
}

async function processNextChat(): Promise<void> {
  const snap = await db.collection(HQ_CHAT_COLLECTION)
    .where('role', '==', 'user')
    .where('processed', '==', false)
    .orderBy('timestamp', 'asc')
    .limit(1)
    .get();

  if (snap.empty) return;

  const docRef = snap.docs[0].ref;
  const { content } = snap.docs[0].data();
  await docRef.update({ processed: true, processingAt: admin.firestore.FieldValue.serverTimestamp() });

  try {
    const response = await handleUserMessage(
      HQ_USER_ID, content,
      async (progressText) => {
        await postToHQChat(`⏳ ${progressText}`, { isProgress: true });
      },
    );
    await postToHQChat(response);
  } catch (err) {
    console.error('[HQ Bridge] Chat error:', err);
    await postToHQChat('⚠️ เกิดข้อผิดพลาด กรุณาลองใหม่');
  }
}

async function processNextDispatch(bot: Bot): Promise<void> {
  const snap = await db.collection(WORKFLOW_COLLECTION)
    .where('source', '==', 'champ-hq')
    .where('status', '==', 'TODO')
    .where('dispatchProcessed', '==', false)
    .orderBy('timestamp', 'asc')
    .limit(1)
    .get();

  if (snap.empty) return;

  const docRef = snap.docs[0].ref;
  const { member, task, notes, priority } = snap.docs[0].data();

  await docRef.update({
    status: 'IN_PROGRESS',
    dispatchProcessed: true,
    startedAt: admin.firestore.FieldValue.serverTimestamp(),
  });

  const memberRole = MEMBER_ROLES[member] ?? member;
  const prompt = [
    `[Dispatch จาก Champ HQ] คุณกำลังทำหน้าที่เป็น ${member.toUpperCase()} (${memberRole})`,
    `Priority: ${priority ?? 'normal'}`,
    `งาน: ${task}`,
    notes ? `Context: ${notes}` : '',
  ].filter(Boolean).join('\n');

  try {
    const response = await handleUserMessage(
      HQ_USER_ID, prompt,
      async (progressText) => {
        await postToHQChat(`⏳ [${member}] ${progressText}`, { isProgress: true, dispatchId: snap.docs[0].id });
      },
    );

    const emoji = MEMBER_EMOJI[member] ?? '🤖';
    const resultContent = `${emoji} **${member.toUpperCase()}** เสร็จแล้ว\n\n${response}`;

    // Post to HQ Vera chat (unread)
    await postToHQChat(resultContent, { dispatchId: snap.docs[0].id, isDispatchResult: true });

    // Send Telegram notification
    const tgSummary = [
      `${emoji} *${member.toUpperCase()}* งานเสร็จแล้ว`,
      `📋 *งาน:* ${task}`,
      ``,
      response.length > 800 ? response.slice(0, 800) + '...' : response,
      ``,
      `_ดูผลเต็มที่ Champ HQ → Vera_`,
    ].join('\n');

    await bot.api.sendMessage(HQ_USER_ID, tgSummary, { parse_mode: 'Markdown' });

    await docRef.update({ status: 'DONE', completedAt: admin.firestore.FieldValue.serverTimestamp() });
    console.log(`[HQ Dispatch] ${member} ✓ ${task}`);

  } catch (err) {
    console.error('[HQ Dispatch] Error:', err);
    await docRef.update({ status: 'BLOCKED' });
    await postToHQChat(`⚠️ [${member}] เกิดข้อผิดพลาดระหว่างทำงาน`, { dispatchId: snap.docs[0].id });

    try {
      await bot.api.sendMessage(HQ_USER_ID, `⚠️ Dispatch *${member}* เกิดข้อผิดพลาด\nงาน: ${task}`, { parse_mode: 'Markdown' });
    } catch { /* non-fatal */ }
  }
}

export function startHQBridge(bot: Bot): void {
  console.log('[HQ Bridge] Starting — chat + dispatch polling every 3s');

  setInterval(async () => {
    if (pollingChat) return;
    pollingChat = true;
    try { await processNextChat(); } catch (err) { console.error('[HQ Chat] Poll error:', err); }
    finally { pollingChat = false; }
  }, POLL_INTERVAL_MS);

  setTimeout(() => {
    setInterval(async () => {
      if (pollingDispatch) return;
      pollingDispatch = true;
      try { await processNextDispatch(bot); } catch (err) { console.error('[HQ Dispatch] Poll error:', err); }
      finally { pollingDispatch = false; }
    }, POLL_INTERVAL_MS);
  }, 1500);
}
