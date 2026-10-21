import { PgBoss } from 'pg-boss';
import { z } from 'zod';
import { DateTime } from 'luxon';
import { AppError } from './errors.js';
import { today,tomorrow,ZONE } from './domain/schedule.js';
import { config } from './config.js';
export const jobNames=['research','prepare','publish','reconcile','metrics','replies','refresh','history','review','optimize','evergreen','browser-check'] as const;
export type JobName=typeof jobNames[number];
export const boss=new PgBoss({connectionString:config.databaseUrl,application_name:'threads-studio'});
boss.on('error',()=>{console.error('Job queue error; check database connectivity.');});
let started:Promise<void>|undefined;
export function startQueue(){return started??=(async()=>{await boss.start();for(const name of jobNames)await boss.createQueue(name,{policy:'singleton',retryLimit:0,expireInSeconds:1800});})();}
export interface PrepareRequest {day:string;regenerate:boolean}
const prepareSchema=z.object({day:z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),regenerate:z.boolean().default(false)}).strict();
export function parsePrepareRequest(raw:unknown,now=new Date()):PrepareRequest {
 const input=prepareSchema.parse(raw??{}),day=input.day??tomorrow(now);
 const date=DateTime.fromISO(day,{zone:ZONE});
 if(!date.isValid||date.toISODate()!==day||day<today(now))throw new AppError(400,'Выберите сегодняшний или будущий день');
 return {day,regenerate:input.regenerate};
}
export async function enqueue(name:JobName,input?:unknown){
 const request=name==='prepare'?parsePrepareRequest(input):undefined;
 await startQueue();const jobId=await boss.send(name,request??{}, {singletonKey:name});
 if(name==='prepare'&&jobId===null)throw new AppError(409,'Подготовка уже запущена. Дождитесь завершения текущей задачи.');
 return {jobId,...(request??{})};
}
