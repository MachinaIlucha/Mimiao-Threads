import { motion, AnimatePresence } from "motion/react";
import { ScheduleHero, ScheduleSummary } from "./ScheduleHero";
import { useVisual } from "../visual";
import { useEffect, useState } from "react";
import { DateTime } from "luxon";
import { Plus, Sparkles, Image, ArrowRight } from "lucide-react";
import type { Post, Settings } from "../../shared/types";
import { labels } from "../../shared/types";
import { useData, time, dayKey } from "../api";
import { usePrepareDay } from "./usePrepareDay";
import { Badge, Busy, Empty, ErrorMessage, PageHeading } from "../components";
import { Editor } from "./editor/Editor";
export function Queue({ calendar }: { calendar: boolean }) {
  const { calm } = useVisual();
  const posts = useData<Post[]>("/posts"),
    settings = useData<Settings>("/settings");
  const [tab, setTab] = useState("tomorrow"),
    [date, setDate] = useState(
      DateTime.now().setZone("Europe/Kyiv").plus({ days: 1 }).toISODate()!,
    ),
    [selected, setSelected] = useState<Post | null | undefined>();
  const today = DateTime.now().setZone("Europe/Kyiv").toISODate()!,
    tomorrow = DateTime.now()
      .setZone("Europe/Kyiv")
      .plus({ days: 1 })
      .toISODate()!;
  const prepareToday = usePrepareDay(today), prepareTomorrow = usePrepareDay(tomorrow);
  const [activePreparationDay, setActivePreparationDay] = useState(tomorrow);
  useEffect(() => setActivePreparationDay(tomorrow), [today, tomorrow]);
  const targetDay = activePreparationDay === today ? today : tomorrow;
  const prepare = targetDay === today ? prepareToday : prepareTomorrow;
  const preparing = prepareToday.loading || prepareToday.busy || prepareTomorrow.loading || prepareTomorrow.busy;
  const targetLabel = time(targetDay + "T12:00:00Z", { day: "numeric", month: "long" });
  const list = (posts.data || [])
    .filter(
      (p) =>
        !p.root_id && (tab === "all" || p.status !== "cancelled") &&
        (tab === "drafts"
          ? ["draft", "blocked", "unknown", "missed"].includes(p.status)
          : tab === "all"
            ? true
            : dayKey(p.scheduled_at || p.published_at || p.created_at) ===
              (calendar ? date : tab === "today" ? today : tomorrow)),
    )
    .sort((a, b) =>
      (a.scheduled_at || a.created_at).localeCompare(
        b.scheduled_at || b.created_at,
      ),
    );
  const tomorrowCount = (posts.data || []).filter(
    (p) =>
      !p.root_id &&
      p.scheduled_at &&
      dayKey(p.scheduled_at) === tomorrow &&
      p.status === "scheduled",
  ).length;
  const attention = (posts.data || []).filter(
    (p) => !p.root_id && ["blocked", "unknown", "missed"].includes(p.status),
  ).length;
  return (
    <>
      <PageHeading
        eyebrow={calendar ? "РЕДАКЦИОННЫЙ КАЛЕНДАРЬ" : "ВАШ ЕЖЕДНЕВНЫЙ ОБЗОР"}
        title={calendar ? "Контент-план" : "У каждого поста есть завтра."}
        description="Проверьте идеи, добавьте фотографии и оставьте остальное расписанию."
      >
        <button onClick={() => setSelected(null)}>
          <Plus size={16} /> Новый пост
        </button>
        {[
          { day: today, label: "сегодня", hook: prepareToday },
          { day: tomorrow, label: "завтра", hook: prepareTomorrow },
        ].map(({ day, label, hook }) => (
          <button
            key={day}
            className="primary"
            disabled={preparing}
            onClick={() => {
              setActivePreparationDay(day);
              setTab(calendar ? "tomorrow" : day === today ? "today" : "tomorrow");
              setDate(day);
              hook.prepare(true);
            }}
          >
            <Sparkles size={16} /> {hook.busy ? `Готовим на ${label}…`
              : hook.state === "ready" || hook.state === "failed" || hook.count > 0
                ? `Перегенерировать на ${label}` : `Подготовить ${label}`}
          </button>
        ))}
      </PageHeading>
      <p className="hint">При перегенерации заменяются неопубликованные посты выбранного дня. Старые версии сохраняются; опубликованные посты остаются.</p>
      <ErrorMessage error={prepare.error} />
      {["queued", "generating", "ready"].includes(prepare.state) && (
        <p role="status" aria-live="polite" className="success-note">
          {prepare.state === "queued" ? `Задание на ${targetLabel} в очереди. Ждём запуска подготовки.`
            : prepare.state === "generating" ? `DeepSeek готовит посты на ${targetLabel}. Результат появится автоматически.`
            : `План на ${targetLabel} подготовлен. Постов: ${prepare.count}. Проверьте тексты и время публикаций ниже.`}
        </p>
      )}
      {!calendar && !posts.isPending && !posts.error && (
        <ScheduleHero
          posts={posts.data || []}
          settings={settings.data}
          ready={tomorrowCount}
          attention={attention}
          open={setSelected}
        />
      )}
      <div className="queue-layout">
        <section className="panel queue-panel">
          <div className="section-bar">
            <div className="tabs">
              {[
                ["tomorrow", calendar ? "По дате" : "Завтра"],
                ...(!calendar ? [["today", "Сегодня"]] : []),
                ["drafts", "Проверить"],
                ["all", "Все посты"],
              ].map(([id, label]) => (
                <button
                  key={id}
                  className={tab === id ? "selected" : ""}
                  onClick={() => setTab(id)}
                >
                  {label}
                </button>
              ))}
            </div>
            {calendar ? (
              <input
                aria-label="Дата плана"
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
              />
            ) : (
              <span className="muted">
                {time(`${tab === "today" ? today : tomorrow}T12:00:00Z`, {
                  day: "numeric",
                  month: "long",
                })}
              </span>
            )}
          </div>
          {posts.isPending ? (
            <Busy />
          ) : posts.error ? (
            <ErrorMessage error={posts.error} />
          ) : !list.length ? (
            <Empty
              title={
                tab === "drafts"
                  ? "Всё в порядке"
                  : "Здесь начинается следующий день"
              }
            >
              Подготовьте план через DeepSeek или создайте первый пост вручную.
              Здесь появятся тексты, время и фотографии.
            </Empty>
          ) : (
            <motion.div
              key={`${tab}-${date}`}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="timeline"
            >
              {list.map((p, index) => (
                <motion.button
                  initial={{ opacity: 0, y: calm ? 0 : 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{
                    duration: calm ? 0 : 0.25,
                    delay: calm ? 0 : Math.min(index, 6) * 0.035,
                  }}
                  className="post-row"
                  key={p.id}
                  onClick={() => setSelected(p)}
                >
                  <div className="post-time">
                    {time(p.scheduled_at || p.published_at, {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                    <span>
                      {time(p.scheduled_at || p.published_at, {
                        day: "numeric",
                        month: "short",
                      })}
                    </span>
                  </div>
                  <div className="post-line">
                    <span />
                  </div>
                  <div className="post-content">
                    <div className="post-meta">
                      <span>{labels[p.category]}</span>
                      <Badge value={p.status} />
                    </div>
                    <p>{p.text || "Новый черновик"}</p>
                    <div className="post-thumbnails">
                      {p.media_ids.slice(0, 3).map((id, i) => (
                        <img
                          key={id}
                          src={`/media/${id}`}
                          alt={`Фото ${i + 1}`}
                          loading="lazy"
                        />
                      ))}
                    </div>
                    <div className="post-foot">
                      <span>{p.topic || "Без темы"}</span>
                      {p.media_ids.length > 0 && (
                        <span>
                          <Image size={14} />
                          {p.media_ids.length} фото
                        </span>
                      )}
                      {p.generated && (
                        <span>
                          <Sparkles size={12} /> DeepSeek
                        </span>
                      )}
                    </div>
                    {p.error && <small className="red">{p.error}</small>}
                  </div>
                  <ArrowRight size={16} className="row-arrow" />
                </motion.button>
              ))}
            </motion.div>
          )}
        </section>
        <ScheduleSummary
          posts={posts.data || []}
          attention={attention}
          onReview={() => setTab("drafts")}
          onCreate={() => setSelected(null)}
        />
      </div>
      <AnimatePresence>
        {selected !== undefined && (
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
