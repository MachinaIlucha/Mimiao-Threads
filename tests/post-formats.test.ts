import { expect, it } from 'vitest';
import { formatTargets, remainingFormats, orderForSlots } from '../server/domain/post-formats.js';

it('splits the daily count into the reach mix', () => {
  expect(formatTargets(8)).toEqual({ teaching: 4, life: 2, founder: 1, product: 1 });
  expect(formatTargets(4)).toEqual({ teaching: 1, life: 1, founder: 1, product: 1 });
  expect(formatTargets(3)).toEqual({ teaching: 2, life: 0, founder: 1, product: 0 });
  expect(formatTargets(1)).toEqual({ teaching: 1, life: 0, founder: 0, product: 0 });
});

it('reports the formats still needed after approved posts', () => {
  expect(remainingFormats(8, [{ category: 'teaching' }, { category: 'product' }])).toBe('teaching=3, life=2, founder=1, product=0');
  expect(remainingFormats(1, [{ category: 'teaching' }, { category: 'teaching' }])).toBe('teaching=0, life=0, founder=0, product=0');
});

it('puts stories last and keeps the order within each group', () => {
  const posts = [{ category: 'teaching', n: 1 }, { category: 'life', n: 2 }, { category: 'teaching', n: 3 }, { category: 'product', n: 4 }];
  expect(orderForSlots(posts).map(p => p.n)).toEqual([2, 4, 1, 3]);
  const none = [{ category: 'life', n: 1 }, { category: 'founder', n: 2 }];
  expect(orderForSlots(none).map(p => p.n)).toEqual([1, 2]);
});
