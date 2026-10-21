import { CLIENT_VOICE } from '../../shared/client-voice.js';
import { CLIENT_COMMUNICATION_SOURCES } from '../../shared/client-communication-sources.js';

const publicCopyKinds = new Set(['daily-plan', 'variant', 'evergreen', 'reply']);
const audienceCopyKinds = new Set(['daily-plan', 'variant', 'evergreen']);
const audienceOpening = /^(?:Репетитори,|Вчителі,|Викладачі,|Власники шкіл,)/iu;

export function clientVoiceInstruction(kind: string): string {
  if (!publicCopyKinds.has(kind)) return '';
  const sources = CLIENT_COMMUNICATION_SOURCES.map(source =>
    `=== ${source.source} | полный исходник, снимок ${source.capturedAt} ===\n${source.text}\n=== Конец ${source.source} ===`
  ).join('\n\n');
  return `\n\nПолный навык общения Mimiao и его исходные материалы:\n${sources}

Применение к текущей задаче Threads:
Прочитай полные материалы выше и используй их принципы письма, фактической точности, культурной уместности и качества. Текущая задача ограничена публикациями или ответами в Threads в заданном JSON-формате. Не создавай полную кампанию, смету, презентацию или план продаж, не добавляй этапы согласования из кампаний. Примеры переписки не копируй как посты.
Плейбук является справочником общения, а не актуальным каталогом цен, акций, сроков, возможностей продукта или обещаний. Такие сведения и примеры из него не являются доказательствами для публикаций. Используй только отдельно предоставленные подтверждённые знания и источники текущей задачи. Не изображай примеры как реальные клиентские истории. Не отправляй сообщения и не выполняй действия: верни только запрошенный текст.
Настройки голоса владельца дополняют эти материалы. Для формы коротких постов применяй следующие правила вместе с полными исходниками:
${CLIENT_VOICE}${audienceCopyKinds.has(kind) ? '\nОбязательная адаптация для Threads: каждый публичный text и alternative после удаления начальных пробелов должен начинаться с символа 0 одним из прямых обращений: «Репетитори,», «Вчителі,», «Викладачі,» или «Власники шкіл,». Это правило действует для всех категорий, включая founder и product. Представление основателя может следовать только после обращения к аудитории.' : ''}`;
}

/** Validate only public copy, not source URLs, research or internal explanations. */
export function clientVoiceErrors(kind: string, result: unknown): string[] {
  if (!publicCopyKinds.has(kind)) return [];
  const value = result as { posts?: { text: string; alternative: string }[]; text?: string; alternative?: string; draft?: string };
  const copy = kind === 'daily-plan'
    ? (value.posts || []).flatMap((p,i) => [{field:`posts[${i}].text`,text:p.text},{field:`posts[${i}].alternative`,text:p.alternative}])
    : kind === 'reply' ? [{field:'draft',text:value.draft}]
    : [{field:'text',text:value.text},...(typeof value.alternative==='string'?[{field:'alternative',text:value.alternative}]:[])];
  const texts = copy.map(p=>p.text);
  const hasDash = texts.some(text => {
    if (!text) return false;
    const prose = text.replace(/https?:\/\/\S+/g, '');
    return /[\u2012-\u2015\u2e3a\u2e3b]|(?:^|\s)[-\u2010\u2011](?=\s|$)|\d[-\u2010\u2011]\d/u.test(prose);
  });
  const errors = hasDash ? ['Стиль общения Mimiao: перепишите текст без тире, а диапазоны выразите словами.'] : [];
  if(audienceCopyKinds.has(kind)){
    for(const {field,text} of copy){
      if(!audienceOpening.test((text||'').trimStart()))errors.push(`Стиль общения Mimiao: ${field} не начинается с обращения к аудитории. Начните с «Репетитори,», «Вчителі,», «Викладачі,» или «Власники шкіл,»; представление основателя следует после обращения.`);
    }
  }
  return errors;
}
