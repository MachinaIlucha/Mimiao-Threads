import { createPortal } from "react-dom";
import { motion } from "motion/react";
import { useDialog } from "./useDialog";
import { PostPreview } from "./PostPreview";
import { useVisual } from "../../visual";
import { useState } from "react";
import { DateTime } from "luxon";
import {
  X,
  Upload,
  ArrowLeft,
  ArrowRight,
  Sparkles,
  Save,
  Trash2,
} from "lucide-react";
import type { Post, Media, Category } from "../../../shared/types";
import { labels } from "../../../shared/types";
import { api, useData, useAction, time } from "../../api";
import { Badge, ErrorMessage, External } from "../../components";
import { MetricEntry } from "./MetricEntry";
export function Editor({
  post,
  onClose,
}: {
  post: Post | null;
  onClose: () => void;
}) {
  const [text, setText] = useState(post?.text || ""),
    [alternative, setAlternative] = useState(post?.alternative || ""),
    [category, setCategory] = useState<Category>(post?.category || "teaching"),
    [topic, setTopic] = useState(post?.topic || ""),
    [reason, setReason] = useState(""),
    [mediaIds, setMediaIds] = useState(post?.media_ids || []),
    [schedule, setSchedule] = useState(
      post?.scheduled_at
        ? DateTime.fromISO(post.scheduled_at)
            .setZone("Europe/Kyiv")
            .toFormat("yyyy-MM-dd'T'HH:mm")
        : "",
    );
  const dialogRef = useDialog(onClose),
    { calm } = useVisual();
  const [preview, setPreview] = useState(false);
  const [providerId, setProviderId] = useState("");
  const [busy, setBusy] = useState(false),
    [error, setError] = useState<unknown>(),
    [showHistory, setShowHistory] = useState(false);
  const media = useData<Media[]>("/media"),
    action = useAction();
  const locked =
    !!post && ["published", "publishing", "unknown"].includes(post.status);
  async function save(status: "draft" | "scheduled" | "cancelled") {
    try {
      await action.mutateAsync({
        path: post ? `/posts/${post.id}` : "/posts",
        method: post ? "PUT" : "POST",
        body: {
          text,
          alternative,
          category,
          topic,
          reason,
          media_ids: mediaIds,
          scheduled_at: schedule
            ? DateTime.fromFormat(schedule, "yyyy-MM-dd'T'HH:mm", {
                zone: "Europe/Kyiv",
              })
                .toUTC()
                .toISO()
            : null,
          status,
          revision: post?.revision,
          sources: post?.sources || [],
          expires_at: post?.expires_at || null,
        },
      });
      onClose();
    } catch {}
  }
  async function upload(files: FileList | null) {
    if (!files) return;
    setBusy(true);
    setError(undefined);
    try {
      for (const file of Array.from(files)) {
        if (mediaIds.length + files.length > 20)
          throw new Error("Не больше 20 фотографий");
        const form = new FormData();
        form.append("photo", file);
        const item = await api<Media>("/media", "POST", form);
        setMediaIds((ids) => [...ids, item.id]);
      }
      await media.refetch();
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  }
  function move(index: number, delta: number) {
    setMediaIds((ids) => {
      const copy = [...ids];
      [copy[index], copy[index + delta]] = [copy[index + delta], copy[index]];
      return copy;
    });
  }
  return createPortal(
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="modal-backdrop"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <motion.section
        ref={dialogRef}
        initial={{ x: calm ? 0 : 60, opacity: 0 }}
        animate={{ x: 0, opacity: 1 }}
        exit={{ x: calm ? 0 : 60, opacity: 0 }}
        transition={{ type: "spring", duration: calm ? 0 : 0.35, bounce: 0.08 }}
        className="drawer"
        role="dialog"
        aria-modal="true"
        aria-label="Редактор публикации"
      >
        <div className="drawer-head">
          <div>
            <span className="eyebrow">
              {post ? "ПУБЛИКАЦИЯ" : "НОВАЯ ИДЕЯ"}
            </span>
            <h2>{locked ? "Просмотр поста" : "Редактор поста"}</h2>
          </div>
          <button
            aria-label="Закрыть редактор"
            className="icon-button"
            onClick={onClose}
          >
            <X />
          </button>
        </div>
        <button
          className="preview-toggle"
          aria-expanded={preview}
          onClick={() => setPreview(!preview)}
        >
          {preview ? "Вернуться к редактированию" : "Предпросмотр поста"}
        </button>
        <div className={`editor-workspace ${preview ? "show-preview" : ""}`}>
          <div className="drawer-body">
            {post && (
              <div className="inline">
                <Badge value={post.status} />
                <span className="muted">Версия {post.revision}</span>
                {post.permalink && (
                  <External href={post.permalink}>В Threads</External>
                )}
              </div>
            )}
            {post?.error && <div className="error">{post.error}</div>}
            <label>
              Текст поста
              <textarea
                className="post-textarea"
                rows={7}
                value={text}
                disabled={locked}
                onChange={(e) => setText(e.target.value)}
                placeholder="Про що сьогодні поговоримо?"
              />
            </label>
            <div className="text-tools">
              <span className={Array.from(text).length > 500 ? "red" : "muted"}>
                {Array.from(text).length} / 500 символов
              </span>
              {post && !locked && (
                <button
                  disabled={busy}
                  onClick={async () => {
                    setBusy(true);
                    try {
                      const result = await api(
                        `/posts/${post.id}/variant`,
                        "POST",
                      );
                      setAlternative(result.text);
                    } catch (e) {
                      setError(e);
                    } finally {
                      setBusy(false);
                    }
                  }}
                >
                  <Sparkles size={14} /> Другой вариант
                </button>
              )}
            </div>
            {alternative && (
              <div className="alternative">
                <span className="eyebrow">АЛЬТЕРНАТИВНЫЙ ЗАХОД</span>
                <p>{alternative}</p>
                {!locked && (
                  <button
                    onClick={() => {
                      setText(alternative);
                      setAlternative(text);
                    }}
                  >
                    Использовать этот текст ↗
                  </button>
                )}
              </div>
            )}
            <div className="field-grid">
              <label>
                Рубрика
                <select
                  value={category}
                  disabled={locked}
                  onChange={(e) => setCategory(e.target.value as Category)}
                >
                  {["teaching", "life", "founder", "product"].map((c) => (
                    <option key={c} value={c}>
                      {labels[c]}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Публикация · время Киева
                <input
                  type="datetime-local"
                  disabled={locked}
                  value={schedule}
                  onChange={(e) => setSchedule(e.target.value)}
                />
                <small>Любое будущее время, в том числе ночью.</small>
              </label>
            </div>
            <label>
              Тема
              <input
                disabled={locked}
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
                placeholder="Например, отмены занятий"
              />
            </label>
            <div className="section-label">
              <h3>
                Фотографии <span>{mediaIds.length} / 20</span>
              </h3>
              {!locked && (
                <label className="upload-button">
                  <Upload size={15} /> Добавить
                  <input
                    type="file"
                    multiple
                    accept="image/jpeg,image/png,image/webp"
                    disabled={busy}
                    onChange={(e) => void upload(e.target.files)}
                  />
                </label>
              )}
            </div>
            <div className="media-grid">
              {mediaIds.map((id, index) => (
                <motion.div layout={!calm} className="media-item" key={id}>
                  <img
                    src={`/media/${id}`}
                    alt={
                      media.data?.find((m) => m.id === id)?.alt ||
                      `Фото ${index + 1}`
                    }
                  />
                  <span className="media-number">{index + 1}</span>
                  {!locked && (
                    <div className="media-controls">
                      <button
                        disabled={index === 0}
                        aria-label="Фото назад"
                        onClick={() => move(index, -1)}
                      >
                        <ArrowLeft size={13} />
                      </button>
                      <button
                        disabled={index === mediaIds.length - 1}
                        aria-label="Фото вперёд"
                        onClick={() => move(index, 1)}
                      >
                        <ArrowRight size={13} />
                      </button>
                      <button
                        aria-label="Убрать фото"
                        onClick={() =>
                          setMediaIds((ids) => ids.filter((v) => v !== id))
                        }
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  )}
                </motion.div>
              ))}
            </div>
            {!mediaIds.length && (
              <p className="hint">
                Одно фото — отдельное изображение. Несколько — карусель в
                выбранном порядке.
              </p>
            )}
            {!locked &&
              media.data &&
              media.data.some((m) => !mediaIds.includes(m.id)) && (
                <details>
                  <summary>Выбрать из медиатеки</summary>
                  <div className="library">
                    {media.data
                      .filter((m) => !mediaIds.includes(m.id))
                      .map((m) => (
                        <button
                          disabled={mediaIds.length >= 20}
                          key={m.id}
                          onClick={() => setMediaIds((ids) => [...ids, m.id])}
                        >
                          <img src={`/media/${m.id}`} alt={m.filename} />
                        </button>
                      ))}
                  </div>
                </details>
              )}
            {post?.reason && (
              <div className="rationale">
                <span className="eyebrow">ПОЧЕМУ ЭТА ИДЕЯ</span>
                <p>{post.reason}</p>
              </div>
            )}
            {post?.sources?.length ? (
              <div className="source-list">
                {post.sources.map((url, i) => (
                  <External key={url} href={url}>
                    Источник {i + 1}
                  </External>
                ))}
              </div>
            ) : null}
            {!locked && (
              <label>
                Что меняем и почему
                <textarea
                  rows={2}
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="Например: слишком рекламно, хочу более живой вопрос"
                />
                <small>
                  Сохраним как обратную связь для следующих генераций.
                </small>
              </label>
            )}
            {post?.status === "unknown" && post.publication_method==='browser' && (
              <div className="rationale">
                <p>Проверьте профиль @mimiao.crm: пост мог уже появиться. Очередь остановлена, повторная отправка запрещена. Сверка ищет новый пост с тем же текстом и временем.</p>
                <button disabled={action.isPending} onClick={()=>action.mutate({path:'/jobs/reconcile'})}>Сверить с браузером</button>
              </div>
            )}
            {post?.status === "unknown" && post.publication_method!=='browser' && (
              <div className="rationale">
                <p>
                  Если пост уже появился в Threads, укажите его числовой API ID.
                  Система проверит аккаунт и текст без повторной отправки.
                </p>
                <input
                  aria-label="ID опубликованного поста"
                  value={providerId}
                  onChange={(e) => setProviderId(e.target.value)}
                />
                <button
                  disabled={!providerId || action.isPending}
                  onClick={async () => {
                    try {
                      await action.mutateAsync({
                        path: `/posts/${post.id}/resolve`,
                        body: { providerId },
                      });
                      onClose();
                    } catch {}
                  }}
                >
                  Подтвердить публикацию
                </button>
              </div>
            )}
            {post?.status === "published" && <MetricEntry postId={post.id} />}{" "}
            {post && (
              <>
                <button
                  className="text-button"
                  onClick={() => setShowHistory(!showHistory)}
                >
                  История правок и отправки {showHistory ? "↑" : "↓"}
                </button>
                {showHistory && <History id={post.id} />}
              </>
            )}
            <ErrorMessage error={error || action.error} />
          </div>
          <PostPreview text={text} mediaIds={mediaIds} schedule={schedule} />
        </div>
        <div className="drawer-footer">
          {locked ? (
            <button onClick={onClose}>Закрыть</button>
          ) : (
            <>
              <button
                disabled={busy || action.isPending}
                onClick={() => void save("draft")}
              >
                <Save size={15} /> Черновик
              </button>
              {post && (
                <button
                  className="danger-quiet"
                  disabled={action.isPending}
                  onClick={() => void save("cancelled")}
                >
                  Отменить
                </button>
              )}
              <button
                className="primary"
                disabled={busy || action.isPending}
                onClick={() => void save("scheduled")}
              >
                В очередь →
              </button>
            </>
          )}
        </div>
      </motion.section>
    </motion.div>,
    document.body,
  );
}
function History({ id }: { id: string }) {
  const { data, error } = useData(`/posts/${id}/history`);
  return (
    <div className="history">
      <ErrorMessage error={error} />
      {data?.revisions.map((r: any) => (
        <article key={r.id}>
          <strong>
            Версия {r.revision} · {time(r.created_at)}
          </strong>
          <p>{r.snapshot.text}</p>
          <small>{r.reason || "Без пояснения"}</small>
        </article>
      ))}
      {data?.attempts.map((a: any) => (
        <article key={a.id}>
          <strong>
            {a.phase} · {time(a.started_at)}
          </strong>
          <p>{a.error || "Попытка сохранена в журнале"}</p>
        </article>
      ))}
      {data && !data.revisions.length && !data.attempts.length && (
        <p className="muted">Изменений и попыток отправки пока нет.</p>
      )}
    </div>
  );
}
