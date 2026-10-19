import { sql, rows, one } from '../db.js';
import { threads, paged, mediaFields, connection } from '../providers/threads.js';
import { nullableMetric } from '../domain/editorial.js';
import { checkpointHours, today } from '../domain/schedule.js';
import { heartbeat, event } from './state.js';
const metricNames=['views','likes','replies','reposts','quotes','shares'] as const;
export async function importHistory() {
 if(!await connection())return;
 const since=String(Math.floor(Date.now()/1000)-90*86400);
 for(const endpoint of ['me/threads','me/replies']){
  const list=await paged(endpoint,{fields:mediaFields,since,limit:'100'},20);
  for(const p of list){if(!p.id||!p.timestamp)continue;
   await rows(sql`INSERT INTO posts(text,status,provider_id,permalink,published_at,root_id,topic) VALUES(${p.text||''},'published',${p.id},${p.permalink||null},${p.timestamp},${endpoint==='me/replies'||p.is_reply?'external':null},'Импорт из Threads') ON CONFLICT(provider_id) DO UPDATE SET permalink=COALESCE(EXCLUDED.permalink,posts.permalink)`);
  }
 }await heartbeat('history');await event('history','success','Доступная история импортирована; прошлые замеры 24/72 часа не восстановлены');
}
export async function collectMetrics() {
 if(!await connection())return;
 const posts=await rows(sql`SELECT * FROM posts WHERE status='published' AND provider_id IS NOT NULL AND published_at>now()-interval '100 days' ORDER BY published_at DESC LIMIT 1000`);
 for(const p of posts){
  const age=(Date.now()-Date.parse(p.published_at))/3600_000;
  const existing=await rows(sql`SELECT checkpoint FROM metrics WHERE post_id=${p.id}::uuid AND source='api'`);
  const historical=Date.parse(p.published_at)<Date.parse(p.created_at)-3600_000;
  const wanted=historical?['import']:Object.entries(checkpointHours).filter(([name,h])=>age>=h&&!existing.some(m=>m.checkpoint===name)).map(([name])=>name);
  if(!wanted.length||historical&&existing.some(m=>m.checkpoint==='import'))continue;
  try{
   const result=await threads(`${p.provider_id}/insights`,{metric:metricNames.join(',')});const values=Object.fromEntries(metricNames.map(name=>[name,nullableMetric(result.data||[],name)]));
   for(const checkpoint of wanted)await rows(sql`INSERT INTO metrics(post_id,checkpoint,age_hours,views,likes,replies,reposts,quotes,shares,raw) VALUES(${p.id}::uuid,${checkpoint},${age},${values.views},${values.likes},${values.replies},${values.reposts},${values.quotes},${values.shares},${JSON.stringify(result)}::jsonb) ON CONFLICT DO NOTHING`);
  }catch{await event('metrics.post','warning','Статистика поста недоступна',{postId:p.id});}
 }
 let followers:number|null=null,views:number|null=null,clicks:unknown=null;
 try{followers=nullableMetric((await threads('me/threads_insights',{metric:'followers_count'})).data||[],'followers_count');}catch{}
 try{const result=await threads('me/threads_insights',{metric:'views,clicks',since:String(Math.floor(Date.now()/1000)-86400),until:String(Math.floor(Date.now()/1000))});views=nullableMetric(result.data||[],'views');clicks=result.data?.find((x:any)=>x.name==='clicks')||null;}catch{}
 await rows(sql`INSERT INTO account_metrics(day,followers,profile_views,clicks) VALUES(${today()},${followers},${views},${JSON.stringify(clicks)}::jsonb) ON CONFLICT(day) DO UPDATE SET followers=COALESCE(EXCLUDED.followers,account_metrics.followers),profile_views=COALESCE(EXCLUDED.profile_views,account_metrics.profile_views),clicks=COALESCE(EXCLUDED.clicks,account_metrics.clicks),measured_at=now()`);
 await heartbeat('metrics');
}
export async function analyticsData() {
 const [posts,metrics,account,reports,experiments,groups]=await Promise.all([
  rows(sql`SELECT p.*,(SELECT count(*)::int FROM replies r WHERE r.post_id=p.id AND r.meaningful AND r.kind='incoming') AS meaningful_count FROM posts p WHERE status='published' ORDER BY published_at DESC LIMIT 1000`),
  rows(sql`SELECT * FROM metrics ORDER BY measured_at DESC LIMIT 10000`),rows(sql`SELECT * FROM account_metrics ORDER BY day DESC LIMIT 120`),
  rows(sql`SELECT * FROM reports ORDER BY week DESC LIMIT 12`),rows(sql`SELECT * FROM experiments ORDER BY created_at DESC LIMIT 12`),
  rows(sql`SELECT p.category,count(*)::int AS count,percentile_cont(0.5) WITHIN GROUP(ORDER BY m.views) AS median_views,avg(m.replies) AS average_replies FROM posts p JOIN metrics m ON m.post_id=p.id WHERE m.checkpoint='24h' AND m.source='api' AND m.age_hours BETWEEN 24 AND 28 AND p.root_id IS NULL GROUP BY p.category`)
 ]);return {posts,metrics,account,reports,experiments,groups};
}
