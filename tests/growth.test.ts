import {expect,it} from 'vitest';
import {sourceInput,eventInput,schoolInput,usableSource,activeDiscussion,growthDay} from '../shared/growth';
it('requires customer permission separately from factual confirmation',()=>{
 expect(usableSource({confirmed:true,kind:'customer',permission:false})).toBe(false);
 expect(usableSource({confirmed:true,kind:'customer',permission:true})).toBe(true);
 expect(usableSource({confirmed:false,kind:'founder',permission:true})).toBe(false);
});
it('uses recent activity on an old thread without inventing undated freshness',()=>{
 const now=Date.parse('2026-10-29T00:00:00Z');
 expect(activeDiscussion({published_at:'2026-06-01T00:00:00Z',activity_at:'2026-10-28T00:00:00Z'},now)).toBe(true);
 expect(activeDiscussion({published_at:null,activity_at:null},now)).toBe(false);
 expect(activeDiscussion({published_at:null,activity_at:'2026-11-01T00:00:00Z'},now)).toBe(false);
});
it('rejects unsafe links and future evidence dates',()=>{const base={title:'Source',text:'Verified source text',kind:'public',hypothesis:'transition'};expect(sourceInput.safeParse({...base,url:'javascript:alert(1)'}).success).toBe(false);expect(sourceInput.safeParse({...base,url:'https://example.com',activity_at:'2099-01-01T00:00:00Z'}).success).toBe(false);});
it('keeps identity stable and requires attribution evidence',()=>{expect(schoolInput.parse({name:'School',key:' SCHOOL.EXAMPLE ',qualified:true}).key).toBe('school.example');expect(eventInput.safeParse({stage:'paid',attribution:'tracked',happened_at:new Date().toISOString(),proof:'Payment seen'}).success).toBe(false);});
it('limits default generation to five weekdays or four chosen days',()=>{expect([1,2,3,4,5,6,7].filter(d=>growthDay(d))).toHaveLength(5);expect([1,2,3,4,5,6,7].filter(d=>growthDay(d,4))).toEqual([1,2,4,5]);});
