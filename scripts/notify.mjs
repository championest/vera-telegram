#!/usr/bin/env node
// Usage: node scripts/notify.mjs "Your message here"
// Writes to vera-notifications Firestore so Vera sends it to Telegram within 1 minute.

import 'dotenv/config';
import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';

const message = process.argv[2];
if (!message) { console.error('Usage: node notify.mjs "message"'); process.exit(1); }

const serviceAccount = {
  project_id: process.env.FIREBASE_PROJECT_ID,
  client_email: process.env.FIREBASE_CLIENT_EMAIL,
  private_key: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
};

if (!getApps().length) {
  initializeApp({ credential: cert(serviceAccount) });
}
const db = getFirestore();

const ref = await db.collection('vera-notifications').add({
  message,
  status: 'pending',
  source: 'claude-code',
  createdAt: FieldValue.serverTimestamp(),
});

console.log(`Notification queued: ${ref.id}`);
process.exit(0);
