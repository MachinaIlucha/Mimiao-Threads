import { readFile, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { pool, sql, one, rows } from './db.js';
import { defaults } from './defaults.js';
export async function migrate() {
 const client = await pool.connect();
 try {
  await client.query('SELECT pg_advisory_lock(7319401)');
  await client.query('CREATE TABLE IF NOT EXISTS schema_migrations (name text PRIMARY KEY, applied_at timestamptz DEFAULT now())');
  const dir = new URL('./migrations/', import.meta.url);
  for (const name of (await readdir(dir)).filter(n => n.endsWith('.sql')).sort()) {
   if ((await client.query('SELECT name FROM schema_migrations WHERE name=$1',[name])).rowCount) continue;
   await client.query('BEGIN');
   try { await client.query(await readFile(new URL(name, dir),'utf8')); await client.query('INSERT INTO schema_migrations(name) VALUES($1)',[name]); await client.query('COMMIT'); }
   catch(e) { await client.query('ROLLBACK'); throw e; }
  }
 } finally { await client.query('SELECT pg_advisory_unlock(7319401)'); client.release(); }
 await rows(sql`INSERT INTO settings(id,value) VALUES(1,${JSON.stringify(defaults)}::jsonb) ON CONFLICT DO NOTHING`);
}
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) { await migrate(); console.log('Database migrations applied.'); await pool.end(); }
