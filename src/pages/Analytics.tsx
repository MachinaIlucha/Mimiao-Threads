import { AnimatePresence } from "motion/react";
import { FollowersChart } from "./FollowersChart";
import { useState } from "react";
import { Download, RefreshCw, ArrowUpRight } from "lucide-react";
import type { Post, Metric } from "../../shared/types";
import { labels } from "../../shared/types";
import { useData, useAction, number, time } from "../api";
import { PageHeading, Empty, Busy, ErrorMessage } from "../components";
import { Editor } from "./editor/Editor";
export function Analytics() {
  const { data, error, isPending } = useData("/analytics"),
    action = useAction();
  const [selected, setSelected] = useState<Post>(),
    [window, setWindow] = useState("24h");
  const account = data?.account || [],
    latest = account[0],
    previous = account[1];
  const delta =
    latest?.followers != null && previous?.followers != null
      ? latest.followers - previous.followers
      : null;
  const metrics: Metric[] = data?.metrics || [],
    posts: Post[] = (data?.posts || []).filter((p: Post) => !p.root_id);
  const measured = posts
    .map((p) => ({
      post: p,
      metric: metrics.find(
        (m) =>
          m.post_id === p.id && m.checkpoint === window && m.source === "api",
      ),
      manual: metrics.find(
        (m) =>
          m.post_id === p.id &&
          m.source === "manual" &&
          m.checkpoint === window,
      ),
    }))
    .filter((p) => p.metric || p.manual)
    .sort((a, b) => (b.metric?.views || 0) - (a.metric?.views || 0));
  return (
    <>
      <PageHeading
        eyebrow="ОТ НАБЛЮДЕНИЙ К РЕШЕНИЯМ"
        title="Что приносит результат"
        description="Сравниваем посты одного возраста. Отделяем живые обсуждения от случайного охвата."
      >
        <a className="button" href="/api/export.csv">
          <Download size={16} /> CSV
        </a>
        <button
          disabled={action.isPending}
          onClick={() => action.mutate({ path: "/jobs/metrics" })}
        >
          <RefreshCw size={15} /> Обновить
        </button>
      </PageHeading>
      <ErrorMessage error={error || action.error} />
      {isPending ? (
        <Busy />
      ) : error ? null : (
        <>
          <div className="overview analytics-overview">
            <div>
              <span className="eyebrow">ПОДПИСЧИКИ АККАУНТА</span>
              <strong>{number(latest?.followers)}</strong>
              <p>
                {delta === null
                  ? "Нужны два замера"
                  : `${delta > 0 ? "+" : ""}${delta} между последними замерами`}
              </p>
            </div>
            <div>
              <span className="eyebrow">ПРОСМОТРЫ ПРОФИЛЯ · API</span>
              <strong>{number(latest?.profile_views)}</strong>
              <p>Окно 24 часа на момент последнего сбора</p>
            </div>
            <div>
              <span className="eyebrow">ИСТОРИЯ НАБЛЮДЕНИЙ</span>
              <strong>
                {account.length}
                <span> дней</span>
              </strong>
              <p>
                Последний замер:{" "}
                {latest ? time(latest.measured_at) : "ещё не получен"}
              </p>
            </div>
          </div>
          {account.some((a: any) => a.followers !== null) && (
            <FollowersChart account={account} />
          )}
          <section className="panel">
            <div className="section-bar">
              <h3>Публикации и замеры</h3>
              <div className="tabs">
                {["1h", "24h", "72h", "7d", "import", "manual"].map((v) => (
                  <button
                    className={window === v ? "selected" : ""}
                    key={v}
                    onClick={() => setWindow(v)}
                  >
                    {v === "import" ? "Импорт" : v === "manual" ? "Ручные" : v}
                  </button>
                ))}
              </div>
            </div>
            {!measured.length ? (
              <Empty title="Пока недостаточно измерений">
                После подключения импортируйте историю. Новые посты получат
                замеры через 1, 24, 72 часа и 7 дней. Исторические данные
                сохраняются отдельно.
              </Empty>
            ) : (
              <div className="table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>Пост</th>
                      <th>Просмотры</th>
                      <th>Ответы</th>
                      <th>Содержательные**</th>
                      <th>Подписки*</th>
                      <th>Профиль*</th>
                      <th>Возраст замера</th>
                    </tr>
                  </thead>
                  <tbody>
                    {measured.map(({ post: p, metric: m, manual }) => (
                      <tr key={p.id} onClick={() => setSelected(p)}>
                        <td>
                          <button className="table-post">
                            {p.text.slice(0, 105)}
                            {p.text.length > 105 ? "…" : ""}
                            <small>
                              {labels[p.category]} · {time(p.published_at)}
                            </small>
                          </button>
                        </td>
                        <td>{number(m?.views ?? manual?.views)}</td>
                        <td>{number(m?.replies)}</td>
                        <td>{number(p.meaningful_count)}</td>
                        <td>{number(manual?.follows)}</td>
                        <td>{number(manual?.profile_visits)}</td>
                        <td>
                          {m ? `${Math.round(m.age_hours)} ч` : "ручной"}
                          <ArrowUpRight size={13} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <p className="table-caption">
              * Ручные данные из Threads. ** Собранные и классифицированные
              ответы за всё время, не все возможные комментарии. «—» означает
              отсутствие данных. Нажмите на пост, чтобы добавить замер.
            </p>
          </section>
          <section className="cohorts">
            <h2>Какие рубрики работают</h2>
            <p className="muted">
              Только API-замеры в возрасте 24–28 часов. Медиана устойчивее к
              одному случайному всплеску.
            </p>
            {!data?.groups?.length ? (
              <p className="hint">
                Выводы появятся после накопления сопоставимых замеров.
              </p>
            ) : (
              <div className="panel table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>Рубрика</th>
                      <th>Постов</th>
                      <th>Медиана просмотров</th>
                      <th>Среднее ответов</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.groups.map((g: any) => (
                      <tr key={g.category}>
                        <td>{labels[g.category]}</td>
                        <td>
                          {g.count}
                          {g.count < 10 ? " · малая выборка" : ""}
                        </td>
                        <td>{number(g.median_views)}</td>
                        <td>
                          {g.average_replies === null
                            ? "—"
                            : Number(g.average_replies).toFixed(1)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
          <section>
            <div className="section-label">
              <h2>Недельные выводы</h2>
              <button
                disabled={action.isPending}
                onClick={() => action.mutate({ path: "/jobs/review" })}
              >
                Подготовить разбор
              </button>
            </div>
            {data?.reports?.map((r: any) => (
              <article className="panel report" key={r.week}>
                <span className="eyebrow">
                  НЕДЕЛЯ {String(r.week).slice(0, 10)}
                </span>
                {Object.entries({
                  observations: "Наблюдения",
                  tryNext: "Что проверить",
                  avoid: "Что стоит пересмотреть",
                  limitations: "Ограничения",
                }).map(([key, title]) => (
                  <div key={key}>
                    <h3>{title}</h3>
                    <ul>
                      {r.content[key]?.map((line: string) => (
                        <li key={line}>{line}</li>
                      ))}
                    </ul>
                  </div>
                ))}
              </article>
            ))}
            {!data?.reports?.length && (
              <p className="hint">
                Разбор готовится по понедельникам. Без данных система не должна
                делать выводы об эффективности.
              </p>
            )}
          </section>
          <section>
            <h2>Эксперименты частоты</h2>
            <p className="muted">
              После 28 дней сопоставимых данных: 28-дневное сравнение текущей
              частоты и +1 поста, максимум 8 в день. Рост — только при
              достаточных данных.
            </p>
            {data?.experiments?.map((e: any) => (
              <div className="panel report" key={e.id}>
                {String(e.starts_on).slice(0, 10)} —{" "}
                {String(e.ends_on).slice(0, 10)} · {e.base_count} /{" "}
                {e.base_count + 1} постов
                <p>
                  {e.status === "running"
                    ? "Идёт сбор данных"
                    : `Решение: ${e.result?.decision === "increase" ? "увеличить частоту" : e.result?.decision === "keep" ? "сохранить частоту" : "недостаточно данных"}`}
                </p>
              </div>
            ))}
          </section>
        </>
      )}
      <AnimatePresence>
        {selected && (
          <Editor
            key="editor"
            post={selected}
            onClose={() => setSelected(undefined)}
          />
        )}
      </AnimatePresence>
    </>
  );
}
