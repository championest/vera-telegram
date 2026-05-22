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
        name: 'save_work_context',
        description: 'บันทึก work context / สรุปการคุยเรื่องงาน ลง vera-conversations เพื่อให้ Ace ใน Claude Code ดึงมาทำงานต่อได้ ใช้เมื่อ Champ คุยเรื่องโปรเจค, งานค้าง, แผน, หรือ decision สำคัญ',
        parameters: {
            type: 'OBJECT',
            properties: {
                topic: { type: 'STRING', description: 'หัวข้อ เช่น "up-level-guild login bug", "TPT store launch plan"' },
                summary: { type: 'STRING', description: 'สรุปสั้นๆ ว่าคุยอะไร ตัดสินใจอะไร' },
                action_items: {
                    type: 'ARRAY',
                    items: { type: 'STRING' },
                    description: 'งานที่ต้องทำต่อ เช่น ["fix login page", "deploy to Vercel"]',
                },
                project: { type: 'STRING', description: 'ชื่อโปรเจค เช่น "up-level-guild-members-web"' },
            },
            required: ['topic', 'summary'],
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
    // ─── Research ───
    {
        name: 'save_research',
        description: 'Save a research summary with findings and confidence labels to Firestore vera-research collection. Call this AFTER completing all web searches and synthesizing the results.',
        parameters: {
            type: 'OBJECT',
            properties: {
                topic: { type: 'STRING', description: 'Research topic (Thai or English)' },
                summary: { type: 'STRING', description: '2-3 paragraph synthesis of all findings in Thai' },
                findings_json: {
                    type: 'STRING',
                    description: 'JSON array of findings. Each item: {"point":"...","confidence":"verified|uncertain|conflicting","source_url":"..."} e.g. [{"point":"X","confidence":"verified","source_url":"https://..."}]',
                },
                sources_json: {
                    type: 'STRING',
                    description: 'JSON array of sources. Each item: {"title":"...","url":"..."} e.g. [{"title":"BBC","url":"https://bbc.com/..."}]',
                },
                tags: {
                    type: 'ARRAY',
                    items: { type: 'STRING' },
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
            type: 'OBJECT',
            properties: {
                limit: { type: 'NUMBER', description: 'Max results. Default 10.' },
            },
            required: [],
        },
    },
    {
        name: 'get_research',
        description: 'Retrieve full details of a specific saved research by ID.',
        parameters: {
            type: 'OBJECT',
            properties: {
                id: { type: 'STRING', description: 'Firestore document ID of the research' },
            },
            required: ['id'],
        },
    },
    // ─── Gmail draft ───
    {
        name: 'gmail_create_draft',
        description: 'Create a Gmail draft WITHOUT sending. Use this when Champ wants to prepare an email to review before sending.',
        parameters: {
            type: 'OBJECT',
            properties: {
                to: { type: 'STRING', description: 'Recipient email address (optional for drafts)' },
                subject: { type: 'STRING', description: 'Email subject' },
                body: { type: 'STRING', description: 'Plain text email body' },
            },
            required: ['subject', 'body'],
        },
    },
    {
        name: 'gmail_list_drafts',
        description: 'List saved Gmail drafts.',
        parameters: {
            type: 'OBJECT',
            properties: {
                max_results: { type: 'NUMBER', description: 'Max drafts to return. Default 5.' },
            },
            required: [],
        },
    },
    // ─── Web search ───
    {
        name: 'web_search',
        description: 'Search the web for information — prices, news, facts, anything Champ asks about. Returns a summary + top results.',
        parameters: {
            type: 'OBJECT',
            properties: {
                query: { type: 'STRING', description: 'Search query in Thai or English' },
                max_results: { type: 'NUMBER', description: 'Max results to return. Default 5.' },
                search_depth: {
                    type: 'STRING',
                    enum: ['basic', 'advanced'],
                    description: 'basic = fast, advanced = deeper content extraction. Default: basic',
                },
                include_answer: { type: 'BOOLEAN', description: 'Include an AI-generated direct answer. Default true.' },
            },
            required: ['query'],
        },
    },
    {
        name: 'fetch_url',
        description: 'Fetch and extract clean text content from a specific URL. Use when Champ shares a link and wants a summary or details.',
        parameters: {
            type: 'OBJECT',
            properties: {
                url: { type: 'STRING', description: 'Full URL to fetch and extract content from' },
            },
            required: ['url'],
        },
    },
    // ─── Google Docs/Sheets reader (via URL) ───
    {
        name: 'read_google_doc',
        description: 'อ่านเนื้อหา Google Doc จาก URL ที่ Champ ส่งมา ใช้เมื่อ Champ ส่งลิงก์ docs.google.com/document/... หรือ drive link. รองรับทั้งเอกสารส่วนตัวของ Champ (ใช้ OAuth) และเอกสาร public.',
        parameters: {
            type: 'OBJECT',
            properties: {
                url: { type: 'STRING', description: 'URL เต็มของ Google Doc' },
            },
            required: ['url'],
        },
    },
    {
        name: 'read_google_sheet',
        description: 'อ่านข้อมูล Google Sheet จาก URL ที่ Champ ส่งมา ใช้เมื่อ Champ ส่งลิงก์ docs.google.com/spreadsheets/... รองรับทั้ง sheet ส่วนตัวของ Champ และ sheet public ส่งเป็น CSV ทุก sheet.',
        parameters: {
            type: 'OBJECT',
            properties: {
                url: { type: 'STRING', description: 'URL เต็มของ Google Sheet (สามารถมี #gid=... เพื่อระบุแท็บ)' },
                range: { type: 'STRING', description: 'Optional A1 range เช่น "Sheet1!A1:D100". ไม่ระบุ = อ่านทุก sheet ทั้งแท็บ' },
            },
            required: ['url'],
        },
    },
    // ─── Google Drive ───
    {
        name: 'google_drive_save',
        description: 'บันทึก research summary เป็น Google Doc ใน Google Drive โฟลเดอร์ "Vera Research"',
        parameters: {
            type: 'OBJECT',
            properties: {
                title: { type: 'STRING', description: 'ชื่อ document' },
                content: { type: 'STRING', description: 'เนื้อหาทั้งหมดที่ต้องการบันทึก' },
                folder: { type: 'STRING', description: 'ชื่อโฟลเดอร์ใน Drive (default: Vera Research)' },
            },
            required: ['title', 'content'],
        },
    },
    // ─── GitHub ───
    {
        name: 'github_list_repos',
        description: 'List GitHub repos Champ owns, sorted by last updated.',
        parameters: {
            type: 'OBJECT',
            properties: {
                limit: { type: 'NUMBER', description: 'Max repos to return. Default 10.' },
            },
            required: [],
        },
    },
    {
        name: 'github_read_file',
        description: 'Read a file from a GitHub repo.',
        parameters: {
            type: 'OBJECT',
            properties: {
                repo: { type: 'STRING', description: 'Full repo name e.g. "championest/vera-telegram"' },
                path: { type: 'STRING', description: 'File path e.g. "src/index.ts"' },
                branch: { type: 'STRING', description: 'Branch name. Default: main' },
            },
            required: ['repo', 'path'],
        },
    },
    {
        name: 'github_update_file',
        description: 'Create or update a file in a GitHub repo (auto-commits to branch).',
        parameters: {
            type: 'OBJECT',
            properties: {
                repo: { type: 'STRING', description: 'Full repo name e.g. "championest/vera-telegram"' },
                path: { type: 'STRING', description: 'File path e.g. "README.md"' },
                content: { type: 'STRING', description: 'Full file content to write' },
                message: { type: 'STRING', description: 'Commit message. Default: "update via Vera"' },
                branch: { type: 'STRING', description: 'Branch to commit to. Default: main' },
            },
            required: ['repo', 'path', 'content'],
        },
    },
    {
        name: 'github_create_pr',
        description: 'Create a pull request on GitHub.',
        parameters: {
            type: 'OBJECT',
            properties: {
                repo: { type: 'STRING', description: 'Full repo name' },
                title: { type: 'STRING', description: 'PR title' },
                head: { type: 'STRING', description: 'Source branch name' },
                base: { type: 'STRING', description: 'Target branch. Default: main' },
                body: { type: 'STRING', description: 'PR description' },
            },
            required: ['repo', 'title', 'head'],
        },
    },
    {
        name: 'github_list_prs',
        description: 'List pull requests in a GitHub repo.',
        parameters: {
            type: 'OBJECT',
            properties: {
                repo: { type: 'STRING', description: 'Full repo name' },
                state: { type: 'STRING', description: 'open | closed | all. Default: open' },
            },
            required: ['repo'],
        },
    },
    // ─── Railway ───
    {
        name: 'railway_list_services',
        description: 'List all services in a Railway project.',
        parameters: {
            type: 'OBJECT',
            properties: {
                project_id: { type: 'STRING', description: 'Railway project ID (uses RAILWAY_PROJECT_ID env if not provided)' },
            },
            required: [],
        },
    },
    {
        name: 'railway_redeploy',
        description: 'Trigger a redeploy for a Railway service.',
        parameters: {
            type: 'OBJECT',
            properties: {
                service_id: { type: 'STRING', description: 'Railway service ID (from railway_list_services)' },
                environment_id: { type: 'STRING', description: 'Railway environment ID' },
            },
            required: ['service_id', 'environment_id'],
        },
    },
    {
        name: 'railway_get_logs',
        description: 'Get logs from a Railway deployment.',
        parameters: {
            type: 'OBJECT',
            properties: {
                deployment_id: { type: 'STRING', description: 'Railway deployment ID' },
                limit: { type: 'NUMBER', description: 'Max log lines. Default 50.' },
            },
            required: ['deployment_id'],
        },
    },
    // ─── Champ vision ───
    {
        name: 'save_vision',
        description: 'บันทึก vision / เป้าหมายอนาคตของ Champ ลง champ-vision collection (แสดงที่ /champ/vision)',
        parameters: {
            type: 'OBJECT',
            properties: {
                title: { type: 'STRING', description: 'ชื่อ vision เช่น "มีบ้านหลังใหม่"' },
                body: { type: 'STRING', description: 'รายละเอียด vision' },
                category: {
                    type: 'STRING',
                    enum: ['business', 'personal', 'financial', 'lifestyle'],
                    description: 'หมวดหมู่. Default: personal',
                },
                horizon: {
                    type: 'STRING',
                    enum: ['1year', '3year', '5year', 'lifetime'],
                    description: 'ระยะเวลา. Default: 1year',
                },
                image_url: { type: 'STRING', description: 'URL รูปภาพประกอบ (optional)' },
            },
            required: ['title'],
        },
    },
    // ─── Champ finance ───
    {
        name: 'log_finance',
        description: 'บันทึกรายรับ รายจ่าย หรือเป้าหมายการเงินของ Champ ลง champ-finance collection (แสดงที่ /champ/finance)',
        parameters: {
            type: 'OBJECT',
            properties: {
                type: {
                    type: 'STRING',
                    enum: ['income', 'expense', 'goal'],
                    description: 'ประเภท: income=รายรับ, expense=รายจ่าย, goal=เป้าหมาย',
                },
                label: { type: 'STRING', description: 'ชื่อรายการ เช่น "เงินเดือน", "ค่าเช่า", "เก็บเงินซื้อคอนโด"' },
                amount: { type: 'NUMBER', description: 'จำนวนเงิน (บาท)' },
                category: { type: 'STRING', description: 'หมวดหมู่ เช่น salary, rent, food, investment' },
                month: { type: 'STRING', description: 'เดือนที่บันทึก เช่น "2026-05". Default: เดือนปัจจุบัน' },
                notes: { type: 'STRING', description: 'หมายเหตุเพิ่มเติม' },
            },
            required: ['type', 'label', 'amount'],
        },
    },
    // ─── Champ calendar sync ───
    {
        name: 'sync_calendar',
        description: 'ดึง event จาก Google Calendar แล้ว sync ไปที่ Firestore champ-calendar เพื่อแสดงที่ /champ/calendar. ใช้เมื่อ Champ ขอ "ซิงค์ตาราง" หรือ "update ตารางนัด"',
        parameters: {
            type: 'OBJECT',
            properties: {
                days: { type: 'NUMBER', description: 'จำนวนวันข้างหน้าที่จะดึง. Default: 14' },
            },
            required: [],
        },
    },
    // ─── Champ personal tasks ───
    {
        name: 'save_champ_task',
        description: 'บันทึกงานส่วนตัวของ Champ ลง champ-tasks collection (แสดงที่ /champ/tasks). ใช้เมื่อ Champ บอกว่ามีงานที่ต้องทำ, งานค้าง, หรือ to-do',
        parameters: {
            type: 'OBJECT',
            properties: {
                title: { type: 'STRING', description: 'ชื่องาน (Thai or English)' },
                status: {
                    type: 'STRING',
                    enum: ['TODO', 'IN_PROGRESS', 'DONE', 'BLOCKED'],
                    description: 'สถานะงาน. Default: TODO',
                },
                priority: {
                    type: 'STRING',
                    enum: ['low', 'normal', 'high', 'urgent'],
                    description: 'ความสำคัญ. Default: normal',
                },
                notes: { type: 'STRING', description: 'รายละเอียดเพิ่มเติม' },
                due_date: { type: 'STRING', description: 'วันกำหนดส่ง เช่น "2026-06-01" หรือ "สิ้นเดือนนี้"' },
                tags: {
                    type: 'ARRAY',
                    items: { type: 'STRING' },
                    description: 'Tags เช่น ["up-level", "finance", "admin"]',
                },
            },
            required: ['title'],
        },
    },
    {
        name: 'update_champ_task',
        description: 'อัปเดตสถานะหรือรายละเอียดของงานส่วนตัว Champ ใน champ-tasks collection',
        parameters: {
            type: 'OBJECT',
            properties: {
                task_id: { type: 'STRING', description: 'Firestore document ID ของงานที่ต้องการอัปเดต' },
                status: {
                    type: 'STRING',
                    enum: ['TODO', 'IN_PROGRESS', 'DONE', 'BLOCKED'],
                    description: 'สถานะใหม่',
                },
                priority: {
                    type: 'STRING',
                    enum: ['low', 'normal', 'high', 'urgent'],
                },
                notes: { type: 'STRING', description: 'Notes ใหม่' },
                due_date: { type: 'STRING', description: 'วันกำหนดส่งใหม่' },
            },
            required: ['task_id'],
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
    // ─── Champ HQ store tools ───
    {
        name: 'add_preorder',
        description: 'บันทึก pre-order ลูกค้าร้านการ์ด Up Level Academy ลง champ-preorders collection (แสดงที่ /champ/preorders). ใช้เมื่อ Champ บอกว่ามีลูกค้าสั่งการ์ดล่วงหน้า',
        parameters: {
            type: 'OBJECT',
            properties: {
                customer_name: { type: 'STRING', description: 'ชื่อลูกค้า' },
                phone: { type: 'STRING', description: 'เบอร์โทรลูกค้า (optional)' },
                items: { type: 'STRING', description: 'รายการสินค้าที่สั่ง เช่น "Pokemon SV9 Booster Box x3"' },
                deposit_paid: { type: 'NUMBER', description: 'เงินมัดจำที่รับแล้ว (บาท)' },
                total_price: { type: 'NUMBER', description: 'ราคารวมทั้งหมด (บาท)' },
                expected_date: { type: 'STRING', description: 'วันที่คาดว่าของจะมาถึง เช่น "2026-06-15"' },
                notes: { type: 'STRING', description: 'หมายเหตุเพิ่มเติม' },
            },
            required: ['customer_name', 'items'],
        },
    },
    {
        name: 'quick_sale',
        description: 'บันทึกการขายสินค้าจาก Inventory — ลด qty ใน champ-inventory และ auto-log รายรับใน champ-finance. ใช้เมื่อ Champ บอกว่าขายสินค้าได้',
        parameters: {
            type: 'OBJECT',
            properties: {
                item_name: { type: 'STRING', description: 'ชื่อสินค้าที่ขาย (หรือบางส่วนของชื่อ)' },
                qty: { type: 'NUMBER', description: 'จำนวนที่ขาย. Default: 1' },
                price: { type: 'NUMBER', description: 'ราคาขาย/ชิ้น (บาท). ถ้าไม่ระบุ ใช้ราคาจาก Inventory' },
            },
            required: ['item_name'],
        },
    },
];
