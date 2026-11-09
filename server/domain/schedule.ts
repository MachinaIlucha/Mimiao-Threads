import { DateTime } from 'luxon';
import { AppError } from '../errors.js';
import { POSTS_PER_DAY } from '../../shared/cadence.js';
export const ZONE='Europe/Kyiv';
export const checkpointHours = { '1h':1, '24h':24, '72h':72, '7d':168 } as const;
/** Minimum distance between two root publications, enforced by the publisher. */
export const MIN_PUBLISH_GAP_MINUTES=10;
/** Spacing tried by the daily quota, widest first. */
export const QUOTA_GAPS_MINUTES=[90,60,45,30,20,15,10] as const;
export function tomorrow(now = new Date()) { return DateTime.fromJSDate(now,{zone:ZONE}).plus({days:1}).toISODate()!; }
export function today(now = new Date()) { return DateTime.fromJSDate(now,{zone:ZONE}).toISODate()!; }
export function slotsFor(day: string, count=10, rankedHours: number[] = []): string[] {
 if (!Number.isInteger(count) || count<1 || count>10) throw new AppError(400,'Daily count must be 1–10');
 const chosen: number[]=[];
 const defaults = count<=4 ? ({1:[18],2:[12,21],3:[10,16,21],4:[9,13,17,21]}[count]!) : count===5 ? [9,12,15,18,21] : count===8 ? [9,11,13,15,17,19,21,22.5] : Array.from({length:count},(_,i)=>9+i*1.5);
 for (const hour of [...rankedHours, ...defaults, ...Array.from({length:31},(_,i)=>8+i/2)]) {
  if (!Number.isFinite(hour) || hour<8 || hour>23 || chosen.some(h=>Math.abs(h-hour)<1.5)) continue;
  chosen.push(hour); if (chosen.length===count) break;
 }
 const hours = chosen.length===count ? chosen : defaults;
 return hours.sort((a,b)=>a-b).map(h=>DateTime.fromISO(day,{zone:ZONE}).set({hour:Math.floor(h),minute:Math.round((h%1)*60),second:0,millisecond:0}).toUTC().toISO()!);
}
export function availableSlotsFor(day:string,count:number,occupied:string[]=[],now=new Date(),rankedHours:number[]=[],minIntervalMinutes:60|90=90):string[] {
 const date=DateTime.fromISO(day,{zone:ZONE}),localNow=DateTime.fromJSDate(now,{zone:ZONE});
 if(![60,90].includes(minIntervalMinutes))throw new AppError(400,'Допустимый интервал: 60 или 90 минут');
 if(!Number.isInteger(count)||count<1||count>10)throw new AppError(400,'Daily count must be 1–10');
 if(!/^\d{4}-\d{2}-\d{2}$/.test(day)||!date.isValid||date.toISODate()!==day||day<localNow.toISODate()!)throw new AppError(400,'Выберите сегодняшний или будущий день');
 const isToday=day===localNow.toISODate();
 const earliest=localNow.plus({minutes:5});
 const rounded=earliest.startOf('minute').plus({minutes:earliest.second||earliest.millisecond?1:0});
 const start=Math.max(date.set({hour:8}).toMillis(),isToday?rounded.toMillis():0);
 const end=date.set({hour:23,minute:59}).toMillis();
 const reserved=occupied.map(value=>{
  const iso=DateTime.fromISO(value,{setZone:true});
  return (iso.isValid?iso:DateTime.fromSQL(value,{setZone:true})).toMillis();
 }).filter(Number.isFinite);
 const free=(timestamp:number)=>reserved.every(value=>Math.abs(value-timestamp)>=minIntervalMinutes*60_000);
 {
  const defaults=slotsFor(day,count,rankedHours);
  if(defaults.every(value=>{const timestamp=DateTime.fromISO(value).toMillis();return timestamp>=start&&free(timestamp);}))return defaults;
 }
 const candidates:number[]=[];
 for(let instant=start;instant<=end;instant+=60_000){
  if(free(instant)&&(!candidates.length||instant-candidates[candidates.length-1]>=minIntervalMinutes*60_000))candidates.push(instant);
 }
 if(candidates.length<count)throw new AppError(409,`Недостаточно времени для постов с интервалом ${minIntervalMinutes} минут. Уменьшите число постов или выберите завтра.`);
 return Array.from({length:count},(_,i)=>DateTime.fromMillis(candidates[count===1?0:Math.round(i*(candidates.length-1)/(count-1))],{zone:'utc'}).toISO()!);
}
/** Times for up to `count` more root posts on `day`: not before 08:00 or now+5 minutes, not after 23:59 Kyiv.
 * Prefers the regular eight-post grid, otherwise the widest even spacing that fits. Returns fewer than
 * `count` only when even ten-minute spacing cannot fit them before midnight. */
