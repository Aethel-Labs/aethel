import * as config from "@/config";
import { Pool } from 'pg';

const pool = new Pool({
  connectionString: config.DATABASE_URL,
});

pool.on('error', () => {
  // console.error('Postgres Pool Error:', err);
});

export default pool;
