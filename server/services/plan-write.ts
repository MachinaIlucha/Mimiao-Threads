import type { SQL } from 'drizzle-orm';
import { sql, transaction } from '../db.js';
import { availableSlotsFor } from '../domain/schedule.js';
import { AppError } from '../errors.js';

type Query=<R=Record<string,any>>(query:SQL)=>Promise<R[]>;
type Post=Record<string,any>;
type Candidate={text:string;alternative:string;category:string;sourceUrls:string[];topic:string;reason:string;trendId:string|null};
export async function editableDayPosts(query:Query,day:string,lock=false):Promise<Post[]> {
 return query(sql`SELECT * FROM posts WHERE root_id IS NULL AND status IN ('draft','scheduled','blocked','missed') AND COALESCE((scheduled_at AT TIME ZONE 'Europe/Kyiv')::date,plan_day)=${day}::date ORDER BY id ${lock?sql`FOR UPDATE`:sql``}`);
}
export async function assertDayResolved(query:Query,day:string) {
 const unresolved=await query(sql`SELECT id FROM posts WHERE root_id IS NULL AND status IN ('publishing','unknown') AND COALESCE((scheduled_at AT TIME ZONE 'Europe/Kyiv')::date,plan_day)=${day}::date LIMIT 1`);
 if(unresolved.length)throw new AppError(409,'Сначала разрешите незавершённую публикацию на выбранный день.');
}
export async function writeDayPlan(day:string,posts:Candidate[],trends:Post[],arm:string|null,snapshot:Post[],regenerate:boolean,rankedHours:number[]=[]) {
 await transaction(async tx=>{
  await tx(sql`SELECT pg_advisory_xact_lock(7319403)`);
  await tx(sql`SELECT pg_advisory_xact_lock(7319402)`);
  await assertDayResolved(tx,day);
  if(regenerate){
   const current=await editableDayPosts(tx,day,true);
   if(current.length!==snapshot.length||current.some((p,i)=>p.id!==snapshot[i].id||p.revision!==snapshot[i].revision||p.status!==snapshot[i].status))throw new AppError(409,'План изменился во время подготовки. Повторите перегенерацию.');
  }
  const ids=snapshot.map(p=>p.id);
  const occupied=await tx(sql`SELECT CASE WHEN status='published' THEN COALESCE(published_at,scheduled_at) ELSE scheduled_at END AS at FROM posts WHERE root_id IS NULL AND status IN ('scheduled','publishing','published') AND id::text NOT IN (SELECT jsonb_array_elements_text(${JSON.stringify(ids)}::jsonb)) AND COALESCE(CASE WHEN status='published' THEN published_at END,scheduled_at) BETWEEN ((${day}::date-interval '1 day') AT TIME ZONE 'Europe/Kyiv') AND ((${day}::date+interval '2 days') AT TIME ZONE 'Europe/Kyiv')`);
  const slots=availableSlotsFor(day,posts.length,occupied.map(p=>p.at),new Date(),rankedHours);
  for(let i=0;i<posts.length;i++){
   if(!posts[i].trendId)continue;
   const trend=trends.find(t=>t.id===posts[i].trendId);
   if(!trend||!(new Date(trend.expires_at).getTime()>new Date(slots[i]).getTime()))throw new AppError(409,'Тема устареет до публикации. Повторите подготовку.');
  }
  for(const old of snapshot){
   await tx(sql`INSERT INTO revisions(post_id,revision,snapshot,reason) VALUES(${old.id}::uuid,${old.revision},${JSON.stringify(old)}::jsonb,${'Перегенерация плана на '+day}) ON CONFLICT(post_id,revision) DO NOTHING`);
   await tx(sql`UPDATE posts SET status='cancelled',revision=revision+1,error=NULL,plan_day=NULL,slot=NULL,updated_at=now() WHERE id=${old.id}::uuid`);
  }
  const [{next}]=await tx(sql`SELECT COALESCE(MAX(slot),-1)+1 AS next FROM posts WHERE plan_day=${day}::date`);
  for(let i=0;i<posts.length;i++){
   const p=posts[i],trend=trends.find(t=>t.id===p.trendId);
   await tx(sql`INSERT INTO posts(text,alternative,category,status,scheduled_at,sources,topic,reason,expires_at,generated,plan_day,slot,experiment_arm) VALUES(${p.text},${p.alternative},${p.category},'scheduled',${slots[i]},${JSON.stringify(p.sourceUrls)}::jsonb,${p.topic},${p.reason},${trend?.expires_at||null},true,${day}::date,${Number(next)+i},${arm})`);
  }
  await tx(sql`UPDATE daily_plans SET status='ready',count=${posts.length},slots=${JSON.stringify(slots)}::jsonb,updated_at=now() WHERE day=${day}::date`);
 });
}
