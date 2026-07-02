import { Pool } from 'pg';
import dotenv from 'dotenv';
import { runMigrations } from '../src/utils/migrations';

dotenv.config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
});

runMigrations(pool)
  .then(() => pool.end())
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
