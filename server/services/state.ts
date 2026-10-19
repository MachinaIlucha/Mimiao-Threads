import { sql, one, rows } from '../db.js';
import type { Settings } from '../../shared/types.js';
export async function settings(): Promise<Settings> { return (await one(sql`SELECT value FROM settings WHERE id=1`))!.value; }
export async function event(kind: string, status: string, message: string, details: Record<string,unknown>={}) {
 await rows(sql`INSERT INTO operations(kind,status,message,details) VALUES(${kind},${status},${message},${JSON.stringify(details)}::jsonb)`);
}
export async function heartbeat(name: string) { await rows(sql`INSERT INTO heartbeats(name) VALUES(${name}) ON CONFLICT(name) DO UPDATE SET at=now()`); }
