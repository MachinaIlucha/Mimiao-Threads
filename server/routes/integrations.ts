import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { config } from '../config.js';
import { sql, rows, one } from '../db.js';
import { randomToken, encrypt } from '../security.js';
import { AppError } from '../errors.js';
import { requestJson } from '../providers/http.js';
import { connection, threads } from '../providers/threads.js';
import { event } from '../services/state.js';
import { enqueue } from '../jobs.js';
const scopes=['threads_basic','threads_content_publish','threads_manage_insights','threads_read_replies','threads_keyword_search','threads_profile_discovery'];
const redirectUri=()=>`${config.publicUrl}/api/integrations/threads/callback`;
export async function checkCapabilities() {
 const c=await connection();if(!c)throw new AppError(409,'Подключите Threads');
 const caps:Record<string,{available:boolean;reason:string}>={};
 for(const [name,endpoint,params] of [
  ['insights','me/threads_insights',{metric:'followers_count'}],
  ['replies','me/replies',{fields:'id',limit:'1'}],
  ['search','keyword_search',{q:'освіта',search_type:'RECENT',fields:'id',limit:'1'}],
  ['profiles','profile_posts',{username:'threads',fields:'id',limit:'1'}]
 ] as const){try{await threads(endpoint,params);const discovery=name==='search'||name==='profiles';caps[name]={available:!discovery||config.publicDiscoveryApproved,reason:discovery&&!config.publicDiscoveryApproved?'Запрос успешен, но Advanced Access не подтверждён. Включите THREADS_PUBLIC_DISCOVERY_APPROVED после App Review.':'Доступ подтверждён'};}catch{caps[name]={available:false,reason:'Нет доступа или временная ошибка API'};}}
 await rows(sql`UPDATE connections SET capabilities=${JSON.stringify(caps)}::jsonb,checked_at=now() WHERE id=1`);return caps;
}
export async function integrationRoutes(app:FastifyInstance) {
 app.get('/api/integrations',async()=>({threads:await one(sql`SELECT username,user_id,expires_at,scopes,capabilities,checked_at FROM connections WHERE id=1`),deepseek:!!config.deepseekKey,metaConfigured:!!config.appId&&!!config.appSecret,livePublishing:config.livePublishing,publicUrl:config.publicUrl,redirectUri:redirectUri()}));
 app.post('/api/integrations/threads/connect',async req=>{
  if(!config.appId||!config.appSecret)throw new AppError(409,'Укажите THREADS_APP_ID и THREADS_APP_SECRET в .env');
  const state=randomToken();await rows(sql`INSERT INTO oauth_attempts(state,session_id,expires_at) VALUES(${state},${req.studioSession!.id},now()+interval '10 minutes')`);
  const url=new URL('https://threads.net/oauth/authorize');for(const [k,v]of Object.entries({client_id:config.appId,redirect_uri:redirectUri(),scope:scopes.join(','),response_type:'code',state}))url.searchParams.set(k,v);return{url:url.toString()};
 });
 app.get('/api/integrations/threads/callback',async(req,res)=>{
  const q=z.object({state:z.string(),code:z.string().optional(),error:z.string().optional()}).parse(req.query);
  if(!req.studioSession)throw new AppError(401,'Откройте подключение из авторизованной админки');
  const attempt=await one(sql`UPDATE oauth_attempts SET status='used' WHERE state=${q.state} AND session_id=${req.studioSession.id} AND status='waiting' AND expires_at>now() RETURNING state`);
  if(!attempt||!q.code||q.error)throw new AppError(400,'Подключение отменено или ссылка устарела');
  const short=await requestJson<any>('https://graph.threads.net/oauth/access_token',{method:'POST',body:new URLSearchParams({client_id:config.appId,client_secret:config.appSecret,grant_type:'authorization_code',redirect_uri:redirectUri(),code:q.code})},'threads.oauth',false);
  const url=new URL('https://graph.threads.net/access_token');url.searchParams.set('grant_type','th_exchange_token');url.searchParams.set('client_secret',config.appSecret);url.searchParams.set('access_token',short.access_token);
  const long=await requestJson<any>(url.toString(),{},'threads.exchange',false);
  if(!long.access_token||!Number.isFinite(long.expires_in))throw new AppError(502,'Meta не вернула действующий токен');
  const me=await threads('me',{fields:'id,username'},'GET',long.access_token);
  if(me.username!=='mimiao.crm')throw new AppError(409,'Подключите аккаунт mimiao.crm');
  await rows(sql`INSERT INTO connections(id,user_id,username,token,expires_at,scopes) VALUES(1,${me.id},${me.username},${encrypt(long.access_token)},${new Date(Date.now()+long.expires_in*1000).toISOString()},${JSON.stringify(scopes)}::jsonb) ON CONFLICT(id) DO UPDATE SET user_id=EXCLUDED.user_id,username=EXCLUDED.username,token=EXCLUDED.token,expires_at=EXCLUDED.expires_at,scopes=EXCLUDED.scopes,capabilities='{}'::jsonb`);
  await checkCapabilities();await enqueue('history');await event('threads.connected','success','Аккаунт Threads подключён');return res.redirect('/?page=connections');
 });
 app.post('/api/integrations/threads/check',checkCapabilities);
 app.post('/api/integrations/threads/disconnect',async()=>{await rows(sql`UPDATE settings SET value=jsonb_set(value,'{paused}','true') WHERE id=1`);await rows(sql`DELETE FROM connections WHERE id=1`);return{ok:true};});
}
