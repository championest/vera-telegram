import { z } from 'zod';

const envSchema = z.object({
  TELEGRAM_BOT_TOKEN: z.string().min(1),
  ANTHROPIC_API_KEY: z.string().min(1),
  GEMINI_API_KEY: z.string().optional(),
  FIREBASE_PROJECT_ID: z.string().min(1),
  FIREBASE_CLIENT_EMAIL: z.string().email(),
  FIREBASE_PRIVATE_KEY: z.string().min(1),
  TELEGRAM_OWNER_CHAT_ID: z.string().min(1),
  NODE_ENV: z.enum(['development', 'production']).default('development'),
  PORT: z.string().default('3000'),
  MAX_MEMORY_MESSAGES: z.string().default('20'),
  // Google OAuth2 (Gmail + Calendar) — optional, set to enable /connect
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
  GOOGLE_REDIRECT_URI: z.string().optional(),
  // Tavily — optional, set to enable web_search + fetch_url tools
  TAVILY_API_KEY: z.string().optional(),
  // GitHub — optional, set to enable github_* tools
  GITHUB_TOKEN: z.string().optional(),
  // Railway — optional, set to enable railway_* tools
  RAILWAY_TOKEN: z.string().optional(),
  RAILWAY_PROJECT_ID: z.string().optional(),
});

export const config = envSchema.parse(process.env);
