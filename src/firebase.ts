import admin from 'firebase-admin';
import { readFileSync } from 'fs';
import { config } from './config.js';

if (!admin.apps.length) {
  // Local dev: load from service-account.json directly
  // Railway/production: load from env vars
  if (process.env.FIREBASE_KEY_PATH) {
    const serviceAccount = JSON.parse(readFileSync(process.env.FIREBASE_KEY_PATH, 'utf8'));
    admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
  } else {
    admin.initializeApp({
      credential: admin.credential.cert({
        projectId: config.FIREBASE_PROJECT_ID,
        clientEmail: config.FIREBASE_CLIENT_EMAIL,
        privateKey: config.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
      }),
    });
  }
}

export const db = admin.firestore();
