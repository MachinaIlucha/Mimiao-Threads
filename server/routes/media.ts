import type { FastifyInstance } from 'fastify';
import { mkdir, writeFile, readFile, unlink } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import sharp from 'sharp';
import { z } from 'zod';
import { sql, one, rows } from '../db.js';
import { config } from '../config.js';
import { AppError } from '../errors.js';
import { mediaSignature, safeEqual } from '../security.js';
export async function mediaRoutes(app:FastifyInstance) {
 app.post('/api/media',async(req)=>{
  const file=await req.file({limits:{files:1,fileSize:15*1024*1024}});if(!file)throw new AppError(400,'Выберите фото');
  if(!['image/jpeg','image/png','image/webp'].includes(file.mimetype))throw new AppError(400,'Поддерживаются JPEG, PNG и WebP');
  const data=await file.toBuffer();let image;
  try{image=await sharp(data,{limitInputPixels:40_000_000,animated:false}).rotate().resize({width:1440,height:1920,fit:'inside',withoutEnlargement:true}).jpeg({quality:88}).toBuffer({resolveWithObject:true});}catch{throw new AppError(400,'Не удалось прочитать изображение');}
  const name=`${randomUUID()}.jpg`;await mkdir(config.mediaDir,{recursive:true});await writeFile(path.join(config.mediaDir,name),image.data,{flag:'wx'});
  try{return await one(sql`INSERT INTO media(filename,storage_name,width,height,bytes) VALUES(${path.basename(file.filename).slice(0,200)},${name},${image.info.width},${image.info.height},${image.info.size}) RETURNING id,filename,width,height,bytes,alt,created_at`);}catch(e){await unlink(path.join(config.mediaDir,name));throw e;}
 });
 app.get('/api/media',async()=>rows(sql`SELECT id,filename,width,height,bytes,alt,created_at FROM media ORDER BY created_at DESC LIMIT 500`));
 app.patch('/api/media/:id',async(req)=>{const {id}=z.object({id:z.string().uuid()}).parse(req.params);const {alt}=z.object({alt:z.string().max(1000)}).parse(req.body);const media=await one(sql`UPDATE media SET alt=${alt} WHERE id=${id}::uuid RETURNING id,alt`);if(!media)throw new AppError(404,'Фото не найдено');return media;});
 app.get('/media/:id',async(req,res)=>{
  const {id}=z.object({id:z.string().uuid()}).parse(req.params);const query=req.query as Record<string,string>;const expiry=Number(query.expires);
  const valid=Number.isInteger(expiry)&&expiry>=Date.now()/1000&&expiry<=Date.now()/1000+172800&&safeEqual(query.signature||'',mediaSignature(id,expiry));
  if(!req.studioSession&&!valid)throw new AppError(401,'Нет доступа к фото');
  const media=await one(sql`SELECT storage_name FROM media WHERE id=${id}::uuid`);if(!media)throw new AppError(404,'Фото не найдено');
  res.type('image/jpeg').header('Cache-Control','private, max-age=300');return readFile(path.join(config.mediaDir,media.storage_name));
 });
}
