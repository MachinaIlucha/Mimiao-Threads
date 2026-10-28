// Explicit maintenance commands; never invoked by the worker or startup.
import { sql, rows, pool } from '../server/db.js';
import { settings, event } from '../server/services/state.js';
import { prepareDay } from '../server/services/generation.js';
import { reconcile } from '../server/services/publishing.js';
import { collectBrowserMetrics } from '../server/services/analytics.js';

try {
 const command=process.argv[2];
 if(command==='regenerate'){
  const day=process.argv[3];if(!day||!/^\d{4}-\d{2}-\d{2}$/.test(day))throw new Error('Explicit YYYY-MM-DD required');
  const current=await settings();
  const preferred=current.preferred.filter(p=>!/^План 26\.10|^Мікс на день:|^Корисні матеріали|^25\.10 оновлено/.test(p));
  preferred.push('Оновлення 28.10: тест трьох постів на день о 10:00, 16:00, 21:00 Київ. Один готовий шаблон, одне конкретне питання, одне інше корисне спостереження. Це гіпотеза, не обіцянка охоплення.');
  preferred.push('Не повторювати вже опубліковані сценарії про заміну викладача, перенесення заняття, усні домовленості про ціну, «не зрозумів» та дату відкладеної оплати. Нові теми перевіряти за повним текстом історії.');
  preferred.push('Шаблон передачі заявки мав 187 переглядів, 5 відвідувань профілю та 1 підписку за приблизно два дні. Це накопичувальні ручні спостереження, не доказ причинності або порівняння за 24 години.');
  await event('settings','info','Владелец запросил исправление и перегенерацию. Сохранены предыдущие настройки ритма.',{dailyCount:current.dailyCount,adaptive:current.adaptive,preferred:current.preferred});
  await rows(sql`UPDATE settings SET value=value||${JSON.stringify({dailyCount:3,adaptive:false,preferred})}::jsonb,updated_at=now() WHERE id=1`);
  console.log(JSON.stringify(await prepareDay(day,{regenerate:true})));
 }else if(command==='reconcile'){
  await reconcile();console.log('Reconciliation complete; unresolved sends were not retried.');
 }else if(command==='metrics'){
  await collectBrowserMetrics();console.log('Browser measurement batch complete.');
 }else throw new Error('Use regenerate YYYY-MM-DD, reconcile, or metrics');
}finally{await pool.end();}
