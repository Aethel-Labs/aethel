import { config } from 'dotenv';

config();

const requiredEnvVars = {
  TOKEN: process.env.TOKEN,
  CLIENT_ID: process.env.CLIENT_ID,
  DATABASE_URL: process.env.DATABASE_URL,
  API_KEY_ENCRYPTION_SECRET: process.env.API_KEY_ENCRYPTION_SECRET,
  CLIENT_SECRET: process.env.CLIENT_SECRET,
  REDIRECT_URI: process.env.REDIRECT_URI,
};

for (const [key, value] of Object.entries(requiredEnvVars)) {
  if (!value) {
    throw new Error(`${key} environment variable is required`);
  }
}

export const PORT = process.env.PORT ?? 2020;
export const NODE_ENV = process.env.NODE_ENV ?? 'dev';
export const API_KEY_ENCRYPTION_SECRET = process.env.API_KEY_ENCRYPTION_SECRET!;
export const STATUS_API_KEY = process.env.STATUS_API_KEY ?? 'whatifitdoentexist';
export const ALLOWED_ORIGINS = process.env.ALLOWED_ORIGINS ?? 'http://localhost:3000';
export const DATABASE_URL = process.env.DATABASE_URL!;
export const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
export const OPENWEATHER_API_KEY = process.env.OPENWEATHER_API_KEY;
export const SOURCE_COMMIT = process.env.SOURCE_COMMIT;
export const TOKEN = process.env.TOKEN!;
export const CLIENT_ID = process.env.CLIENT_ID!;

if (OPENROUTER_API_KEY && OPENROUTER_API_KEY.length < 10) {
  console.warn('OPENROUTER_API_KEY appears to be invalid (too short)');
}

if (OPENWEATHER_API_KEY && OPENWEATHER_API_KEY.length < 10) {
  console.warn('OPENWEATHER_API_KEY appears to be invalid (too short)');
}

export const RATE_LIMIT_WINDOW_MS = parseInt(process.env.RATE_LIMIT_WINDOW_MS || '900000', 10); // 15 minutes
export const RATE_LIMIT_MAX = parseInt(process.env.RATE_LIMIT_MAX || '100', 10);
export const LOG_LEVEL = process.env.LOG_LEVEL || 'info';
