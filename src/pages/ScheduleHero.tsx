import {
  ArrowUpRight,
  ArrowRight,
  Check,
  Clock3,
  Radio,
  Sparkles,
} from "lucide-react";
import { Ambient } from "../visual";
import { time } from "../api";
import { Badge } from "../components";
import type { Post, Settings } from "../../shared/types";

export function ScheduleHero({
  posts,
  settings,
  ready,
  attention,
  open,
}: {
  posts: Post[];
  settings?: Settings;
  ready: number;
  attention: number;
  open: (post: Post | null) => void;
}) {
  const next = posts
    .filter(
      (p) =>
        !p.root_id &&
        p.status === "scheduled" &&
        p.scheduled_at &&
        new Date(p.scheduled_at).getTime() > Date.now(),
    )
    .sort((a, b) => a.scheduled_at!.localeCompare(b.scheduled_at!))[0];
  const target = settings?.dailyCount || 5;
  return (
    <section className="schedule-hero">
      <Ambient />
      <div className="hero-main">
        <span className="eyebrow">
          <span className="live-dot" /> ВАШ КОНТЕНТ, В СВОЁМ РИТМЕ
        </span>
        <h2>
          Сегодня — идея.
          <br />
          <span>Завтра — разговор.</span>
        </h2>
        <p>
          От первого наблюдения до публикации.
          <br />
          Всё важное — на одной линии.
        </p>
        <div className="schedule-rail">
          <div>
            <Radio size={17} />
            <strong>18:00</strong>
            <span>Исследование</span>
          </div>
          <i />
          <div>
            <Sparkles size={17} />
            <strong>19:00</strong>
            <span>План на завтра</span>
          </div>
          <i />
          <div>
            <ArrowUpRight size={17} />
            <strong>Завтра</strong>
            <span>Публикации</span>
          </div>
        </div>
        <small className="rail-caption">
          Ежедневное расписание · время Киева
        </small>
      </div>
      <div className="hero-side">
        <div className="readiness">
          <div>
            <span className="eyebrow">НА ЗАВТРА ГОТОВО</span>
            <strong>
              {ready}
              <span> / {target}</span>
            </strong>
          </div>
          <svg
            viewBox="0 0 80 80"
            aria-label={`Готово ${ready} из ${target} постов`}
          >
            <circle cx="40" cy="40" r="33" />
            <circle
              className="progress-ring"
              cx="40"
              cy="40"
              r="33"
              pathLength="100"
              strokeDasharray={`${Math.min(100, (ready / target) * 100)} 100`}
            />
            <text x="40" y="45" textAnchor="middle">
              {Math.round((ready / target) * 100)}%
            </text>
          </svg>
        </div>
        <button className="next-post" onClick={() => open(next || null)}>
          <span className="eyebrow">
            <Clock3 size={13} />{" "}
            {next ? "БЛИЖАЙШАЯ ПУБЛИКАЦИЯ" : "СЛЕДУЮЩИЙ ШАГ"}
            <ArrowUpRight size={16} />
          </span>
          {next ? (
            <>
              <strong>
                {time(next.scheduled_at, {
                  day: "numeric",
                  month: "short",
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </strong>
              <p>{next.text}</p>
              <Badge value={next.status} />
              {settings?.paused && <small>Ожидает снятия паузы</small>}
            </>
          ) : (
            <>
              <strong>Место для первой идеи</strong>
              <p>Создайте пост или подготовьте завтрашний план с DeepSeek.</p>
              <span className="amber">
                Открыть редактор <ArrowRight size={14} />
              </span>
            </>
          )}
        </button>
        <div className={`attention-line ${attention ? "needs-attention" : ""}`}>
          {attention ? <Clock3 size={15} /> : <Check size={15} />}{" "}
          {attention
            ? `${attention} публикаций ждут проверки`
            : "Нет публикаций с ошибками"}
        </div>
      </div>
    </section>
  );
}

export function ScheduleSummary({
  posts,
  attention,
  onReview,
  onCreate,
}: {
  posts: Post[];
  attention: number;
  onReview: () => void;
  onCreate: () => void;
}) {
  const drafts = posts.filter((p) => !p.root_id && p.status === "draft").length;
  const published = posts.filter(
    (p) => !p.root_id && p.status === "published",
  ).length;
  return (
    <aside className="schedule-summary panel">
      <span className="eyebrow">ПОД РУКОЙ</span>
      <h2>Пульс студии</h2>
      <div className="summary-stat">
        <span>Черновики</span>
        <strong>{drafts}</strong>
      </div>
      <div className="summary-stat">
        <span>Опубликовано</span>
        <strong>{published}</strong>
      </div>
      <button className="summary-stat" onClick={onReview}>
        <span>На проверке</span>
        <strong>
          {attention}
          <ArrowUpRight size={14} />
        </strong>
      </button>
      <div className="summary-note">
        <Clock3 size={17} />
        <p>
          Между постами — от 90 минут. У каждого текста есть время быть
          замеченным.
        </p>
      </div>
      <button className="summary-action" onClick={onCreate}>
        Записать идею <ArrowRight size={15} />
      </button>
    </aside>
  );
}
