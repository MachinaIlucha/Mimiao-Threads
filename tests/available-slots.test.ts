import { describe,it,expect } from 'vitest';
import { DateTime } from 'luxon';
import { availableSlotsFor } from '../server/domain/schedule';
const zone='Europe/Kyiv';
const now=new Date('2026-10-21T18:00:00Z');
describe('available plan slots',()=>{
 it('refuses to compress a full plan into the evening',()=>{
  expect(()=>availableSlotsFor('2026-10-21',10,[],now)).toThrow('90 минут');
 });
 it('spaces a three-post future plan across the day',()=>{
  expect(availableSlotsFor('2026-10-22',3,[],now).map(value=>DateTime.fromISO(value).setZone(zone).toFormat('HH:mm'))).toEqual(['10:00','16:00','21:00']);
 });
 it('uses ten default slots for tomorrow',()=>{
  const times=availableSlotsFor('2026-10-22',10,[],now).map(value=>DateTime.fromISO(value).setZone(zone).toFormat('HH:mm'));
  expect(times).toEqual(['09:00','10:30','12:00','13:30','15:00','16:30','18:00','19:30','21:00','22:30']);
 });
 it('preserves adaptive ranked hours on an available future day',()=>{
  const hours=availableSlotsFor('2026-10-22',5,[],now,[8,11,14,17,20]).map(value=>DateTime.fromISO(value).setZone(zone).hour);
  expect(hours).toEqual([8,11,14,17,20]);
 });
 it('keeps occupied posts at least ninety minutes away',()=>{
  const occupied=['2026-10-22T06:00:00Z','2026-10-22 12:30:00+03'];
  const slots=availableSlotsFor('2026-10-22',3,occupied,now);
  for(const slot of slots)for(const value of occupied){const parsed=value.includes('T')?DateTime.fromISO(value):DateTime.fromSQL(value,{setZone:true});expect(Math.abs(Date.parse(slot)-parsed.toMillis())).toBeGreaterThanOrEqual(90*60_000);}
 });
 it('never rolls near-midnight plans into tomorrow',()=>{
  expect(()=>availableSlotsFor('2026-10-21',10,[],new Date('2026-10-21T20:56:00Z'))).toThrow(expect.objectContaining({statusCode:409}));
 });
 it('rounds a five-minute lead up to a whole minute',()=>{
  expect(DateTime.fromISO(availableSlotsFor('2026-10-21',1,[],new Date('2026-10-21T18:00:15.100Z'))[0]).setZone(zone).toFormat('HH:mm:ss')).toBe('21:06:00');
 });
 it.each([0,11,1.5,NaN])('rejects invalid count %s',count=>expect(()=>availableSlotsFor('2026-10-22',count,[],now)).toThrow(expect.objectContaining({statusCode:400})));
 it.each(['2026-02-30','2026-10-20','2026-1-22','invalid'])('rejects invalid day %s',day=>expect(()=>availableSlotsFor(day,10,[],now)).toThrow(expect.objectContaining({statusCode:400})));
});
