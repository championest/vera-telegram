export const toolDefinitions = [
    // ─── Gmail ───
    {
        name: 'gmail_list_unread',
        description: 'List unread emails in Champ\'s Gmail inbox.',
        parameters: {
            type: 'OBJECT',
            properties: {
                limit: { type: 'NUMBER', description: 'Max number of emails to return. Default 5.' },
            },
            required: [],
        },
    },
    {
        name: 'gmail_search',
        description: 'Search Gmail with a query (supports Gmail search operators like from:, subject:, is:unread etc.)',
        parameters: {
            type: 'OBJECT',
            properties: {
                query: { type: 'STRING', description: 'Gmail search query e.g. "from:boss@example.com subject:report"' },
                limit: { type: 'NUMBER', description: 'Max results. Default 5.' },
            },
            required: ['query'],
        },
    },
    {
        name: 'gmail_read',
        description: 'Read the full content of a specific email by message ID.',
        parameters: {
            type: 'OBJECT',
            properties: {
                message_id: { type: 'STRING', description: 'Gmail message ID (from gmail_list_unread or gmail_search)' },
            },
            required: ['message_id'],
        },
    },
    {
        name: 'gmail_send',
        description: 'Send an email from Champ\'s Gmail account.',
        parameters: {
            type: 'OBJECT',
            properties: {
                to: { type: 'STRING', description: 'Recipient email address' },
                subject: { type: 'STRING', description: 'Email subject' },
                body: { type: 'STRING', description: 'Plain text email body' },
                reply_to_message_id: { type: 'STRING', description: 'Optional: message ID to reply to (for threading)' },
            },
            required: ['to', 'subject', 'body'],
        },
    },
    // ─── Google Calendar ───
    {
        name: 'calendar_list_events',
        description: 'List upcoming calendar events for Champ.',
        parameters: {
            type: 'OBJECT',
            properties: {
                days: { type: 'NUMBER', description: 'How many days ahead to look. Default 7.' },
                max_results: { type: 'NUMBER', description: 'Max events to return. Default 10.' },
            },
            required: [],
        },
    },
    {
        name: 'calendar_create_event',
        description: 'Create a new calendar event for Champ.',
        parameters: {
            type: 'OBJECT',
            properties: {
                title: { type: 'STRING', description: 'Event title' },
                start_datetime: { type: 'STRING', description: 'ISO 8601 datetime e.g. "2026-05-15T10:00:00+07:00" or date "2026-05-15" for all-day' },
                end_datetime: { type: 'STRING', description: 'ISO 8601 end datetime. Defaults to 1 hour after start.' },
                description: { type: 'STRING', description: 'Optional event description' },
                location: { type: 'STRING', description: 'Optional location' },
                all_day: { type: 'BOOLEAN', description: 'Set true for all-day events' },
            },
            required: ['title', 'start_datetime'],
        },
    },
    // ─── Session bridge ───
    {
        name: 'get_session_context',
        description: 'Get the latest work session log from Champ\'s computer (what the team was working on in Claude Code).',
        parameters: {
            type: 'OBJECT',
            properties: {
                limit: { type: 'NUMBER', description: 'Max log entries per session to show. Default 5.' },
            },
            required: [],
        },
    },
    {
        name: 'write_note_to_claude',
        description: 'Write a note or instruction that Ace (Claude Code) will read at the start of the next computer session.',
        parameters: {
            type: 'OBJECT',
            properties: {
                note: { type: 'STRING', description: 'The note or instruction to leave for Ace' },
                topic: { type: 'STRING', description: 'Topic tag e.g. "task", "reminder", "idea". Default: general' },
            },
            required: ['note'],
        },
    },
    {
        name: 'save_idea',
        description: 'Save an idea from Champ to Firestore for future reference.',
        parameters: {
            type: 'OBJECT',
            properties: {
                title: { type: 'STRING', description: 'Short title for the idea (Thai or English)' },
                body: { type: 'STRING', description: 'Full description of the idea' },
                tags: {
                    type: 'ARRAY',
                    items: { type: 'STRING' },
                    description: 'Optional tags e.g. ["product", "up-level", "marketing"]',
                },
            },
            required: ['title', 'body'],
        },
    },
    {
        name: 'set_reminder',
        description: 'Schedule a reminder that Vera will send to Champ at the specified time.',
        parameters: {
            type: 'OBJECT',
            properties: {
                message: { type: 'STRING', description: 'What to remind Champ about' },
                remind_at: {
                    type: 'STRING',
                    description: 'ISO 8601 datetime string in Asia/Bangkok timezone e.g. "2026-05-14T15:00:00+07:00"',
                },
                repeat: {
                    type: 'STRING',
                    enum: ['none', 'daily', 'weekly'],
                    description: 'Whether the reminder repeats. Default: none',
                },
            },
            required: ['message', 'remind_at'],
        },
    },
    {
        name: 'list_reminders',
        description: 'List all active (unsent) reminders for Champ.',
        parameters: {
            type: 'OBJECT',
            properties: {
                include_past: {
                    type: 'BOOLEAN',
                    description: 'If true, include already-fired reminders. Default false.',
                },
            },
            required: [],
        },
    },
    {
        name: 'search_memory',
        description: 'Search past conversation history stored for this user in Firestore.',
        parameters: {
            type: 'OBJECT',
            properties: {
                query: { type: 'STRING', description: 'What to search for in past messages' },
                limit: {
                    type: 'NUMBER',
                    description: 'Max number of matching messages to return. Default 10.',
                },
            },
            required: ['query'],
        },
    },
    // ─── Gmail actions ───
    {
        name: 'gmail_mark_read',
        description: 'Mark a specific Gmail message as read.',
        parameters: {
            type: 'OBJECT',
            properties: {
                message_id: { type: 'STRING', description: 'Gmail message ID to mark as read' },
            },
            required: ['message_id'],
        },
    },
    {
        name: 'gmail_trash',
        description: 'Move a Gmail message to Trash.',
        parameters: {
            type: 'OBJECT',
            properties: {
                message_id: { type: 'STRING', description: 'Gmail message ID to move to trash' },
            },
            required: ['message_id'],
        },
    },
    // ─── Reminder management ───
    {
        name: 'cancel_reminder',
        description: 'Cancel (delete) an active reminder by ID.',
        parameters: {
            type: 'OBJECT',
            properties: {
                reminder_id: { type: 'STRING', description: 'Firestore document ID of the reminder to cancel' },
            },
            required: ['reminder_id'],
        },
    },
    {
        name: 'snooze_reminder',
        description: 'Snooze a reminder — delay it by a specified number of minutes.',
        parameters: {
            type: 'OBJECT',
            properties: {
                reminder_id: { type: 'STRING', description: 'Firestore document ID of the reminder to snooze' },
                minutes: { type: 'NUMBER', description: 'How many minutes to snooze. Default 60.' },
            },
            required: ['reminder_id'],
        },
    },
    // ─── Session bridge ───
    {
        name: 'read_ace_notes',
        description: 'Read notes left in claude-notes collection — notes from Champ or Claude Code for Ace to read.',
        parameters: {
            type: 'OBJECT',
            properties: {
                limit: { type: 'NUMBER', description: 'Max notes to return. Default 10.' },
            },
            required: [],
        },
    },
    // ─── Calendar edit/delete ───
    {
        name: 'calendar_update_event',
        description: 'Update an existing Google Calendar event.',
        parameters: {
            type: 'OBJECT',
            properties: {
                event_id: { type: 'STRING', description: 'Google Calendar event ID' },
                title: { type: 'STRING', description: 'New event title' },
                start_datetime: { type: 'STRING', description: 'New start datetime ISO 8601' },
                end_datetime: { type: 'STRING', description: 'New end datetime ISO 8601' },
                description: { type: 'STRING', description: 'New event description' },
                location: { type: 'STRING', description: 'New location' },
                all_day: { type: 'BOOLEAN', description: 'All-day event flag' },
            },
            required: ['event_id'],
        },
    },
    {
        name: 'calendar_delete_event',
        description: 'Delete a Google Calendar event.',
        parameters: {
            type: 'OBJECT',
            properties: {
                event_id: { type: 'STRING', description: 'Google Calendar event ID to delete' },
            },
            required: ['event_id'],
        },
    },
    // ─── Long-term memory ───
    {
        name: 'save_fact',
        description: 'Save an important fact about Champ to long-term memory (persists beyond conversation history).',
        parameters: {
            type: 'OBJECT',
            properties: {
                fact: { type: 'STRING', description: 'The fact to remember, e.g. "Champ prefers morning meetings"' },
                category: { type: 'STRING', description: 'Category tag e.g. preference, business, personal, project. Default: general' },
            },
            required: ['fact'],
        },
    },
    {
        name: 'recall_facts',
        description: 'Retrieve facts saved in long-term memory about Champ.',
        parameters: {
            type: 'OBJECT',
            properties: {
                category: { type: 'STRING', description: 'Optional: filter by category. Leave empty for all facts.' },
            },
            required: [],
        },
    },
    // ─── Task update ───
    {
        name: 'log_team_task',
        description: 'Dispatch a new task to a team member, OR update an existing task status by providing task_id.',
        parameters: {
            type: 'OBJECT',
            properties: {
                task_id: { type: 'STRING', description: 'Optional: Firestore doc ID of existing task to update (skip member/task fields if updating)' },
                member: {
                    type: 'STRING',
                    enum: ['ace', 'kai', 'nova', 'sam', 'jade', 'iris', 'pixel', 'bolt', 'rena', 'max', 'sage', 'flux', 'vera'],
                    description: 'Team member to assign task to (required for new tasks)',
                },
                task: { type: 'STRING', description: 'Task description (required for new tasks)' },
                status: {
                    type: 'STRING',
                    enum: ['TODO', 'IN_PROGRESS', 'DONE', 'BLOCKED'],
                    description: 'Task status',
                },
                notes: { type: 'STRING', description: 'Optional context notes' },
                handoff_to: { type: 'STRING', description: 'Optional next team member for handoff' },
                priority: {
                    type: 'STRING',
                    enum: ['low', 'normal', 'high', 'urgent'],
                    description: 'Task priority. Default: normal',
                },
            },
            required: [],
        },
    },
];
