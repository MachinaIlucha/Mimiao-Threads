import { describe,it,expect } from 'vitest';
import { toKyivInput,fromKyivInput } from '../shared/post-time';

describe('editor Kyiv timestamps',()=>{
 it.each(['2026-10-22 06:00:00+00','2026-10-22T06:00:00.000Z','2026-10-22 09:00:00+03'])('reads %s',value=>{
  expect(toKyivInput(value)).toBe('2026-10-22T09:00');
  expect(fromKyivInput(toKyivInput(value))).toBe('2026-10-22T06:00:00.000Z');
 });
 it.each([['2026-07-15T12:00','2026-07-15T09:00:00.000Z'],['2026-12-15T12:00','2026-12-15T10:00:00.000Z']])('uses Kyiv offsets for %s',(input,utc)=>{
  expect(fromKyivInput(input)).toBe(utc);expect(toKyivInput(utc)).toBe(input);
 });
 it('accepts optional seconds',()=>expect(fromKyivInput('2026-10-22T09:00:25')).toBe('2026-10-22T06:00:25.000Z'));
 it.each(['','invalid','2026-02-30T12:00'])('rejects %s',value=>{expect(toKyivInput(value)).toBe('');expect(fromKyivInput(value)).toBeNull();});
 it('allows absent stored values',()=>{expect(toKyivInput(null)).toBe('');expect(toKyivInput(undefined)).toBe('');});
});
