import { db } from '../firebase.js';
import { handleUserMessage } from './message.js';
import { config } from '../config.js';
import admin from 'firebase-admin';

const HQ_CHAT_COLLECTION = 'champ-hq-chat';
const WORKFLOW_COLLECTION = 'team-workflow';
// Use same userId as Telegram so memory is shared across channels
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

let pollingChat = false;
let pollingDispatch = false;

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
      HQ_USER_ID,
      content,
      async (progressText) => {
        await db.collection(HQ_CHAT_COLLECTION).add({
          role: 'vera', content: progressText,
          timestamp: admin.firestore.FieldValue.serverTimestamp(),
          isProgress: true, processed: true,
        });
      },
    );

    await db.collection(HQ_CHAT_COLLECTION).add({
      role: 'vera', content: response,
      timestamp: admin.firestore.FieldValue.serverTimestamp(),
      processed: true,
    });
  } catch (err) {
    console.error('[HQ Bridge] Chat error:', err);
    await db.collection(HQ_CHAT_COLLECTION).add({
      role: 'vera', content: '⚠️ เกิดข้อผิดพลาด กรุณาลองใหม่',
      timestamp: admin.firestore.FieldValue.serverTimestamp(),
      processed: true,
    });
  }
}

async function processNextDispatch(): Promise<void> {
  const snap = await db.collection(WORKFLOW_COLLECTION)
    .where('source', '==', 'champ-hq')
    .where('status', '==', 'TODO')
    .where('dispatchProcessed', '==', false)
    .orderBy('timestamp', 'asc')
    .limit(1)
    .get();

  if (snap.empty) return;

  const docRef = snap.docs[0].ref;
  const data = snap.docs[0].data();
  const { member, task, notes, priority } = data;

  // Claim
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
      HQ_USER_ID,
      prompt,
      async (progressText) => {
        await db.collection(HQ_CHAT_COLLECTION).add({
          role: 'vera', content: `⏳ [${member}] ${progressText}`,
          timestamp: admin.firestore.FieldValue.serverTimestamp(),
          isProgress: true, processed: true, dispatchId: snap.docs[0].id,
        });
      },
    );

    // Post result to HQ chat
    await db.collection(HQ_CHAT_COLLECTION).add({
      role: 'vera',
      content: `✅ **${member.toUpperCase()}** เสร็จแล้ว\n\n${response}`,
      timestamp: admin.firestore.FieldValue.serverTimestamp(),
      processed: true,
      dispatchId: snap.docs[0].id,
    });

    // Mark dispatch done
    await docRef.update({
      status: 'DONE',
      completedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    console.log(`[HQ Dispatch] ${member} completed: ${task}`);
  } catch (err) {
    console.error('[HQ Dispatch] Error:', err);
    await docRef.update({ status: 'BLOCKED' });
    await db.collection(HQ_CHAT_COLLECTION).add({
      role: 'vera', content: `⚠️ [${member}] เกิดข้อผิดพลาดระหว่างทำงาน`,
      timestamp: admin.firestore.FieldValue.serverTimestamp(),
      processed: true,
    });
  }
}

export function startHQBridge(): void {
  console.log('[HQ Bridge] Starting — chat + dispatch polling every 3s');

  setInterval(async () => {
    if (pollingChat) return;
    pollingChat = true;
    try { await processNextChat(); } catch (err) { console.error('[HQ Chat] Poll error:', err); }
    finally { pollingChat = false; }
  }, POLL_INTERVAL_MS);

  // Dispatch polling slightly offset to avoid collision
  setTimeout(() => {
    setInterval(async () => {
      if (pollingDispatch) return;
      pollingDispatch = true;
      try { await processNextDispatch(); } catch (err) { console.error('[HQ Dispatch] Poll error:', err); }
      finally { pollingDispatch = false; }
    }, POLL_INTERVAL_MS);
  }, 1500);
}
