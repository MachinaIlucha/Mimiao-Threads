import { DateTime } from 'luxon';
import { z } from 'zod';
import { sql,rows,one } from '../db.js';
import { settings,event } from './state.js';
import { analyticsData } from './analytics.js';
import { generate } from '../providers/deepseek.js';
import { today,tomorrow,experimentAssignments,chooseExperiment } from '../domain/schedule.js';
import { median } from '../domain/editorial.js';
export async function weeklyReview(){
 const data=await analyticsData(),s=await settings();
 const meaningful=await rows(sql`SELECT p.category,count(*)::int AS count FROM replies r JOIN posts p ON p.id=r.post_id WHERE r.meaningful AND r.created_at>now()-interval '28 days' GROUP BY p.category`);
 const report=await generate('weekly-review','Return JSON {observations:string[],tryNext:string[],avoid:string[],limitations:string[]}. Write Russian. Use only supplied real measurements. Compare 24h cohorts only with age24–28h, separate imported history and replies. No causal claim that a post caused account follower growth. Mention small samples, missing data and confounding. Never invent numbers. Suggest testable editorial changes, not automatic prohibitions.',{groups:data.groups,account:data.account,meaningful,experiments:data.experiments,voice:s.voice},z.object({observations:z.array(z.string()).max(10),tryNext:z.array(z.string()).max(10),avoid:z.array(z.string()).max(10),limitations:z.array(z.string()).max(10)}));
 const week=DateTime.now().setZone('Europe/Kyiv').startOf('week').toISODate();
 await rows(sql`INSERT INTO reports(week,content) VALUES(${week},${JSON.stringify(report)}::jsonb) ON CONFLICT(week) DO UPDATE SET content=EXCLUDED.content,created_at=now()`);
 await event('review','success','Недельный разбор готов');
}
export async function optimize(){
 const s=await settings();if(!s.adaptive)return;
 const active=await one(sql`SELECT * FROM experiments WHERE status='running'`);
 if(active&&DateTime.fromISO(String(active.ends_on)).plus({days:3}).toISODate()!>=today())return;
 if(active){
  const days=await rows(sql`SELECT day::text,followers,CASE WHEN day-lag(day) OVER(ORDER BY day)=1 THEN followers-lag(followers) OVER(ORDER BY day) ELSE NULL END AS delta FROM account_metrics ORDER BY day`);
  const samples=await rows(sql`SELECT (p.scheduled_at AT TIME ZONE 'Europe/Kyiv')::date::text AS day,m.views,(SELECT count(*)::int FROM replies r WHERE r.post_id=p.id AND meaningful AND r.created_at<=p.published_at+interval '72 hours') AS meaningful FROM posts p JOIN metrics m ON m.post_id=p.id WHERE p.experiment_arm IS NOT NULL AND p.plan_day BETWEEN ${active.starts_on}::date AND ${active.ends_on}::date AND p.published_at<=now()-interval '72 hours' AND m.source='api' AND m.checkpoint='24h' AND m.age_hours BETWEEN 24 AND 28`);
  const stats=(arm:string)=>{const dates=Object.keys(active.assignments).filter(d=>active.assignments[d]===arm);const subset=samples.filter(p=>dates.includes(p.day));const measured=days.filter(d=>dates.includes(d.day)&&d.delta!==null);return{days:new Set(subset.map(p=>p.day)).size,meaningful:subset.reduce((n,p)=>n+p.meaningful,0),medianViews:median(subset.map(p=>p.views).filter(v=>v!==null)),dailyFollowers:measured.length===14?measured.reduce((n,d)=>n+Number(d.delta),0)/14:null};};
  const base=stats('base'),extra=stats('extra'),decision=chooseExperiment(base,extra);
  await rows(sql`UPDATE experiments SET status='complete',result=${JSON.stringify({base,extra,decision,limitation:'Наблюдательный эксперимент; темы и время могут влиять на результат'})}::jsonb WHERE id=${active.id}::uuid`);
  if(decision==='increase')await rows(sql`UPDATE settings SET value=jsonb_set(value,'{dailyCount}',${JSON.stringify(Math.max(s.dailyCount,Math.min(10,active.base_count+1)))}::jsonb) WHERE id=1`);
  await event('experiment','success','Эксперимент частоты завершён',{decision});return;
 }
 const coverage=await one(sql`SELECT count(DISTINCT (p.published_at AT TIME ZONE 'Europe/Kyiv')::date)::int AS days FROM posts p JOIN metrics m ON m.post_id=p.id WHERE m.source='api' AND m.checkpoint='24h' AND m.age_hours BETWEEN 24 AND 28 AND p.root_id IS NULL`);
 if(coverage!.days<28||s.dailyCount>=10)return;
 const start=tomorrow(),end=DateTime.fromISO(start).plus({days:27}).toISODate();
 await rows(sql`INSERT INTO experiments(starts_on,ends_on,base_count,assignments) VALUES(${start},${end},${s.dailyCount},${JSON.stringify(experimentAssignments(start))}::jsonb) ON CONFLICT DO NOTHING`);
}
