import { db } from '../firebase.js';

const DOC = db.collection('vera-heartbeat').doc('primary');
const HEARTBEAT_MS = 30_000;      // primary writes every 30s
const STALE_MS = 120_000;         // standby takes over if primary silent > 2 min

/** PRIMARY (mini) heartbeat — proves the mini is alive so the cloud standby stays idle. */
export function startHeartbeat(host = 'mini'): void {
  const write = () =>
    DOC.set({ ts: Date.now(), host }, { merge: true }).catch((e) =>
      console.error('[heartbeat] write failed', e?.message ?? e)
    );
  write();
  setInterval(write, HEARTBEAT_MS);
  console.log(`Heartbeat started (${host}, every ${HEARTBEAT_MS / 1000}s)`);
}

/**
 * STANDBY check — is the primary (mini) down?
 * On any Firestore read error we return false (NOT stale) on purpose: if the
 * standby can't read the heartbeat it must NOT take over, or two pollers fight.
 */
export async function isPrimaryStale(staleMs = STALE_MS): Promise<boolean> {
  try {
    const snap = await DOC.get();
    if (!snap.exists) return true;
    const ts = Number(snap.data()?.ts ?? 0);
    return Date.now() - ts > staleMs;
  } catch (e) {
    console.error('[heartbeat] read failed — staying idle', (e as any)?.message ?? e);
    return false;
  }
}
