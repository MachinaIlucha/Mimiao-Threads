import pg from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { sql, type SQL } from 'drizzle-orm';
import { config } from './config.js';
export { sql };
pg.types.setTypeParser(1184, value => new Date(value).toISOString());
pg.types.setTypeParser(20, value => Number(value));
pg.types.setTypeParser(1082, value => value);
export const pool = new pg.Pool({ connectionString: config.databaseUrl, max: 8 });
export const db = drizzle(pool);
export async function rows<T = Record<string, any>>(query: SQL): Promise<T[]> { return (await db.execute(query)).rows as T[]; }
export async function one<T = Record<string, any>>(query: SQL): Promise<T | undefined> { return (await rows<T>(query))[0]; }
export async function transaction<T>(fn: (query: <R = Record<string, any>>(s: SQL) => Promise<R[]>) => Promise<T>): Promise<T> {
 const client = await pool.connect(); const tx = drizzle(client);
 try { await client.query('BEGIN'); const result = await fn(async <R>(s: SQL) => (await tx.execute(s)).rows as R[]); await client.query('COMMIT'); return result; }
 catch (e) { await client.query('ROLLBACK'); throw e; } finally { client.release(); }
}
