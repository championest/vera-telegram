import type Anthropic from '@anthropic-ai/sdk';

export const toolDefinitions: Anthropic.Tool[] = [
  {
    name: 'save_idea',
    description: 'Save an idea from Champ to Firestore for future reference.',
    input_schema: {
      type: 'object' as const,
      properties: {
        title: { type: 'string', description: 'Short title for the idea (Thai or English)' },
        body: { type: 'string', description: 'Full description of the idea' },
        tags: {
          type: 'array',
          items: { type: 'string' },
          description: 'Optional tags e.g. ["product", "up-level", "marketing"]',
        },
      },
      required: ['title', 'body'],
    },
  },
  {
    name: 'set_reminder',
    description: 'Schedule a reminder that Vera will send to Champ at the specified time.',
    input_schema: {
      type: 'object' as const,
      properties: {
        message: { type: 'string', description: 'What to remind Champ about' },
        remind_at: {
          type: 'string',
          description: 'ISO 8601 datetime string in Asia/Bangkok timezone e.g. "2026-05-14T15:00:00+07:00"',
        },
        repeat: {
          type: 'string',
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
    input_schema: {
      type: 'object' as const,
      properties: {
        include_past: {
          type: 'boolean',
          description: 'If true, include already-fired reminders. Default false.',
        },
      },
      required: [],
    },
  },
  {
    name: 'log_team_task',
    description: 'Log a task to the Firestore team-workflow collection, assigning it to a team member.',
    input_schema: {
      type: 'object' as const,
      properties: {
        member: {
          type: 'string',
          enum: ['ace', 'kai', 'nova', 'sam', 'jade', 'iris', 'pixel', 'bolt', 'rena', 'max', 'sage', 'flux', 'vera'],
          description: 'The team member to assign the task to',
        },
        task: { type: 'string', description: 'Description of the task' },
        status: {
          type: 'string',
          enum: ['TODO', 'IN_PROGRESS', 'DONE', 'BLOCKED'],
          description: 'Initial status. Default: TODO',
        },
        notes: { type: 'string', description: 'Optional context notes' },
        handoff_to: { type: 'string', description: 'Optional next team member for handoff' },
        priority: {
          type: 'string',
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
    input_schema: {
      type: 'object' as const,
      properties: {
        query: { type: 'string', description: 'What to search for in past messages' },
        limit: {
          type: 'number',
          description: 'Max number of matching messages to return. Default 10.',
        },
      },
      required: ['query'],
    },
  },
];
