import Anthropic from '@anthropic-ai/sdk';
import { config } from './config.js';
import { toolDefinitions } from './tools/definitions.js';

export const anthropic = new Anthropic({ apiKey: config.ANTHROPIC_API_KEY });

export const HAIKU  = 'claude-haiku-4-5'  as const; // fast — HQ chat
export const SONNET = 'claude-sonnet-4-6' as const; // smart — Telegram + dispatch

/** Convert Gemini-style tool definitions to Claude format */
function convertSchema(schema: any): any {
  if (!schema) return { type: 'object', properties: {} };
  const converted: any = {
    type: (schema.type || 'object').toLowerCase(),
  };
  if (schema.properties) {
    converted.properties = Object.fromEntries(
      Object.entries(schema.properties).map(([k, v]: [string, any]) => [
        k,
        {
          ...(v.description ? { description: v.description } : {}),
          type: v.type ? v.type.toLowerCase() : 'string',
          ...(v.enum ? { enum: v.enum } : {}),
          ...(v.items ? { items: convertSchema(v.items) } : {}),
        },
      ])
    );
  }
  if (schema.required?.length) converted.required = schema.required;
  return converted;
}

export const claudeTools: Anthropic.Tool[] = toolDefinitions.map(t => ({
  name: t.name,
  description: t.description,
  input_schema: convertSchema(t.parameters) as Anthropic.Tool['input_schema'],
}));
