import { describe,it,expect } from 'vitest';
import { DateTime } from 'luxon';
import { slotsFor,tomorrow,dueDecision,experimentAssignments,chooseExperiment } from '../server/domain/schedule';
import { checkText,median,nullableMetric,similarity } from '../server/domain/editorial';
import { hashPassword,verifyPassword,mediaSignature,safeEqual } from '../server/security';
describe('Kyiv scheduling',()=>{
 it('uses Kyiv tomorrow around UTC midnight',()=>expect(tomorrow(new Date('2026-10-19T21:30:00Z'))).toBe('2026-10-21'));
 it.each(['2026-03-28','2026-03-29','2026-10-24','2026-10-25'])('keeps local slots through DST %s',day=>{const slots=slotsFor(day);expect(slots.map(x=>DateTime.fromISO(x).setZone('Europe/Kyiv').hour)).toEqual([9,12,15,18,21]);});
 it.each([5,6,7,8])('always fits %i posts at least90minutes apart',n=>{for(const ranked of [[],[8,9,10,11],[12,13,14,15],[22,23,20]]){const slots=slotsFor('2026-10-25',n,ranked).map(x=>Date.parse(x));expect(slots).toHaveLength(n);for(let i=1;i<slots.length;i++)expect(slots[i]-slots[i-1]).toBeGreaterThanOrEqual(90*60000);}});
 it('skips old jobs and respects spacing',()=>{const now=new Date('2026-10-20T10:00:00Z');expect(dueDecision('2026-10-20T09:29:00Z',now,null)).toBe('missed');expect(dueDecision('2026-10-20T10:01:00Z',now,null)).toBe('wait');expect(dueDecision('2026-10-20T09:50:00Z',now,'2026-10-20T09:00:00Z')).toBe('wait');expect(dueDecision('2026-10-20T09:50:00Z',now,null)).toBe('publish');});
 it('balances weekdays in28day experiment',()=>{const assignment=experimentAssignments('2026-10-19');for(let weekday=1;weekday<=7;weekday++){const arms=Object.entries(assignment).filter(([d])=>DateTime.fromISO(d).weekday===weekday).map(([,arm])=>arm);expect(arms.filter(a=>a==='base')).toHaveLength(2);expect(arms.filter(a=>a==='extra')).toHaveLength(2);}});
 it('does not increase frequency without follower data',()=>{const sample={days:14,meaningful:40,medianViews:100,dailyFollowers:null};expect(chooseExperiment(sample,{...sample,meaningful:80})).toBe('insufficient');expect(chooseExperiment({...sample,dailyFollowers:2},{...sample,meaningful:50,dailyFollowers:3})).toBe('increase');});
});
describe('editorial and honest metrics',()=>{
 it('flags forbidden claims, long posts and near duplicates',()=>{expect(checkText('Найкраща CRM',{forbidden:['Найкраща CRM']})).not.toHaveLength(0);expect(checkText('а'.repeat(501),{forbidden:[]})).not.toHaveLength(0);const text='Як ви знаходите час для підготовки до складних уроків?';expect(similarity(text,text)).toBe(1);expect(checkText(text,{forbidden:[]},[text])).not.toHaveLength(0);});
 it('distinguishes missing from zero',()=>{expect(nullableMetric([],'views')).toBeNull();expect(nullableMetric([{name:'views',values:[{value:0}]}],'views')).toBe(0);expect(nullableMetric([{name:'views',values:[{value:'20'}]}],'views')).toBeNull();expect(median([])).toBeNull();expect(median([1,5,100])).toBe(5);});
});
describe('owner credentials',()=>{
 it('hashes and verifies without accepting damaged hashes',()=>{const hash=hashPassword('test password');expect(verifyPassword('test password',hash)).toBe(true);expect(verifyPassword('wrong',hash)).toBe(false);expect(verifyPassword('test','broken')).toBe(false);});
 it('binds media signature to id and expiry',()=>{expect(safeEqual(mediaSignature('a',100),mediaSignature('b',100))).toBe(false);expect(safeEqual(mediaSignature('a',100),mediaSignature('a',101))).toBe(false);});
});
