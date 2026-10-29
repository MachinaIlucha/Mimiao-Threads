const segmenter = new Intl.Segmenter('uk', { granularity: 'grapheme' });
const emoji = /\p{Extended_Pictographic}|\p{Regional_Indicator}|\u20e3/u;

export function countEmojis(text: string): number {
  return Array.from(segmenter.segment(text)).filter(({ segment }) => emoji.test(segment)).length;
}

export function threadBatchLayoutErrors(posts: readonly { text: string; alternative: string }[]): string[] {
  return [];
}

/** Inspect layout without changing the generated text or its line endings. */
export function threadLayoutErrors(text: string): string[] {
  const normalized = text.replace(/\r\n?/g, '\n').trim();
  const paragraphs = normalized.split(/\n[\t ]*\n+/).map(p => p.trim()).filter(Boolean);
  const errors: string[] = [];
  if (text.includes('\\n')) errors.push('Используйте настоящие переносы строк вместо буквальных символов \\n.');
  if (countEmojis(text) > 2) errors.push('Оставьте максимум два уместных эмодзи.');
  return errors;
}
