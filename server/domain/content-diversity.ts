export function contentDiversityErrors(posts: readonly { trendId: string | null; sourceUrls: string[] }[]): string[] {
  const trends = new Map<string, number>(), sources = new Map<string, number>();
  for (const post of posts) {
    if (post.trendId !== null) trends.set(post.trendId, (trends.get(post.trendId) || 0) + 1);
    for (const url of new Set(post.sourceUrls)) sources.set(url, (sources.get(url) || 0) + 1);
  }
  return [...trends].filter(([, count]) => count > 2).map(([id]) => `Повторяющийся тренд ${id}: максимум 2 поста на один тренд. Выберите свежие вечные темы без выдуманных доказательств.`)
    .concat([...sources].filter(([, count]) => count > 2).map(([url]) => `Повторяющийся источник ${url}: максимум 2 поста на один источник. Выберите свежие вечные темы без выдуманных доказательств.`));
}
