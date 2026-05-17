import type { FunctionDeclaration } from '@google/generative-ai';

export const toolDefinitions: FunctionDeclaration[] = [
  // ─── Gmail ───
  {
    name: 'gmail_list_unread',
    description: 'List unread emails in Champ\'s Gmail inbox.',
    parameters: {
      type: 'OBJECT' as any,
      properties: {
        limit: { type: 'NUMBER' as any, description: 'Max number of emails to return. Default 5.' },
      },
      required: [],
    },
  },
  {
    name: 'gmail_search',
    description: 'Search Gmail with a query (supports Gmail search operators like from:, subject:, is:unread etc.)',
    parameters: {
      type: 'OBJECT' as any,
      properties: {
        query: { type: 'STRING' as any, description: 'Gmail search query e.g. "from:boss@example.com subject:report"' },
        limit: { type: 'NUMBER' as any, description: 'Max results. Default 5.' },
      },
      required: ['query'],
    },
  },
  {
    name: 'gmail_read',
    description: 'Read the full content of a specific email by message ID.',
    parameters: {
      type: 'OBJECT' as any,
      properties: {
        message_id: { type: 'STRING' as any, description: 'Gmail message ID (from gmail_list_unread or gmail_search)' },
      },
      required: ['message_id'],
    },
  },
  {
    name: 'gmail_send',
    description: 'Send an email from Champ\'s Gmail account.',
    parameters: {
      type: 'OBJECT' as any,
      properties: {
        to: { type: 'STRING' as any, description: 'Recipient email address' },
        subject: { type: 'STRING' as any, description: 'Email subject' },
        body: { type: 'STRING' as any, description: 'Plain text email body' },
        reply_to_message_id: { type: 'STRING' as any, description: 'Optional: message ID to reply to (for threading)' },
      },
      required: ['to', 'subject', 'body'],
    },
  },
  // ─── Google Calendar ───
  {
    name: 'calendar_list_events',
    description: 'List upcoming calendar events for Champ.',
    parameters: {
      type: 'OBJECT' as any,
      properties: {
        days: { type: 'NUMBER' as any, description: 'How many days ahead to look. Default 7.' },
        max_results: { type: 'NUMBER' as any, description: 'Max events to return. Default 10.' },
      },
      required: [],
    },
  },
  {
    name: 'calendar_create_event',
    description: 'Create a new calendar event for Champ.',
    parameters: {
      type: 'OBJECT' as any,
      properties: {
        title: { type: 'STRING' as any, description: 'Event title' },
        start_datetime: { type: 'STRING' as any, description: 'ISO 8601 datetime e.g. "2026-05-15T10:00:00+07:00" or date "2026-05-15" for all-day' },
        end_datetime: { type: 'STRING' as any, description: 'ISO 8601 end datetime. Defaults to 1 hour after start.' },
        description: { type: 'STRING' as any, description: 'Optional event description' },
        location: { type: 'STRING' as any, description: 'Optional location' },
        all_day: { type: 'BOOLEAN' as any, description: 'Set true for all-day events' },
      },
      required: ['title', 'start_datetime'],
    },
  },
  // ─── Session bridge ───
  {
    name: 'get_session_context',
    description: 'Get the latest work session log from Champ\'s computer (what the team was working on in Claude Code).',
    parameters: {
      type: 'OBJECT' as any,
      properties: {
        limit: { type: 'NUMBER' as any, description: 'Max log entries per session to show. Default 5.' },
      },
      required: [],
    },
  },
  {
    name: 'write_note_to_claude',
    description: 'Write a note or instruction that Ace (Claude Code) will read at the start of the next computer session.',
    parameters: {
      type: 'OBJECT' as any,
      properties: {
        note: { type: 'STRING' as any, description: 'The note or instruction to leave for Ace' },
        topic: { type: 'STRING' as any, description: 'Topic tag e.g. "task", "reminder", "idea". Default: general' },
      },
      required: ['note'],
    },
  },

  {
    name: 'save_idea',
    description: 'Save an idea from Champ to Firestore for future reference.',
    parameters: {
      type: 'OBJECT' as any,
      properties: {
        title: { type: 'STRING' as any, description: 'Short title for the idea (Thai or English)' },
        body: { type: 'STRING' as any, description: 'Full description of the idea' },
        tags: {
          type: 'ARRAY' as any,
          items: { type: 'STRING' as any },
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
      type: 'OBJECT' as any,
      properties: {
        message: { type: 'STRING' as any, description: 'What to remind Champ about' },
        remind_at: {
          type: 'STRING' as any,
          description: 'ISO 8601 datetime string in Asia/Bangkok timezone e.g. "2026-05-14T15:00:00+07:00"',
        },
        repeat: {
          type: 'STRING' as any,
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
      type: 'OBJECT' as any,
      properties: {
        include_past: {
          type: 'BOOLEAN' as any,
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
      type: 'OBJECT' as any,
      properties: {
        query: { type: 'STRING' as any, description: 'What to search for in past messages' },
        limit: {
          type: 'NUMBER' as any,
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
      type: 'OBJECT' as any,
      properties: {
        message_id: { type: 'STRING' as any, description: 'Gmail message ID to mark as read' },
      },
      required: ['message_id'],
    },
  },
  {
    name: 'gmail_trash',
    description: 'Move a Gmail message to Trash.',
    parameters: {
      type: 'OBJECT' as any,
      properties: {
        message_id: { type: 'STRING' as any, description: 'Gmail message ID to move to trash' },
      },
      required: ['message_id'],
    },
  },
  // ─── Reminder management ───
  {
    name: 'cancel_reminder',
    description: 'Cancel (delete) an active reminder by ID.',
    parameters: {
      type: 'OBJECT' as any,
      properties: {
        reminder_id: { type: 'STRING' as any, description: 'Firestore document ID of the reminder to cancel' },
      },
      required: ['reminder_id'],
    },
  },
  {
    name: 'snooze_reminder',
    description: 'Snooze a reminder — delay it by a specified number of minutes.',
    parameters: {
      type: 'OBJECT' as any,
      properties: {
        reminder_id: { type: 'STRING' as any, description: 'Firestore document ID of the reminder to snooze' },
        minutes: { type: 'NUMBER' as any, description: 'How many minutes to snooze. Default 60.' },
      },
      required: ['reminder_id'],
    },
  },
  // ─── Session bridge ───
  {
    name: 'read_ace_notes',
    description: 'Read notes left in claude-notes collection — notes from Champ or Claude Code for Ace to read.',
    parameters: {
      type: 'OBJECT' as any,
      properties: {
        limit: { type: 'NUMBER' as any, description: 'Max notes to return. Default 10.' },
      },
      required: [],
    },
  },
  // ─── Calendar edit/delete ───
  {
    name: 'calendar_update_event',
    description: 'Update an existing Google Calendar event.',
    parameters: {
      type: 'OBJECT' as any,
      properties: {
        event_id: { type: 'STRING' as any, description: 'Google Calendar event ID' },
        title: { type: 'STRING' as any, description: 'New event title' },
        start_datetime: { type: 'STRING' as any, description: 'New start datetime ISO 8601' },
        end_datetime: { type: 'STRING' as any, description: 'New end datetime ISO 8601' },
        description: { type: 'STRING' as any, description: 'New event description' },
        location: { type: 'STRING' as any, description: 'New location' },
        all_day: { type: 'BOOLEAN' as any, description: 'All-day event flag' },
      },
      required: ['event_id'],
    },
  },
  {
    name: 'calendar_delete_event',
    description: 'Delete a Google Calendar event.',
    parameters: {
      type: 'OBJECT' as any,
      properties: {
        event_id: { type: 'STRING' as any, description: 'Google Calendar event ID to delete' },
      },
      required: ['event_id'],
    },
  },
  // ─── Long-term memory ───
  {
    name: 'save_fact',
    description: 'Save an important fact about Champ to long-term memory (persists beyond conversation history).',
    parameters: {
      type: 'OBJECT' as any,
      properties: {
        fact: { type: 'STRING' as any, description: 'The fact to remember, e.g. "Champ prefers morning meetings"' },
        category: { type: 'STRING' as any, description: 'Category tag e.g. preference, business, personal, project. Default: general' },
      },
      required: ['fact'],
    },
  },
  {
    name: 'recall_facts',
    description: 'Retrieve facts saved in long-term memory about Champ.',
    parameters: {
      type: 'OBJECT' as any,
      properties: {
        category: { type: 'STRING' as any, description: 'Optional: filter by category. Leave empty for all facts.' },
      },
      required: [],
    },
  },
  // ─── Research ───
  {
    name: 'save_research',
    description: 'Save a research summary with findings and confidence labels to Firestore vera-research collection. Call this AFTER completing all web searches and synthesizing the results.',
    parameters: {
      type: 'OBJECT' as any,
      properties: {
        topic: { type: 'STRING' as any, description: 'Research topic (Thai or English)' },
        summary: { type: 'STRING' as any, description: '2-3 paragraph synthesis of all findings in Thai' },
        findings_json: {
          type: 'STRING' as any,
          description: 'JSON array of findings. Each item: {"point":"...","confidence":"verified|uncertain|conflicting","source_url":"..."} e.g. [{"point":"X","confidence":"verified","source_url":"https://..."}]',
        },
        sources_json: {
          type: 'STRING' as any,
          description: 'JSON array of sources. Each item: {"title":"...","url":"..."} e.g. [{"title":"BBC","url":"https://bbc.com/..."}]',
        },
        tags: {
          type: 'ARRAY' as any,
          items: { type: 'STRING' as any },
          description: 'Tags for categorization e.g. ["business", "tech", "education"]',
        },
      },
      required: ['topic', 'summary'],
    },
  },
  {
    name: 'list_research',
    description: 'List saved research topics from vera-research collection.',
    parameters: {
      type: 'OBJECT' as any,
      properties: {
        limit: { type: 'NUMBER' as any, description: 'Max results. Default 10.' },
      },
      required: [],
    },
  },
  {
    name: 'get_research',
    description: 'Retrieve full details of a specific saved research by ID.',
    parameters: {
      type: 'OBJECT' as any,
      properties: {
        id: { type: 'STRING' as any, description: 'Firestore document ID of the research' },
      },
      required: ['id'],
    },
  },
  // ─── Gmail draft ───
  {
    name: 'gmail_create_draft',
    description: 'Create a Gmail draft WITHOUT sending. Use this when Champ wants to prepare an email to review before sending.',
    parameters: {
      type: 'OBJECT' as any,
      properties: {
        to: { type: 'STRING' as any, description: 'Recipient email address (optional for drafts)' },
        subject: { type: 'STRING' as any, description: 'Email subject' },
        body: { type: 'STRING' as any, description: 'Plain text email body' },
      },
      required: ['subject', 'body'],
    },
  },
  {
    name: 'gmail_list_drafts',
    description: 'List saved Gmail drafts.',
    parameters: {
      type: 'OBJECT' as any,
      properties: {
        max_results: { type: 'NUMBER' as any, description: 'Max drafts to return. Default 5.' },
      },
      required: [],
    },
  },
  // ─── Web search ───
  {
    name: 'web_search',
    description: 'Search the web for information — prices, news, facts, anything Champ asks about. Returns a summary + top results.',
    parameters: {
      type: 'OBJECT' as any,
      properties: {
        query: { type: 'STRING' as any, description: 'Search query in Thai or English' },
        max_results: { type: 'NUMBER' as any, description: 'Max results to return. Default 5.' },
        search_depth: {
          type: 'STRING' as any,
          enum: ['basic', 'advanced'],
          description: 'basic = fast, advanced = deeper content extraction. Default: basic',
        },
        include_answer: { type: 'BOOLEAN' as any, description: 'Include an AI-generated direct answer. Default true.' },
      },
      required: ['query'],
    },
  },
  {
    name: 'fetch_url',
    description: 'Fetch and extract clean text content from a specific URL. Use when Champ shares a link and wants a summary or details.',
    parameters: {
      type: 'OBJECT' as any,
      properties: {
        url: { type: 'STRING' as any, description: 'Full URL to fetch and extract content from' },
      },
      required: ['url'],
    },
  },
  // ─── Google Drive ───
  {
    name: 'google_drive_save',
    description: 'บันทึก research summary เป็น Google Doc ใน Google Drive โฟลเดอร์ "Vera Research"',
    parameters: {
      type: 'OBJECT' as any,
      properties: {
        title: { type: 'STRING' as any, description: 'ชื่อ document' },
        content: { type: 'STRING' as any, description: 'เนื้อหาทั้งหมดที่ต้องการบันทึก' },
        folder: { type: 'STRING' as any, description: 'ชื่อโฟลเดอร์ใน Drive (default: Vera Research)' },
      },
      required: ['title', 'content'],
    },
  },
  // ─── GitHub ───
  {
    name: 'github_list_repos',
    description: 'List GitHub repos Champ owns, sorted by last updated.',
    parameters: {
      type: 'OBJECT' as any,
      properties: {
        limit: { type: 'NUMBER' as any, description: 'Max repos to return. Default 10.' },
      },
      required: [],
    },
  },
  {
    name: 'github_read_file',
    description: 'Read a file from a GitHub repo.',
    parameters: {
      type: 'OBJECT' as any,
      properties: {
        repo: { type: 'STRING' as any, description: 'Full repo name e.g. "championest/vera-telegram"' },
        path: { type: 'STRING' as any, description: 'File path e.g. "src/index.ts"' },
        branch: { type: 'STRING' as any, description: 'Branch name. Default: main' },
      },
      required: ['repo', 'path'],
    },
  },
  {
    name: 'github_update_file',
    description: 'Create or update a file in a GitHub repo (auto-commits to branch).',
    parameters: {
      type: 'OBJECT' as any,
      properties: {
        repo: { type: 'STRING' as any, description: 'Full repo name e.g. "championest/vera-telegram"' },
        path: { type: 'STRING' as any, description: 'File path e.g. "README.md"' },
        content: { type: 'STRING' as any, description: 'Full file content to write' },
        message: { type: 'STRING' as any, description: 'Commit message. Default: "update via Vera"' },
        branch: { type: 'STRING' as any, description: 'Branch to commit to. Default: main' },
      },
      required: ['repo', 'path', 'content'],
    },
  },
  {
    name: 'github_create_pr',
    description: 'Create a pull request on GitHub.',
    parameters: {
      type: 'OBJECT' as any,
      properties: {
        repo: { type: 'STRING' as any, description: 'Full repo name' },
        title: { type: 'STRING' as any, description: 'PR title' },
        head: { type: 'STRING' as any, description: 'Source branch name' },
        base: { type: 'STRING' as any, description: 'Target branch. Default: main' },
        body: { type: 'STRING' as any, description: 'PR description' },
      },
      required: ['repo', 'title', 'head'],
    },
  },
  {
    name: 'github_list_prs',
    description: 'List pull requests in a GitHub repo.',
    parameters: {
      type: 'OBJECT' as any,
      properties: {
        repo: { type: 'STRING' as any, description: 'Full repo name' },
        state: { type: 'STRING' as any, description: 'open | closed | all. Default: open' },
      },
      required: ['repo'],
    },
  },
  // ─── Railway ───
  {
    name: 'railway_list_services',
    description: 'List all services in a Railway project.',
    parameters: {
      type: 'OBJECT' as any,
      properties: {
        project_id: { type: 'STRING' as any, description: 'Railway project ID (uses RAILWAY_PROJECT_ID env if not provided)' },
      },
      required: [],
    },
  },
  {
    name: 'railway_redeploy',
    description: 'Trigger a redeploy for a Railway service.',
    parameters: {
      type: 'OBJECT' as any,
      properties: {
        service_id: { type: 'STRING' as any, description: 'Railway service ID (from railway_list_services)' },
        environment_id: { type: 'STRING' as any, description: 'Railway environment ID' },
      },
      required: ['service_id', 'environment_id'],
    },
  },
  {
    name: 'railway_get_logs',
    description: 'Get logs from a Railway deployment.',
    parameters: {
      type: 'OBJECT' as any,
      properties: {
        deployment_id: { type: 'STRING' as any, description: 'Railway deployment ID' },
        limit: { type: 'NUMBER' as any, description: 'Max log lines. Default 50.' },
      },
      required: ['deployment_id'],
    },
  },
  // ─── Task update ───
  {
    name: 'log_team_task',
    description: 'Dispatch a new task to a team member, OR update an existing task status by providing task_id.',
    parameters: {
      type: 'OBJECT' as any,
      properties: {
        task_id: { type: 'STRING' as any, description: 'Optional: Firestore doc ID of existing task to update (skip member/task fields if updating)' },
        member: {
          type: 'STRING' as any,
          enum: ['ace', 'kai', 'nova', 'sam', 'jade', 'iris', 'pixel', 'bolt', 'rena', 'max', 'sage', 'flux', 'vera'],
          description: 'Team member to assign task to (required for new tasks)',
        },
        task: { type: 'STRING' as any, description: 'Task description (required for new tasks)' },
        status: {
          type: 'STRING' as any,
          enum: ['TODO', 'IN_PROGRESS', 'DONE', 'BLOCKED'],
          description: 'Task status',
        },
        notes: { type: 'STRING' as any, description: 'Optional context notes' },
        handoff_to: { type: 'STRING' as any, description: 'Optional next team member for handoff' },
        priority: {
          type: 'STRING' as any,
          enum: ['low', 'normal', 'high', 'urgent'],
          description: 'Task priority. Default: normal',
        },
      },
      required: [],
    },
  },
];
