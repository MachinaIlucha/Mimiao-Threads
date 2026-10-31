import { z } from 'zod';
import { DAYS_PER_WEEK } from './cadence.js';
export const hypotheses = { transition: 'Переход и помощь основателя', accounting: 'Понятный учёт на одной группе' } as const;
export const sourceKinds = { public: 'Публичное обсуждение', founder: 'Заметка основателя', customer: 'Клиентская история', demo: 'Проверенная демонстрация' } as const;
export const stages = { conversation: 'Предметный разговор', registered: 'Регистрация', activated: 'Проведён урок и проверен учёт', paid: 'Оплата', renewed: 'Продление', lost: 'Отказ / уход' } as const;
export const attributionKinds = { tracked: 'Отслежено технически', reported: 'Со слов клиента', unknown: 'Неизвестно' } as const;
const date = z.string().datetime({offset:true}).refine(v=>Date.parse(v)<=Date.now(), 'Дата не может быть в будущем');
const link = z.string().url().refine(v=>new URL(v).protocol==='https:', 'Нужна HTTPS-ссылка');
export const sourceInput = z.object({
 title:z.string().trim().min(1).max(200), text:z.string().trim().min(10).max(6000), url:link.nullable().default(null), author:z.string().max(100).default(''),
 kind:z.enum(['public','founder','customer','demo']), hypothesis:z.enum(['transition','accounting']),
 published_at:date.nullable().default(null), activity_at:date.nullable().default(null),
 confirmed:z.boolean().default(false), permission:z.boolean().default(false)
}).refine(v=>v.kind!=='public'||!!v.url,{message:'Для обсуждения нужна ссылка',path:['url']})
 .refine(v=>!v.published_at||!v.activity_at||Date.parse(v.activity_at)>=Date.parse(v.published_at),{message:'Активность раньше публикации',path:['activity_at']});
export type GrowthSource = z.infer<typeof sourceInput> & {id:string;created_at:string};
export function usableSource(s: Pick<GrowthSource,'confirmed'|'kind'|'permission'>) { return s.confirmed && (s.kind!=='customer'||s.permission); }
export function activeDiscussion(s:Pick<GrowthSource,'activity_at'|'published_at'>,now=Date.now()) {
 const at=Date.parse(s.activity_at||s.published_at||''); return Number.isFinite(at)&&at<=now&&now-at<=72*3600_000;
}
export const schoolInput=z.object({name:z.string().trim().min(1).max(160),key:z.string().trim().min(1).max(160).transform(v=>v.toLowerCase()),qualified:z.boolean(),note:z.string().max(2000).default('')});
export const eventInput=z.object({stage:z.enum(['conversation','registered','activated','paid','renewed','lost']),happened_at:date,attribution:z.enum(['tracked','reported','unknown']),source:z.string().max(100).default(''),content_id:z.string().max(100).default(''),proof:z.string().trim().min(1).max(2000)}).refine(v=>v.attribution==='unknown'||!!v.source.trim(),{message:'Укажите источник атрибуции',path:['source']});
export function growthDay(weekday:number,weeklyCount=DAYS_PER_WEEK){return weeklyCount===7?weekday>=1&&weekday<=7:weeklyCount===4?[1,2,4,5].includes(weekday):weekday>=1&&weekday<=5;}
