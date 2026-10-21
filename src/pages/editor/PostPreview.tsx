import {
  Heart,
  MessageCircle,
  Repeat2,
  Send,
  MoreHorizontal,
} from "lucide-react";
import { motion } from "motion/react";
import { DateTime } from "luxon";
import { useVisual } from "../../visual";

export function PostPreview({
  text,
  mediaIds,
  schedule,
}: {
  text: string;
  mediaIds: string[];
  schedule: string;
}) {
  const { calm } = useVisual();
  const scheduledTime = DateTime.fromISO(schedule, { zone: "Europe/Kyiv" });
  return (
    <aside className="post-preview">
      <div className="preview-heading">
        <span className="eyebrow">ВЗГЛЯД СО СТОРОНЫ</span>
        <h3>Так начнётся разговор.</h3>
        <p>Предпросмотр публикации</p>
      </div>
      <div className="threads-preview">
        <div className="preview-avatar">m.</div>
        <div className="preview-content">
          <div className="preview-author">
            <strong>mimiao.crm</strong>
            <span>сейчас</span>
            <MoreHorizontal size={18} />
          </div>
          <p className={text ? "" : "preview-placeholder"}>
            {text || "Ваша следующая история начинается с одной строки…"}
          </p>
          {mediaIds.length > 0 && (
            <div className="preview-photos">
              {mediaIds.map((id, i) => (
                <motion.img
                  layout={!calm}
                  key={id}
                  src={`/media/${id}`}
                  alt={`Предпросмотр фото ${i + 1}`}
                />
              ))}
            </div>
          )}
          <div className="preview-reactions" aria-hidden="true">
            <Heart />
            <MessageCircle />
            <Repeat2 />
            <Send />
          </div>
        </div>
      </div>
      <div className="preview-schedule">
        <span className="dot" />
        <span>
          {scheduledTime.isValid
            ? `${scheduledTime.setZone("Europe/Kyiv").setLocale("ru").toFormat("d MMMM · HH:mm")} по Киеву`
            : "Время публикации пока не выбрано"}
        </span>
      </div>
      <p className="hint">
        Финальное отображение зависит от Threads и устройства читателя.
      </p>
    </aside>
  );
}
