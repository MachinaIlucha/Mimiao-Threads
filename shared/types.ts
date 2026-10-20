export type PostStatus = 'draft' | 'scheduled' | 'publishing' | 'published' | 'blocked' | 'unknown' | 'cancelled' | 'missed';
export type Category = 'teaching' | 'life' | 'founder' | 'product';
export interface Settings {
 paused: boolean; model: string; timezone: 'Europe/Kyiv'; keywords: string[]; profiles: string[];
 knowledge: string; voice: string; forbidden: string[]; preferred: string[];
 dailyCount: number; adaptive: boolean; startedAt: string; researchEnabled: boolean;
}
export interface Post {
 publication_method?: 'api'|'browser';
 id: string; text: string; alternative: string; category: Category; status: PostStatus; scheduled_at: string | null;
 published_at: string | null; created_at: string; updated_at: string; revision: number; media_ids: string[];
 sources: string[]; topic: string; reason: string; error: string | null; provider_id: string | null;
 permalink: string | null; expires_at: string | null; generated: boolean; root_id: string | null; experiment_arm: string | null; meaningful_count?:number;
}
export interface Media { id: string; filename: string; width: number; height: number; bytes: number; alt: string; created_at: string }
export interface Idea { id: string; text: string; source_url: string | null; kind: string; state: string; note: string; created_at: string; updated_at: string }
export interface Trend { id: string; title: string; summary: string; angle: string; evidence: Evidence[]; score: number; confidence: string; state: string; expires_at: string; created_at: string }
export interface Evidence { url: string; text: string; author?: string; publishedAt?: string; discoveredAt: string; provider: string }
export interface Metric { id: string; post_id: string; checkpoint: string; source: string; measured_at: string; age_hours: number; views: number | null; likes: number | null; replies: number | null; reposts: number | null; quotes: number | null; shares: number | null; follows: number | null; profile_visits: number | null }
export interface Reply { id: string; post_id: string | null; provider_id: string; username: string; text: string; draft: string; state: string; classification: string; meaningful: boolean; manual: boolean; source_url: string | null; created_at: string; sent_id: string | null; kind:'incoming'|'opportunity' }
export interface Operation { id: string; kind: string; status: string; message: string; details: Record<string, unknown>; created_at: string }
export interface Connection { username: string; user_id: string; expires_at: string; scopes: string[]; capabilities: Record<string, { available: boolean; reason: string }>; checked_at: string | null }
export interface ApiError { message: string; code?: string }
export const labels: Record<string,string> = { draft:'Черновик', scheduled:'В очереди', publishing:'Публикуется', published:'Опубликован', blocked:'Нужна проверка', unknown:'Результат неизвестен', cancelled:'Отменён', missed:'Пропущен', teaching:'Обучение', life:'Жизнь преподавателей', founder:'От основателя', product:'Mimiao' };
