import { PgBoss } from 'pg-boss';
import { config } from './config.js';
export const jobNames=['research','prepare','publish','reconcile','metrics','replies','refresh','history','review','optimize','evergreen','browser-check'] as const;
export type JobName=typeof jobNames[number];
export const boss=new PgBoss({connectionString:config.databaseUrl,application_name:'threads-studio'});
boss.on('error',()=>{console.error('Job queue error; check database connectivity.');});
let started:Promise<void>|undefined;
export function startQueue(){return started??=(async()=>{await boss.start();for(const name of jobNames)await boss.createQueue(name,{policy:'singleton',retryLimit:0,expireInSeconds:1800});})();}
export async function enqueue(name:JobName){await startQueue();return {jobId:await boss.send(name,{}, {singletonKey:name})};}
