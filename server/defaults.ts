import type { Settings } from '../shared/types.js';
import { POSTS_PER_DAY, DAYS_PER_WEEK } from '../shared/cadence.js';
export const defaults: Settings = {
 paused: true, model: 'deepseek-flash', timezone: 'Europe/Kyiv', dailyCount: POSTS_PER_DAY, weeklyCount: DAYS_PER_WEEK, adaptive: false,
 startedAt: new Date().toISOString(), researchEnabled: true,
 keywords: ['CRM для школи','СРМ для школи','власники шкіл','облік оплат','перенесення занять','заміна CRM','Optimate','Voopty'],
 profiles: ['optimate.online','voopty_erp','keycrmapp','oleh.hrytsyniak','_sstacie_','anastasiia.kinga'], forbidden: ['Найкраща CRM','гарантуємо результат','повністю автоматизує школу'], preferred: [],
 knowledge: 'Mimiao — CRM для приватних шкіл додаткової освіти, навчальних центрів і репетиторів різних предметів. Основна комерційна аудиторія — власники шкіл із 2–5 викладачами. Пробний період: 14 днів без картки. Сайт: https://mimiao.online. Автор Threads — Ілля, засновник і розробник, не викладач. Будь-які додаткові функції потребують підтвердження власника.',
 voice: 'Українська мова. Живий розмовний голос Іллі, з повагою на «ви». Одна сцена або одна дилема на допис. Історії про конфлікти репетиторів і шкіл з батьками та учнями: ціна, знижки, перенесення, борги. Конкретна деталь у першому реченні, пряма мова в лапках, наприкінці вердикт або питання до колег. Ілюстративні історії можна вигадувати, але без імен, міст і назв шкіл. Не писати від імені викладача: Ілля засновник і розробник. Не вигадувати функції, ціни, статистику, клієнтів і відгуки Mimiao. Без заголовків, Markdown і хештегів. Максимум два емодзі; у чутливих темах без емодзі. До 500 знаків.'
};