export function quotaSlots(day:string,count:number,occupied:string[]=[],now=new Date()):string[] {
 const date=DateTime.fromISO(day,{zone:ZONE}),localNow=DateTime.fromJSDate(now,{zone:ZONE});
 if(!/^\d{4}-\d{2}-\d{2}$/.test(day)||!date.isValid||date.toISODate()!==day||day<localNow.toISODate()!)throw new AppError(400,'Выберите сегодняшний или будущий день');
 if(!Number.isInteger(count)||count<1)return [];
 const earliest=localNow.plus({minutes:5});
 const rounded=earliest.startOf('minute').plus({minutes:earliest.second||earliest.millisecond?1:0});
 const start=Math.max(date.set({hour:8}).toMillis(),rounded.toMillis());
 const end=date.set({hour:23,minute:59}).toMillis();
 const reserved=occupied.map(value=>{
  const iso=DateTime.fromISO(value,{setZone:true});
  return (iso.isValid?iso:DateTime.fromSQL(value,{setZone:true})).toMillis();
 }).filter(Number.isFinite);
 const toIso=(timestamp:number)=>DateTime.fromMillis(timestamp,{zone:'utc'}).toISO()!;
 let best:number[]=[];
 for(const gap of QUOTA_GAPS_MINUTES){
  const free=(timestamp:number)=>reserved.every(value=>Math.abs(value-timestamp)>=gap*60_000);
  const grid=slotsFor(day,POSTS_PER_DAY).map(value=>Date.parse(value)).filter(timestamp=>timestamp>=start&&timestamp<=end&&free(timestamp));
  if(grid.length>=count)return grid.slice(0,count).map(toIso);
  const candidates:number[]=[];
  for(let instant=start;instant<=end;instant+=60_000){
   if(free(instant)&&(!candidates.length||instant-candidates[candidates.length-1]>=gap*60_000))candidates.push(instant);
  }
  if(candidates.length>=count)return Array.from({length:count},(_,i)=>candidates[count===1?0:Math.round(i*(candidates.length-1)/(count-1))]).map(toIso);
  if(candidates.length>best.length)best=candidates;
 }
 return best.map(toIso);
}
export function dueDecision(scheduled: string, now: Date, previousPublished: string|null,minIntervalMinutes:number=90) {
 const late = now.getTime()-new Date(scheduled).getTime();
 if(late<0) return 'wait';
 if(late>30*60_000) return 'missed';
 if(previousPublished && now.getTime()-Date.parse(previousPublished)<minIntervalMinutes*60_000)return 'wait';
 return 'publish';
}
export function eligibleCheckpoint(age: number, checkpoint: string) { return checkpoint in checkpointHours && age >= checkpointHours[checkpoint as keyof typeof checkpointHours]; }
export function experimentAssignments(startsOn: string) {
 const result:Record<string,string>={};
 for(let i=0;i<28;i++) result[DateTime.fromISO(startsOn).plus({days:i}).toISODate()!] = (Math.floor(i/7)+(i%7))%2===0?'base':'extra';
 return result;
}
export interface ExperimentStats { days:number; meaningful:number; medianViews:number|null; dailyFollowers:number|null }
export function chooseExperiment(base:ExperimentStats,extra:ExperimentStats) {
 if(base.days<14||extra.days<14||base.meaningful<20||extra.meaningful<20||base.medianViews===null||extra.medianViews===null||base.dailyFollowers===null||extra.dailyFollowers===null) return 'insufficient';
 return extra.meaningful/extra.days>=base.meaningful/base.days*1.15 && extra.medianViews>=base.medianViews && extra.dailyFollowers>=base.dailyFollowers ? 'increase':'keep';
}
