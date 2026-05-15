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
        name: 'log_team_task',
        description: 'Log a task to the Firestore team-workflow collection, assigning it to a team member.',
        parameters: {
            type: 'OBJECT',
            properties: {
                member: {
                    type: 'STRING',
                    enum: ['ace', 'kai', 'nova', 'sam', 'jade', 'iris', 'pixel', 'bolt', 'rena', 'max', 'sage', 'flux', 'vera'],
                    description: 'The team member to assign the task to',
                },
                task: { type: 'STRING', description: 'Description of the task' },
                status: {
                    type: 'STRING',
                    enum: ['TODO', 'IN_PROGRESS', 'DONE', 'BLOCKED'],
                    description: 'Initial status. Default: TODO',
                },
                notes: { type: 'STRING', description: 'Optional context notes' },
                handoff_to: { type: 'STRING', description: 'Optional next team member for handoff' },
                priority: {
                    type: 'STRING',
                    enum: ['low', 'normal', 'high', 'urgent'],
                    description: 'Task priority. Default: normal',
                },
            },
            required: ['member', 'task'],
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
];
