import { DATABASE_URL } from '@/config';
import { Pool } from 'pg';

const pool = new Pool({
  connectionString: DATABASE_URL,
});

pool.on('error', () => {
  // console.error('Postgres Pool Error:', err);
});

export default pool;
