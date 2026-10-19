import Fastify from 'fastify';
import cookie from '@fastify/cookie';
import multipart from '@fastify/multipart';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import staticFiles from '@fastify/static';
import path from 'node:path';
import { existsSync } from 'node:fs';
import { ZodError } from 'zod';
import { authRoutes } from './auth.js';
import { apiRoutes } from './routes/api.js';
import { mediaRoutes } from './routes/media.js';
import { integrationRoutes } from './routes/integrations.js';
import { AppError,safeMessage } from './errors.js';
import { sql,one } from './db.js';
export async function createApp(){
 const app=Fastify({logger:false,bodyLimit:1024*1024,trustProxy:false});
 await app.register(cookie);await app.register(multipart);await app.register(helmet,{contentSecurityPolicy:{directives:{defaultSrc:["'self'"],scriptSrc:["'self'"],styleSrc:["'self'","'unsafe-inline'"],imgSrc:["'self'",'blob:','data:'],connectSrc:["'self'"],fontSrc:["'self'"],frameAncestors:["'none'"],upgradeInsecureRequests:null}}});
 await app.register(rateLimit,{max:300,timeWindow:'1 minute'});
 app.setErrorHandler((error,_req,res)=>{if(error instanceof ZodError)return res.status(400).send({message:'Проверьте данные формы',issues:error.issues.map(i=>({path:i.path,message:i.message}))});const status=error instanceof AppError?error.statusCode:((error as any).statusCode||500);if(status>=500)console.error('Request failed:',error instanceof AppError?error.code:'INTERNAL_ERROR');return res.status(status).send({message:safeMessage(error),code:error instanceof AppError?error.code:'REQUEST_FAILED'});});
 await authRoutes(app);await apiRoutes(app);await mediaRoutes(app);await integrationRoutes(app);
 app.get('/api/health',async()=>{await one(sql`SELECT 1`);return{ok:true};});
 app.get('/privacy',async(_req,res)=>res.type('text/html').send('<html lang="ru"><meta charset="utf-8"><title>Конфиденциальность</title><h1>Mimiao Threads Studio</h1><p>Закрытый инструмент владельца mimiao.crm. Хранит тексты, медиа, публичные обсуждения и статистику для управления аккаунтом. Токен Threads хранится зашифрованным. Данные источников передаются DeepSeek для анализа. Доступ к админке имеет только владелец.</p><p>Удаление данных: <a href="/deletion">инструкция</a>.</p></html>'));
 app.get('/deletion',async(_req,res)=>res.type('text/html').send('<html lang="ru"><meta charset="utf-8"><title>Удаление данных</title><h1>Удаление данных</h1><p>Владелец может отключить Threads в разделе «Подключения», что удаляет токен из активной базы. Для удаления остальных данных остановите сервисы и удалите базу и медиа по инструкции README. Отзыв доступа также доступен в настройках подключённых приложений Threads.</p></html>'));
 const dist=path.resolve('dist');if(existsSync(dist)){await app.register(staticFiles,{root:dist});app.setNotFoundHandler((req,res)=>req.url.startsWith('/api/')||req.url.startsWith('/media/')?res.status(404).send({message:'Не найдено'}):res.sendFile('index.html'));}
 return app;
}
