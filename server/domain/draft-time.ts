import { DateTime } from 'luxon';
import { growthDay } from '../../shared/growth.js';
import { AppError } from '../errors.js';
import { availableSlotsFor, slotsFor, ZONE } from './schedule.js';
import { POSTS_PER_DAY, DAYS_PER_WEEK } from '../../shared/cadence.js';

/** Fill the daily cadence before moving to the next day. A time never implies approval. */
export function nextDraftTime(occupied:string[],weeklyCount=DAYS_PER_WEEK,now=new Date(),dailyCount=POSTS_PER_DAY):string {
 const start=DateTime.fromJSDate(now,{zone:ZONE}).startOf('day');
 const times=occupied.map(value=>{
  const iso=DateTime.fromISO(value,{setZone:true});
  return (iso.isValid?iso:DateTime.fromSQL(value,{setZone:true})).setZone(ZONE);
 }).filter(value=>value.isValid);
 const days=new Map<string,number>();
 for(const time of times){const day=time.toISODate()!;days.set(day,(days.get(day)??0)+1);}
 for(let offset=0;offset<7*(days.size+2);offset++){
  const date=start.plus({days:offset}),day=date.toISODate()!;
  if(!growthDay(date.weekday,weeklyCount)||(days.get(day)??0)>=dailyCount)continue;
  const regular=slotsFor(day,dailyCount).find(at=>Date.parse(at)>=now.getTime()+5*60_000
   &&times.every(time=>Math.abs(time.toMillis()-Date.parse(at))>=90*60_000));
  if(regular)return regular;
  try{return availableSlotsFor(day,1,occupied,now)[0];}
  catch(error){if(!(error instanceof AppError)||error.statusCode!==409)throw error;}
 }
 throw new AppError(409,'Не удалось подобрать время черновика');
}
