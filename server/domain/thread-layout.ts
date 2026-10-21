const segmenter = new Intl.Segmenter('uk', { granularity: 'grapheme' });
const emoji = /\p{Extended_Pictographic}|\p{Regional_Indicator}|\u20e3/u;

export function countEmojis(text: string): number {
  return Array.from(segmenter.segment(text)).filter(({ segment }) => emoji.test(segment)).length;
}

export function threadBatchLayoutErrors(posts: readonly { text: string; alternative: string }[]): string[] {
  if (posts.length < 5) return [];
  const minimum = Math.ceil(posts.length / 2);
  return (['text', 'alternative'] as const)
    .filter(field => posts.filter(post => countEmojis(post[field]) > 0).length < minimum)
    .map(field => `План: добавьте по одному уместному эмодзи минимум в ${minimum} из ${posts.length} полей ${field}. Выберите для этого обычные нечувствительные темы; чувствительные посты оставьте без эмодзи. Не превышайте два эмодзи на пост.`);
}

/** Inspect layout without changing the generated text or its line endings. */
export function threadLayoutErrors(text: string): string[] {
  const normalized = text.replace(/\r\n?/g, '\n').trim();
  const paragraphs = normalized.split(/\n[\t ]*\n+/).map(p => p.trim()).filter(Boolean);
  const errors: string[] = [];
  if (Array.from(normalized).length >= 140 && paragraphs.length < 2) errors.push('Разделите текст от 140 знаков минимум на два абзаца пустой строкой.');
  if (paragraphs.length > 4) errors.push('Сократите текст до четырёх абзацев максимум.');
  if (paragraphs.some(p => Array.from(p).length > 220)) errors.push('Разделите длинный абзац: максимум 220 знаков в каждом.');
  if (text.includes('\\n')) errors.push('Используйте настоящие переносы строк вместо буквальных символов \\n.');
  if (countEmojis(text) > 2) errors.push('Оставьте максимум два уместных эмодзи.');
  return errors;
}
