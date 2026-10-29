import { DateTime } from 'luxon';
import { growthDay } from '../../shared/growth.js';
import { AppError } from '../errors.js';
import { availableSlotsFor, ZONE } from './schedule.js';

/** One proposed post per free working day. A time never implies approval. */
export function nextDraftTime(occupied:string[],weeklyCount=5,now=new Date()):string {
 const start=DateTime.fromJSDate(now,{zone:ZONE}).startOf('day');
 const days=new Set(occupied.map(value=>{
  const iso=DateTime.fromISO(value,{setZone:true});
  return (iso.isValid?iso:DateTime.fromSQL(value,{setZone:true})).setZone(ZONE).toISODate();
 }).filter(Boolean));
 for(let offset=0;offset<7*(days.size+2);offset++){
  const date=start.plus({days:offset}),day=date.toISODate()!;
  if(!growthDay(date.weekday,weeklyCount)||days.has(day))continue;
  try{return availableSlotsFor(day,1,occupied,now)[0];}
  catch(error){if(!(error instanceof AppError)||error.statusCode!==409)throw error;}
 }
 throw new AppError(409,'Не удалось подобрать время черновика');
}
