import { db } from '../firebase.js';
import { handleUserMessage } from './message.js';
import admin from 'firebase-admin';
const HQ_CHAT_COLLECTION = 'champ-hq-chat';
const HQ_USER_ID = 'champ-hq';
const POLL_INTERVAL_MS = 3000;
let polling = false;
async function processNextMessage() {
    const snap = await db.collection(HQ_CHAT_COLLECTION)
        .where('role', '==', 'user')
        .where('processed', '==', false)
        .orderBy('timestamp', 'asc')
        .limit(1)
        .get();
    if (snap.empty)
        return;
    const docRef = snap.docs[0].ref;
    const { content } = snap.docs[0].data();
    // Claim the message atomically to prevent double-processing
    await docRef.update({ processed: true, processingAt: admin.firestore.FieldValue.serverTimestamp() });
    try {
        const response = await handleUserMessage(HQ_USER_ID, content, async (progressText) => {
            // Optional: write progress indicator back
            await db.collection(HQ_CHAT_COLLECTION).add({
                role: 'vera',
                content: progressText,
                timestamp: admin.firestore.FieldValue.serverTimestamp(),
                isProgress: true,
                processed: true,
            });
        });
        await db.collection(HQ_CHAT_COLLECTION).add({
            role: 'vera',
            content: response,
            timestamp: admin.firestore.FieldValue.serverTimestamp(),
            processed: true,
        });
    }
    catch (err) {
        console.error('[HQ Bridge] Error processing message:', err);
        await db.collection(HQ_CHAT_COLLECTION).add({
            role: 'vera',
            content: '⚠️ เกิดข้อผิดพลาด กรุณาลองใหม่',
            timestamp: admin.firestore.FieldValue.serverTimestamp(),
            processed: true,
        });
    }
}
export function startHQBridge() {
    console.log('[HQ Bridge] Starting — polling champ-hq-chat every 3s');
    setInterval(async () => {
        if (polling)
            return;
        polling = true;
        try {
            await processNextMessage();
        }
        catch (err) {
            console.error('[HQ Bridge] Poll error:', err);
        }
        finally {
            polling = false;
        }
    }, POLL_INTERVAL_MS);
}
