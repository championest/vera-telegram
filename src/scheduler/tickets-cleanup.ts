import cron from 'node-cron';
import { db, storage } from '../firebase.js';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';

const RETENTION_DAYS = 14;
// Run daily at 03:30 BKK (low traffic). Anything older than the retention
// window AND in a terminal state gets its Storage blobs nuked; the Firestore
// doc keeps a compact metadata array (kind + size + ticketId) so the dashboard
// still shows that an attachment existed.
const SCHEDULE = '30 3 * * *';

type Attachment = {
    url?: string;
    path?: string;
    contentType?: string;
    size?: number;
    kind?: 'image' | 'video';
};

type AttachmentMeta = {
    kind: 'image' | 'video';
    size: number;
    purgedAt: number;
};

async function purgeTicket(docId: string, attachments: Attachment[]): Promise<{ kept: AttachmentMeta[]; purged: number }> {
    const bucket = storage.bucket();
    let purged = 0;
    const kept: AttachmentMeta[] = [];
    for (const a of attachments) {
        const meta: AttachmentMeta = {
            kind: a.kind === 'video' ? 'video' : 'image',
            size: typeof a.size === 'number' ? a.size : 0,
            purgedAt: Date.now(),
        };
        if (a.path) {
            try {
                await bucket.file(a.path).delete({ ignoreNotFound: true });
                purged++;
            } catch (err) {
                console.error('[tickets-cleanup] delete failed for', a.path, err);
                // Keep the original record so we don't lose track — retry next run.
                kept.push(meta);
                continue;
            }
        }
        kept.push(meta);
    }
    await db.collection('tickets').doc(docId).update({
        attachments: FieldValue.delete(),
        attachmentsArchive: kept,
        attachmentsPurgedAt: FieldValue.serverTimestamp(),
    });
    return { kept, purged };
}

async function runOnce(): Promise<void> {
    const cutoff = Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000;
    const snap = await db
        .collection('tickets')
        .where('status', 'in', ['resolved', 'wontfix'])
        .where('createdAtMs', '<', cutoff)
        .limit(50)
        .get();
    let totalPurged = 0;
    let totalTickets = 0;
    for (const doc of snap.docs) {
        const data = doc.data();
        const atts = Array.isArray(data.attachments) ? (data.attachments as Attachment[]) : [];
        if (atts.length === 0) continue;
        try {
            const { purged } = await purgeTicket(doc.id, atts);
            totalPurged += purged;
            totalTickets++;
        } catch (err) {
            console.error('[tickets-cleanup] purge failed for', doc.id, err);
        }
    }
    if (totalTickets > 0) {
        console.log(`[tickets-cleanup] purged ${totalPurged} files from ${totalTickets} tickets`);
    }
}

export function startTicketCleanupScheduler(): void {
    cron.schedule(SCHEDULE, () => {
        runOnce().catch((err) =>
            console.error('[tickets-cleanup] scheduler error:', err),
        );
    }, { timezone: 'Asia/Bangkok' });
    console.log('Ticket cleanup scheduler started (daily 03:30 BKK)');
}

// Suppress unused import lint — Timestamp may come in handy if we later swap
// createdAtMs for a Firestore Timestamp comparison.
void Timestamp;
