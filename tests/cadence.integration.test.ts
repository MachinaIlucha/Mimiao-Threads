import { beforeAll, afterAll, beforeEach, expect, it, vi } from 'vitest';
import { readFile } from 'node:fs/promises';
import { DateTime } from 'luxon';
vi.mock('../server/providers/deepseek',()=>({generate:vi.fn(),search:vi.fn()}));
import { pool, sql, rows, one } from '../server/db';
import { config } from '../server/config';
import { migrate } from '../server/migrate';
import { defaults } from '../server/defaults';
import { createApp } from '../server/app';
import { prepareDay } from '../server/services/generation';
import { generate } from '../server/providers/deepseek';
let app:Awaited<ReturnType<typeof createApp>>;
const sunday=DateTime.now().setZone('Europe/Kyiv').plus({weeks:1}).startOf('week').plus({days:6}).toISODate()!;
const texts=['Хто підтверджує виплату викладачу?','Де знайти історію зарахувань учня?','Які відомості переносити з таблиці?','Чи потрібен команді окремий доступ до філій?','Як школа перевіряє неоплачені рахунки?','Яку інформацію отримують батьки?','Коли зупиняти надсилання нагадувань?','Що врахувати перед зміною навчального пакета?'];
beforeAll(async()=>{
 expect(new URL(config.databaseUrl).hostname).toBe('127.0.0.1');
 expect(new URL(config.databaseUrl).port).toBe('55449');
 expect(new URL(config.databaseUrl).pathname).toBe('/studio_test');
 await migrate();app=await createApp();await app.ready();
});
beforeEach(async()=>{
 vi.clearAllMocks();
 await pool.query('TRUNCATE posts,revisions,daily_plans,operations,growth_sources CASCADE');
 await rows(sql`UPDATE settings SET value=${JSON.stringify(defaults)}::jsonb WHERE id=1`);
});
afterAll(async()=>{await app.close();await pool.end();});

it('upgrades the stored cadence and keeps it through repeated startup migrations',async()=>{
 await rows(sql`UPDATE settings SET value=value||'{"dailyCount":1,"weeklyCount":5,"paused":false,"knowledge":"Keep owner facts"}'::jsonb WHERE id=1`);
 await rows(sql`INSERT INTO daily_plans(day,status,count,slots) VALUES(${sunday}::date,'ready',0,'[]')`);
 await pool.query(await readFile(new URL('../server/migrations/008_eight_posts_daily.sql',import.meta.url),'utf8'));
 await migrate();await migrate();
 expect((await one(sql`SELECT value FROM settings WHERE id=1`))!.value).toMatchObject({dailyCount:8,weeklyCount:7,adaptive:false,paused:false,knowledge:'Keep owner facts'});
 expect(await one(sql`SELECT status,attempts FROM daily_plans WHERE day=${sunday}::date`)).toMatchObject({status:'failed',attempts:0});
});

it('persists eight through settings saves and rejects the obsolete one-post mode',async()=>{
 const login=await app.inject({method:'POST',url:'/api/auth/login',headers:{origin:config.publicUrl},payload:{password:'integration-password'}});
 expect(login.statusCode).toBe(200);
 const headers={cookie:login.headers['set-cookie']!.toString().split(';')[0],origin:config.publicUrl,'x-csrf-token':login.json().csrf};
 expect((await app.inject({method:'PUT',url:'/api/settings',headers,payload:{...defaults,dailyCount:1,weeklyCount:5}})).statusCode).toBe(400);
 const saved=await app.inject({method:'PUT',url:'/api/settings',headers,payload:{...defaults,voice:'Updated owner voice'}});
 expect(saved.statusCode).toBe(200);expect(saved.json()).toMatchObject({dailyCount:8,weeklyCount:7,adaptive:false,voice:'Updated owner voice'});
});

it('saves exactly eight weekend drafts and does not regenerate a completed day',async()=>{
 for(let i=0;i<8;i++)await rows(sql`INSERT INTO growth_sources(title,text,kind,hypothesis,confirmed) VALUES(${'Source '+i},${'Verified material '+i},'founder','accounting',true)`);
 vi.mocked(generate).mockImplementation(async(kind,_instruction,input:any)=>{
  if(kind==='plan-review')return {blockingIssues:[],suggestions:[]} as any;
  return {posts:input.evidence.map((source:any,i:number)=>({evidenceId:source.id,hypothesis:source.hypothesis,text:texts[i],alternative:texts[i],category:'founder',topic:`Unique topic ${i}`,reason:'Confirmed source',sourceUrls:[],trendId:null,verified:true,concerns:[]}))} as any;
 });
 await expect(prepareDay(sunday)).resolves.toMatchObject({count:8});
 const posts=await rows(sql`SELECT * FROM posts WHERE plan_day=${sunday}::date ORDER BY scheduled_at`);
 expect(posts).toHaveLength(8);expect(posts.every(p=>p.status==='draft')).toBe(true);
 expect(posts.map(p=>DateTime.fromJSDate(new Date(p.scheduled_at)).setZone('Europe/Kyiv').toFormat('HH:mm'))).toEqual(['09:00','11:00','13:00','15:00','17:00','19:00','21:00','22:30']);
 expect(await one(sql`SELECT status,count FROM daily_plans WHERE day=${sunday}::date`)).toEqual({status:'ready',count:8});
 await expect(prepareDay(sunday)).resolves.toMatchObject({existing:true});
 expect(generate).toHaveBeenCalledTimes(2);
 expect(await rows(sql`SELECT id FROM posts WHERE plan_day=${sunday}::date`)).toHaveLength(8);
});
