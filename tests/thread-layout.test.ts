import {expect,it} from 'vitest';
import {countEmojis,threadLayoutErrors,threadBatchLayoutErrors} from '../server/domain/thread-layout';
it('allows one complete paragraph and variable paragraph counts',()=>{
 expect(threadLayoutErrors('ї'.repeat(400))).toEqual([]);
 expect(threadLayoutErrors(Array(6).fill('Коротка думка.').join('\n\n'))).toEqual([]);
});
it('does not silently accept literal newline escapes',()=>expect(threadLayoutErrors('Думка.\\nДруга.')).toHaveLength(1));
it.each(['👩🏽‍🏫','👨‍👩‍👧‍👦','🇺🇦','1️⃣'])('counts compound emoji as one: %s',emoji=>{
 expect(countEmojis(emoji)).toBe(1);expect(threadLayoutErrors(emoji+' 💡')).toEqual([]);expect(threadLayoutErrors(emoji+' 💡 📚')).toHaveLength(1);
});
it('never forces decorative emoji to fill a quota',()=>expect(threadBatchLayoutErrors(Array(10).fill({text:'Питання.',alternative:'Думка.'}))).toEqual([]));
