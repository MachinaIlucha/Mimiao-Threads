import { describe, it, expect } from 'vitest';
import { DateTime } from 'luxon';
import { quotaSlots, dueDecision } from '../server/domain/schedule';
const kyiv=(values:string[])=>values.map(v=>DateTime.fromISO(v).setZone('Europe/Kyiv').toFormat('HH:mm'));
describe('quota slots',()=>{
 it('uses the regular grid for a full day',()=>{
  expect(kyiv(quotaSlots('2026-11-10',8,[],new Date('2026-11-10T06:05:00Z')))).toEqual(['09:00','11:00','13:00','15:00','17:00','19:00','21:00','22:30']);
 });
 it('spreads the rest of the afternoon around published posts',()=>{
  expect(kyiv(quotaSlots('2026-11-10',6,['2026-11-10T07:00:00.000Z','2026-11-10T09:00:00.000Z'],new Date('2026-11-10T12:05:00Z')))).toEqual(['14:10','15:40','17:10','20:10','21:40','23:10']);
 });
 it('compresses to ten minutes late in the evening',()=>{
  expect(kyiv(quotaSlots('2026-11-10',5,[],new Date('2026-11-10T21:05:00Z')))).toEqual(['23:10','23:20','23:30','23:40','23:50']);
 });
 it('returns fewer slots when midnight is too close',()=>{
  expect(kyiv(quotaSlots('2026-11-10',5,[],new Date('2026-11-10T21:40:00Z')))).toEqual(['23:45','23:55']);
 });
 it('returns nothing for zero and rejects a past day',()=>{
  expect(quotaSlots('2026-11-10',0,[],new Date('2026-11-10T06:05:00Z'))).toEqual([]);
  expect(()=>quotaSlots('2026-11-09',1,[],new Date('2026-11-10T06:05:00Z'))).toThrow();
 });
 it('waits only for the fixed publisher gap',()=>{
  expect(dueDecision('2026-11-10T10:00:00Z',new Date('2026-11-10T10:00:00Z'),'2026-11-10T09:49:00Z',10)).toBe('publish');
  expect(dueDecision('2026-11-10T10:00:00Z',new Date('2026-11-10T10:00:00Z'),'2026-11-10T09:51:00Z',10)).toBe('wait');
 });
});
