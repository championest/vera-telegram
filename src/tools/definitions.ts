import type { FunctionDeclaration } from '@google/generative-ai';

export const toolDefinitions: FunctionDeclaration[] = [
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
    name: 'log_team_task',
    description: 'Log a task to the Firestore team-workflow collection, assigning it to a team member.',
    parameters: {
      type: 'OBJECT' as any,
      properties: {
        member: {
          type: 'STRING' as any,
          enum: ['ace', 'kai', 'nova', 'sam', 'jade', 'iris', 'pixel', 'bolt', 'rena', 'max', 'sage', 'flux', 'vera'],
          description: 'The team member to assign the task to',
        },
        task: { type: 'STRING' as any, description: 'Description of the task' },
        status: {
          type: 'STRING' as any,
          enum: ['TODO', 'IN_PROGRESS', 'DONE', 'BLOCKED'],
          description: 'Initial status. Default: TODO',
        },
        notes: { type: 'STRING' as any, description: 'Optional context notes' },
        handoff_to: { type: 'STRING' as any, description: 'Optional next team member for handoff' },
        priority: {
          type: 'STRING' as any,
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
];
