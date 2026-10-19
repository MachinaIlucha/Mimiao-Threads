import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { sql, one, rows } from './db.js';
import { config } from './config.js';
import { randomToken, digest, verifyPassword, safeEqual } from './security.js';
import { AppError } from './errors.js';
declare module 'fastify' { interface FastifyRequest { studioSession?: {id:string;csrf:string} } }
function allowedOrigin(req:FastifyRequest) {
 const origin=req.headers.origin;
 const allowed=[new URL(config.publicUrl).origin];
 if(!config.production)allowed.push('http://localhost:5179','http://127.0.0.1:5179');
 return typeof origin==='string' && allowed.includes(origin);
}
export async function authRoutes(app:FastifyInstance) {
 app.addHook('onRequest',async(req)=>{
  const raw=req.cookies.studio_session;
  if(raw) req.studioSession=await one(sql`SELECT id,csrf FROM sessions WHERE id=${digest(raw)} AND expires_at>now()`);
  const pathname=req.url.split('?')[0];
  if(!pathname.startsWith('/api/'))return;
  if(['/api/health','/api/auth/login','/api/auth/session','/api/integrations/threads/callback'].includes(pathname))return;
  if(!req.studioSession)throw new AppError(401,'Войдите в аккаунт','UNAUTHORIZED');
  if(!['GET','HEAD','OPTIONS'].includes(req.method) && (!allowedOrigin(req)||!safeEqual(String(req.headers['x-csrf-token']||''),req.studioSession.csrf))) throw new AppError(403,'Обновите страницу и повторите действие','CSRF');
 });
 app.get('/api/auth/session',async req=>({authenticated:!!req.studioSession,csrf:req.studioSession?.csrf}));
 app.post('/api/auth/login',{config:{rateLimit:{max:5,timeWindow:'1 minute'}}},async(req,res)=>{
  if(!allowedOrigin(req))throw new AppError(403,'Недопустимый источник запроса');
  const {password}=z.object({password:z.string().max(500)}).parse(req.body);
  if(!verifyPassword(password,config.passwordHash))throw new AppError(401,'Неверный пароль');
  const token=randomToken(),csrf=randomToken();
  if(req.studioSession)await rows(sql`DELETE FROM sessions WHERE id=${req.studioSession.id}`);
  await rows(sql`INSERT INTO sessions(id,csrf,expires_at) VALUES(${digest(token)},${csrf},now()+interval '7 days')`);
  res.setCookie('studio_session',token,{path:'/',httpOnly:true,secure:config.production,sameSite:'lax',maxAge:604800});
  return {authenticated:true,csrf};
 });
 app.post('/api/auth/logout',async(req,res)=>{await rows(sql`DELETE FROM sessions WHERE id=${req.studioSession!.id}`);res.clearCookie('studio_session',{path:'/'});return{ok:true};});
}
