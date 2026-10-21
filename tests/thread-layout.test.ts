import { expect, it } from 'vitest';
import { countEmojis, threadLayoutErrors } from '../server/domain/thread-layout';

it('requires paragraphs at 140 Unicode codepoints, not 139', () => {
  expect(threadLayoutErrors('ї'.repeat(139))).toEqual([]);
  expect(threadLayoutErrors('ї'.repeat(140))).toContain('Разделите текст от 140 знаков минимум на два абзаца пустой строкой.');
  // Supplementary characters count as one codepoint, independently of UTF-16 length.
  expect(threadLayoutErrors('𐐀'.repeat(139))).toEqual([]);
});
it.each(['\n\n', '\r\n\r\n', '\r\r', '\n \t\n'])('accepts actual blank lines %j', separator => {
  expect(threadLayoutErrors(`${'Думка '.repeat(15)}${separator}${'Порада '.repeat(15)}`)).toEqual([]);
});
it('does not treat a single newline as a paragraph', () => {
  expect(threadLayoutErrors(`${'ї'.repeat(70)}\n${'ї'.repeat(70)}`)).toHaveLength(1);
});
it('limits paragraph number and individual paragraph length', () => {
  expect(threadLayoutErrors(Array(5).fill('Корисна думка.').join('\n\n'))).toContain('Сократите текст до четырёх абзацев максимум.');
  expect(threadLayoutErrors(`${'ї'.repeat(220)}\n\nДруга думка.`)).toEqual([]);
  expect(threadLayoutErrors(`${'ї'.repeat(221)}\n\nДруга думка.`)).toContain('Разделите длинный абзац: максимум 220 знаков в каждом.');
});
it('rejects literal backslash n instead of silently rewriting it', () => {
  expect(threadLayoutErrors('Перша думка.\\n\\nДруга думка.')).toContain('Используйте настоящие переносы строк вместо буквальных символов \\n.');
});
it.each(['👩🏽‍🏫', '👨‍👩‍👧‍👦', '🇺🇦', '1️⃣'])('counts a compound emoji as one grapheme: %s', emoji => {
  expect(countEmojis(`Порада ${emoji}`)).toBe(1);
  expect(countEmojis(`${emoji} 💡`)).toBe(2);
  expect(threadLayoutErrors(`Корисна думка ${emoji} 💡`)).toEqual([]);
  expect(threadLayoutErrors(`Корисна думка ${emoji} 💡 📚`)).toContain('Оставьте максимум два уместных эмодзи.');
});
it('allows sensitive copy without emoji', () => {
  expect(countEmojis('Бережіть себе.')).toBe(0);
  expect(threadLayoutErrors('Бережіть себе.')).toEqual([]);
});
