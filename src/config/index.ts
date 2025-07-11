import { config } from "dotenv"

config();

export const PORT = process.env.PORT ?? 2020;
export const NODE_ENV = process.env.NODE_ENV ?? "dev";
export const API_KEY_ENCRYPTION_SECRET = "somerandomsecret";
export const STATUS_API_KEY = process.env.STATUS_API_KEY ?? "whatifitdoentexist";
export const ALLOWED_ORIGINS = process.env.ALLOWED_ORIGINS ?? "http://localhost:3000";
export const DATABASE_URL = process.env.DATABASE_URL;
export const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
export const OPENWEATHER_API_KEY = process.env.OPENWEATHER_API_KEY;
export const SOURCE_COMMIT = process.env.SOURCE_COMMIT;
export const TOKEN = process.env.TOKEN;
export const CLIENT_ID = process.env.CLIENT_ID;

export const RATE_LIMIT_WINDOW_MS = process.env.RATE_LIMIT_WINDOW_MS || 15 * 60 * 1000
export const RATE_LIMIT_MAX = process.env.RATE_LIMIT_MAX || 100
export const LOG_LEVEL = process.env.LOG_LEVEL || 'info'