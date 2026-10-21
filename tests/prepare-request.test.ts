import { describe, expect, it } from 'vitest';
import { parsePrepareRequest } from '../server/jobs.js';
import { AppError } from '../server/errors.js';

const now = new Date('2026-10-19T21:30:00Z');
describe('parsePrepareRequest', () => {
  it('defaults missing cron payload to tomorrow in Kyiv around UTC midnight', () => {
    expect(parsePrepareRequest(undefined, now)).toEqual({ day: '2026-10-21', regenerate: false });
    expect(parsePrepareRequest(null, now)).toEqual({ day: '2026-10-21', regenerate: false });
  });
  it('accepts today with explicit regeneration', () => {
    expect(parsePrepareRequest({ day: '2026-10-20', regenerate: true }, now))
      .toEqual({ day: '2026-10-20', regenerate: true });
  });
  it.each(['2026-10-21', '2026-12-01'])('accepts tomorrow and future days: %s', day => {
    expect(parsePrepareRequest({ day }, now)).toEqual({ day, regenerate: false });
  });
  it.each(['2026-10-19', '2026-02-30'])('rejects past or impossible dates with 400: %s', day => {
    expect(() => parsePrepareRequest({ day }, now)).toThrow(AppError);
    try { parsePrepareRequest({ day }, now); } catch (error) {
      expect(error).toMatchObject({ statusCode: 400 });
    }
  });
  it('rejects string booleans', () => {
    expect(() => parsePrepareRequest({ regenerate: 'true' }, now)).toThrow();
  });
  it('rejects unknown fields', () => {
    expect(() => parsePrepareRequest({ extra: true }, now)).toThrow();
  });
});
