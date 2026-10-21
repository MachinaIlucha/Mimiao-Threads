import { DateTime } from 'luxon';
import { AppError } from '../errors.js';
export const ZONE='Europe/Kyiv';
export const checkpointHours = { '1h':1, '24h':24, '72h':72, '7d':168 } as const;
export function tomorrow(now = new Date()) { return DateTime.fromJSDate(now,{zone:ZONE}).plus({days:1}).toISODate()!; }
export function today(now = new Date()) { return DateTime.fromJSDate(now,{zone:ZONE}).toISODate()!; }
export function slotsFor(day: string, count=10, rankedHours: number[] = []): string[] {
 if (!Number.isInteger(count) || count<5 || count>10) throw new AppError(400,'Daily count must be 5–10');
 const chosen: number[]=[];
 const defaults = count===5 ? [9,12,15,18,21] : Array.from({length:count},(_,i)=>9+i*1.5);
 for (const hour of [...rankedHours, ...defaults, ...Array.from({length:31},(_,i)=>8+i/2)]) {
  if (!Number.isFinite(hour) || hour<8 || hour>23 || chosen.some(h=>Math.abs(h-hour)<1.5)) continue;
  chosen.push(hour); if (chosen.length===count) break;
 }
 const hours = chosen.length===count ? chosen : defaults;
 return hours.sort((a,b)=>a-b).map(h=>DateTime.fromISO(day,{zone:ZONE}).set({hour:Math.floor(h),minute:Math.round((h%1)*60),second:0,millisecond:0}).toUTC().toISO()!);
}
export function availableSlotsFor(day:string,count:number,occupied:string[]=[],now=new Date(),rankedHours:number[]=[]):string[] {
 const date=DateTime.fromISO(day,{zone:ZONE}),localNow=DateTime.fromJSDate(now,{zone:ZONE});
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
 const free=(timestamp:number)=>reserved.every(value=>Math.abs(value-timestamp)>=60_000);
 if(count>=5){
  const defaults=slotsFor(day,count,rankedHours);
  if(defaults.every(value=>{const timestamp=DateTime.fromISO(value).toMillis();return timestamp>=start&&free(timestamp);}))return defaults;
 }
 const candidates:number[]=[];
 for(let instant=start;instant<=end;instant+=60_000)if(free(instant))candidates.push(instant);
 if(candidates.length<count)throw new AppError(409,isToday?'Сегодня уже недостаточно времени для всех постов. Выберите завтра.':'На выбранный день уже недостаточно времени для всех постов.');
 return Array.from({length:count},(_,i)=>DateTime.fromMillis(candidates[count===1?0:Math.round(i*(candidates.length-1)/(count-1))],{zone:'utc'}).toISO()!);
}
export function dueDecision(scheduled: string, now: Date, previousPublished: string|null) {
 const late = now.getTime()-new Date(scheduled).getTime();
 if(late<0) return 'wait';
 if(late>30*60_000) return 'missed';
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
