import { Pool } from 'pg';

// Disable TLS certificate validation for Aiven cloud database
// Connection is still encrypted, just not validating the self-signed CA
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

/**
 * Database Connection Configuration
 *
 * Uses TLS encryption for secure connections to Aiven PostgreSQL.
 */

// Prepare SSL configuration
function getSSLConfig() {
  // Local development - no SSL needed
  if (process.env.DATABASE_URL?.includes('localhost')) {
    return false;
  }

  // Cloud databases (Aiven) - encrypted connection
  // TLS encryption is still active, we just skip CA chain validation
  return {
    rejectUnauthorized: false,
  };
}

// Create connection pool
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: getSSLConfig(),
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
});

// Handle connection errors
pool.on('error', (err) => {
  console.error('Unexpected PostgreSQL pool error:', err);
});

export async function query<T = unknown>(text: string, params?: unknown[]): Promise<T[]> {
  const client = await pool.connect();
  try {
    const result = await client.query(text, params);
    return result.rows as T[];
  } finally {
    client.release();
  }
}

export async function queryOne<T = unknown>(text: string, params?: unknown[]): Promise<T | null> {
  const rows = await query<T>(text, params);
  return rows[0] || null;
}

export async function execute(text: string, params?: unknown[]): Promise<number> {
  const client = await pool.connect();
  try {
    const result = await client.query(text, params);
    return result.rowCount || 0;
  } finally {
    client.release();
  }
}

export { pool };
