import type { SQL } from 'drizzle-orm';
import { sql,transaction } from '../db.js';
import { nextDraftTime } from '../domain/draft-time.js';

type Query=<R=Record<string,any>>(query:SQL)=>Promise<R[]>;
export async function occupiedPostTimes(query:Query,excludeId?:string):Promise<string[]> {
 const posts=await query(sql`SELECT CASE WHEN status='published' THEN COALESCE(published_at,scheduled_at) ELSE scheduled_at END AS at FROM posts WHERE root_id IS NULL AND status<>'cancelled' AND (${excludeId||null}::uuid IS NULL OR id<>${excludeId||null}::uuid)`);
 return posts.map(p=>p.at).filter(Boolean);
}

/** Idempotent startup repair; existing timestamps, text and statuses stay intact. */
export async function assignMissingDraftTimes(){
 return transaction(async tx=>{
  await tx(sql`SELECT pg_advisory_xact_lock(7319402)`);
  const missing=await tx(sql`SELECT * FROM posts WHERE root_id IS NULL AND status='draft' AND scheduled_at IS NULL ORDER BY (topic LIKE 'Закреплённый пост%') DESC,created_at DESC,id FOR UPDATE`);
  if(!missing.length)return [];
  const [settings]=await tx(sql`SELECT value FROM settings WHERE id=1`);
  const occupied=await occupiedPostTimes(tx),now=new Date(),updated=[];
  for(const post of missing){
   const at=nextDraftTime(occupied,settings?.value.weeklyCount??5,now);
   await tx(sql`INSERT INTO revisions(post_id,revision,snapshot,reason) VALUES(${post.id}::uuid,${post.revision},${JSON.stringify(post)}::jsonb,'Назначено время черновика без изменения согласования') ON CONFLICT DO NOTHING`);
   const [saved]=await tx(sql`UPDATE posts SET scheduled_at=${at}::timestamptz,revision=revision+1,updated_at=now() WHERE id=${post.id}::uuid RETURNING id,topic,status,scheduled_at`);
   occupied.push(at);updated.push(saved);
  }
  return updated;
 });
}
