import { DateTime } from 'luxon';
export const ZONE='Europe/Kyiv';
export const checkpointHours = { '1h':1, '24h':24, '72h':72, '7d':168 } as const;
export function tomorrow(now = new Date()) { return DateTime.fromJSDate(now,{zone:ZONE}).plus({days:1}).toISODate()!; }
export function today(now = new Date()) { return DateTime.fromJSDate(now,{zone:ZONE}).toISODate()!; }
export function slotsFor(day: string, count=5, rankedHours: number[] = []): string[] {
 if (count<5 || count>8) throw new Error('Daily count must be 5–8');
 const chosen: number[]=[];
 // Half-hour slots, with enough space left for all requested posts.
 const defaults = count===5 ? [9,12,15,18,21] : Array.from({length:count},(_,i)=>8.5+i*1.75);
 for (const hour of [...rankedHours, ...defaults, ...Array.from({length:31},(_,i)=>8+i/2)]) {
  if (hour<8 || hour>23 || chosen.some(h=>Math.abs(h-hour)<1.5)) continue;
  chosen.push(hour); if (chosen.length===count) break;
 }
 if (chosen.length<count) return slotsFor(day,count,[]);
 return chosen.sort((a,b)=>a-b).map(h=>DateTime.fromISO(day,{zone:ZONE}).set({hour:Math.floor(h),minute:Math.round((h%1)*60),second:0,millisecond:0}).toUTC().toISO()!);
}
export function dueDecision(scheduled: string, now: Date, previousPublished: string|null) {
 const late = now.getTime()-new Date(scheduled).getTime();
 if(late<0) return 'wait';
 if(late>30*60_000) return 'missed';
 if(previousPublished && now.getTime()-new Date(previousPublished).getTime()<90*60_000) return 'wait';
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
