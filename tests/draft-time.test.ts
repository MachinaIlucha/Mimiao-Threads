import { expect,it } from 'vitest';
import { nextDraftTime } from '../server/domain/draft-time';

it('reserves one working day per post and skips the weekend',()=>{
 const now=new Date('2026-10-29T06:00:00Z');
 const occupied=['2026-10-29T08:00:00Z','2026-10-29T14:00:00Z','2026-10-29T19:00:00Z'];
 const first=nextDraftTime(occupied,5,now,1);
 expect(first).toBe('2026-10-30T16:00:00.000Z');
 expect(nextDraftTime([...occupied,first],5,now,1)).toBe('2026-11-02T16:00:00.000Z');
});
it('respects four-day cadence and Kyiv dates in SQL timestamps',()=>{
 expect(nextDraftTime(['2026-11-03 18:00:00+02'],4,new Date('2026-11-03T06:00:00Z'),1)).toBe('2026-11-05T16:00:00.000Z');
 expect(nextDraftTime(['2026-10-29 23:30:00-03'],5,new Date('2026-10-30T06:00:00Z'),1)).toBe('2026-11-02T16:00:00.000Z');
});
it('rolls a late Friday forward and preserves 18:00 across daylight saving',()=>{
 expect(nextDraftTime([],5,new Date('2026-10-30T21:58:00Z'),1)).toBe('2026-11-02T16:00:00.000Z');
 expect(nextDraftTime([],5,new Date('2026-07-15T06:00:00Z'),1)).toBe('2026-07-15T15:00:00.000Z');
});


it('fills eight slots on Saturday before using Sunday, with ninety-minute spacing',()=>{
 const now=new Date('2026-10-31T06:00:00Z'),occupied:string[]=[];
 for(let i=0;i<9;i++)occupied.push(nextDraftTime(occupied,7,now));
 expect(occupied.slice(0,8)).toEqual(['07:00','09:00','11:00','13:00','15:00','17:00','19:00','20:30'].map(t=>`2026-10-31T${t}:00.000Z`));
 expect(occupied[8]).toBe('2026-11-01T07:00:00.000Z');
});
