import admin from 'firebase-admin';
import { readFileSync } from 'fs';
import { config } from './config.js';

// Default bucket name = `<projectId>.firebasestorage.app` (same as the client's
// NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET). Override via env if it ever diverges.
const DEFAULT_BUCKET =
  process.env.FIREBASE_STORAGE_BUCKET ||
  `${config.FIREBASE_PROJECT_ID || 'up-level-guild'}.firebasestorage.app`;

if (!admin.apps.length) {
  // Local dev: load from service-account.json directly
  // Railway/production: load from env vars
  if (process.env.FIREBASE_KEY_PATH) {
    const serviceAccount = JSON.parse(readFileSync(process.env.FIREBASE_KEY_PATH, 'utf8'));
    admin.initializeApp({ credential: admin.credential.cert(serviceAccount), storageBucket: DEFAULT_BUCKET });
  } else {
    admin.initializeApp({
      credential: admin.credential.cert({
        projectId: config.FIREBASE_PROJECT_ID,
        clientEmail: config.FIREBASE_CLIENT_EMAIL,
        privateKey: config.FIREBASE_PRIVATE_KEY.startsWith('-----')
          ? config.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n')
          : Buffer.from(config.FIREBASE_PRIVATE_KEY, 'base64').toString('utf8'),
      }),
      storageBucket: DEFAULT_BUCKET,
    });
  }
}

export const db = admin.firestore();
export const storage = admin.storage();
