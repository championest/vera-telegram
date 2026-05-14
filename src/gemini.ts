import { GoogleGenerativeAI } from '@google/generative-ai';
import { config } from './config.js';

export const genAI = new GoogleGenerativeAI(config.GEMINI_API_KEY);
export const MODEL_NAME = 'gemini-2.5-flash';
