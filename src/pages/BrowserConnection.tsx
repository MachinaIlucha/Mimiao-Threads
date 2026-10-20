import { Monitor,CheckCircle2,AlertCircle,RefreshCw } from 'lucide-react';
import { time,useAction } from '../api';
import { ErrorMessage } from '../components';
export function BrowserConnection({state}:{state:any}){
 const action=useAction();
 const labels:Record<string,string>={ready:'Готов к публикации',login_required:'Нужен вход в Threads',starting:'Браузер запускается',offline:'Worker недоступен',attention:'Нужна проверка',error:'Ошибка браузера'};
 return <section className="panel connection-card">
  <div className="section-label"><Monitor size={24}/>{state?.state==='ready'?<CheckCircle2 className="green-text"/>:<AlertCircle className="muted"/>}</div>
  <h2>Threads через браузер</h2><p>{labels[state?.state]||'Ожидаем браузер'}</p>
  <p className="hint">{state?.message||'Worker откроет отдельный браузер для @mimiao.crm.'}</p>
  {state?.checked_at&&<p className="hint">Проверено: {time(state.checked_at)}</p>}
  <button disabled={action.isPending} onClick={()=>action.mutate({path:'/jobs/browser-check'})}><RefreshCw size={15}/>Проверить вход</button>
  <ErrorMessage error={action.error}/>
  <p className="hint">Тексты и фотографии публикуются по расписанию. После входа проверьте состояние и снимите общую паузу. При ошибке очередь останавливается; неизвестный результат не отправляется повторно.</p>
  <details><summary>Войти в браузер сервера</summary>
   <p>Браузер доступен только через защищённый SSH-туннель. Запустите на своём компьютере:</p>
   <code>ssh -N -L 6080:127.0.0.1:6080 threads@173.242.59.9</code>
   <p>Откройте <a href="http://127.0.0.1:6080/vnc.html" target="_blank" rel="noreferrer">окно браузера</a>, нажмите Connect и введите пароль удалённого окна. Войдите в @mimiao.crm, затем нажмите «Проверить вход» здесь.</p>
   <p className="hint">Пароль окна хранится отдельно на VPS. Пароль Threads и коды вводятся только на странице Threads. Сессия сохраняется после перезапуска.</p>
  </details>
  <p className="hint">Без подключения API автоматическая статистика, импорт истории и ответы недоступны. Метрики можно заносить вручную. Изменения интерфейса Threads могут потребовать обновления бота.</p>
 </section>;
}
