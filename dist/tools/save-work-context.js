import { db } from '../firebase.js';
import { FieldValue } from 'firebase-admin/firestore';
import { getRecentClaudeContext } from '../memory/claude-sync.js';
export async function saveWorkContext(input) {
    const topic = String(input['topic'] ?? '').trim();
    const summary = String(input['summary'] ?? '').trim();
    if (!topic || !summary)
        return 'ต้องระบุ topic และ summary';
    const actionItems = Array.isArray(input['action_items'])
        ? input['action_items'].map(String)
        : [];
    const ref = await db.collection('vera-conversations').add({
        topic,
        summary,
        action_items: actionItems,
        project: String(input['project'] ?? ''),
        source: 'telegram',
        synced_to_claude: false,
        timestamp: FieldValue.serverTimestamp(),
    });
    // Also write to claude-notes so Ace sees it at next session start
    const noteLines = [`[Vera Context] ${topic}: ${summary}`];
    if (actionItems.length)
        noteLines.push(`Actions: ${actionItems.join(', ')}`);
    if (input['project'])
        noteLines.push(`Project: ${input['project']}`);
    await db.collection('claude-notes').add({
        note: noteLines.join(' | '),
        topic: 'work-context',
        source: 'vera-telegram',
        read: false,
        timestamp: FieldValue.serverTimestamp(),
    });
    return `บันทึก work context แล้ว ✅ | Topic: ${topic} | ID: ${ref.id}`;
}
export async function getVeraConversations(input) {
    const limit = Number(input['limit'] ?? 5);
    const unsyncedOnly = input['unsynced_only'] === true;
    let query = db.collection('vera-conversations').orderBy('timestamp', 'desc');
    if (unsyncedOnly)
        query = query.where('synced_to_claude', '==', false);
    const snap = await query.limit(limit).get();
    const lines = [];
    if (!snap.empty) {
        lines.push('**Work context จาก Vera (Telegram)**\n');
        for (const doc of snap.docs) {
            const d = doc.data();
            const ts = d['timestamp']?.toDate?.()?.toLocaleDateString('th-TH') ?? '';
            lines.push(`📋 **${d['topic']}** ${ts ? `(${ts})` : ''}`);
            lines.push(`   ${d['summary']}`);
            const items = d['action_items'];
            if (items?.length) {
                for (const item of items)
                    lines.push(`   • ${item}`);
            }
            if (d['project'])
                lines.push(`   Project: ${d['project']}`);
            lines.push('');
            await doc.ref.update({ synced_to_claude: true });
        }
    }
    // Also pull recent Claude Code session turns (hybrid: in-memory → Firestore fallback)
    try {
        const claudeRecent = await getRecentClaudeContext(limit);
        if (claudeRecent.length) {
            lines.push('**Recent Claude Code session**\n');
            for (const entry of claudeRecent) {
                const ts = entry.timestamp ? new Date(entry.timestamp).toLocaleString('th-TH', { timeZone: 'Asia/Bangkok' }) : '';
                lines.push(`💻 **${entry.project || 'session'}** ${ts ? `(${ts})` : ''}`);
                if (entry.user_msg)
                    lines.push(`   You: ${entry.user_msg}`);
                if (entry.claude_summary)
                    lines.push(`   Claude: ${entry.claude_summary}`);
                lines.push('');
            }
        }
    }
    catch (err) {
        console.warn('[get_vera_conversations] claude context merge failed:', err?.message);
    }
    if (!lines.length)
        return 'ไม่มี work context จาก Vera หรือ Claude';
    return lines.join('\n');
}
