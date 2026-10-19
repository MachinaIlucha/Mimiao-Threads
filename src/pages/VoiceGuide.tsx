import { CLIENT_VOICE } from '../../shared/client-voice';
import { CLIENT_COMMUNICATION_SOURCES } from '../../shared/client-communication-sources';

export function VoiceGuide() {
  const total = CLIENT_COMMUNICATION_SOURCES.reduce((sum, source) => sum + [...source.text].length, 0);
  return <section className="panel form-panel voice-guide">
    <span className="eyebrow">ПОЛНЫЙ НАВЫК ПОДКЛЮЧЁН</span>
    <h2>Как мы общаемся с клиентами</h2>
    <p className="muted">DeepSeek получает все три документа целиком при создании постов, альтернативных вариантов, замен устаревших тем и ответов. Краткое описание ниже не заменяет исходники.</p>
    <div className="inline voice-source-count"><span className="badge scheduled">3 полных документа</span><span className="muted">{total.toLocaleString('ru-RU')} символов в исходниках</span></div>
    <p>Живой украинский, уважительное «ви», тепло, конкретика и внимание к контексту. Без тире, выдуманных обещаний и навязчивых продаж.</p>
    <h3>Полные исходники, которые читает DeepSeek</h3>
    {CLIENT_COMMUNICATION_SOURCES.map(source => <details key={source.id} className="voice-source">
      <summary>{source.title} <span className="muted">· {[...source.text].length.toLocaleString('ru-RU')} символов</span></summary>
      <p className="hint">{source.source} · снимок от {source.capturedAt}. Текст сохранён без сокращений и перевода.</p>
      <pre className="voice-source-text" tabIndex={0} aria-label={source.title}>{source.text}</pre>
    </details>)}
    <details className="voice-source">
      <summary>Как навык применяется к постам Threads</summary>
      <p className="hint">Модель использует принципы полного навыка, но готовит только запрошенные посты или ответы. Кампании, бюджеты и этапы согласования не добавляются. Цены, акции и примеры из плейбука не считаются актуальными фактами о продукте. Ваши настройки ниже дополняют базовые правила.</p>
      <p className="voice-adaptation">{CLIENT_VOICE}</p>
    </details>
    <p className="hint">Это сохранённая версия навыка от 19 октября 2026. Изменения исходного навыка подключаются отдельным обновлением студии.</p>
  </section>;
}
