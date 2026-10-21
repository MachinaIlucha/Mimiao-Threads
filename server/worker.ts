import { DateTime } from 'luxon';
import { config,validateConfig } from './config.js';
import { migrate } from './migrate.js';
import { boss,startQueue,jobNames,parsePrepareRequest,type PrepareRequest } from './jobs.js';
import { sql,rows,one,pool } from './db.js';
import { research } from './services/research.js';
import { prepareDay,replaceExpired } from './services/generation.js';
import { publishDue,reconcile } from './services/publishing.js';
import { collectMetrics,importHistory } from './services/analytics.js';
import { collectReplies } from './services/discussions.js';
import { refreshToken } from './providers/threads.js';
import { weeklyReview,optimize } from './services/learning.js';
import { event,heartbeat } from './services/state.js';
import { safeMessage } from './errors.js';
import { tomorrow } from './domain/schedule.js';
import { checkBrowser,closeBrowser } from './browser/session.js';
validateConfig();await migrate();await startQueue();
const handlers={research,prepare:()=>prepareDay(),publish:publishDue,reconcile,metrics:collectMetrics,replies:collectReplies,refresh:refreshToken,history:async()=>{await importHistory();await collectMetrics();},review:weeklyReview,optimize,evergreen:replaceExpired,'browser-check':checkBrowser};
const schedules={research:'0 18 * * *',prepare:'0 19 * * *',publish:'* * * * *',reconcile:'*/5 * * * *',metrics:'*/15 * * * *',replies:'*/15 * * * *',refresh:'0 7 * * *',history:'0 6 * * *',review:'0 10 * * 1',optimize:'30 17 * * *',evergreen:'*/10 * * * *'};
for(const name of jobNames){await boss.work(name,async jobs=>{for(const job of jobs){
 let request:PrepareRequest|undefined;
 try{
  if(name==='prepare'){request=parsePrepareRequest(job.data);await prepareDay(request.day,{regenerate:request.regenerate});}
  else await handlers[name]();
  await heartbeat(name);
 }catch(e){
  const rawDay=job.data&&typeof job.data==='object'&&'day' in job.data?job.data.day:undefined;
  const day=request?.day??(typeof rawDay==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(rawDay)?rawDay:undefined);
  await event(name,'error',safeMessage(e),name==='prepare'&&day?{day}:{});
  throw new Error(safeMessage(e));
 }
}});}
for(const [name,cron]of Object.entries(schedules))await boss.schedule(name,cron,{}, {tz:'Europe/Kyiv',singletonKey:name});
async function maintenance(){
 await heartbeat('worker');
 await rows(sql`DELETE FROM sessions WHERE expires_at<now()`);await rows(sql`DELETE FROM oauth_attempts WHERE expires_at<now()`);
 await rows(sql`UPDATE daily_plans SET status='failed' WHERE status='generating' AND updated_at<now()-interval '35 minutes'`);
 if(config.deepseekKey&&DateTime.now().setZone('Europe/Kyiv').hour>=19){const plan=await one(sql`SELECT status,attempts,updated_at FROM daily_plans WHERE day=${tomorrow()}::date`);if(!plan||plan.status==='failed'&&plan.attempts<3&&Date.now()-Date.parse(plan.updated_at)>1800000)await boss.send('prepare',{}, {singletonKey:'prepare'});}
 await rows(sql`UPDATE replies SET state='unknown',error='Рабочий процесс был прерван во время отправки' WHERE state='sending' AND sending_at<now()-interval '10 minutes'`);
}
await maintenance();const timer=setInterval(()=>void maintenance().catch(()=>console.error('Worker maintenance failed')),30000);
if(config.publishingMode==='browser')await checkBrowser();
console.log('Threads Studio worker ready. Timezone: Europe/Kyiv.');
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,async()=>{clearInterval(timer);await boss.stop();await closeBrowser();await pool.end();process.exit(0);});
