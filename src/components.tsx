import { motion } from "motion/react";
import type { ReactNode } from "react";
import { LoaderCircle, ArrowUpRight, Inbox } from "lucide-react";
import { labels } from "../shared/types";
export function Badge({ value }: { value: string }) {
  return (
    <span className={`badge ${value}`}>
      {labels[value] ||
        (
          {
            success: "Готово",
            error: "Ошибка",
            warning: "Внимание",
            new: "Новое",
            use: "В работу",
            later: "Позже",
            dismissed: "Не подходит",
            saved: "Сохранено",
            sent: "Отправлен",
            sending: "Отправляется",
            low: "Мало подтверждений",
            medium: "Средняя уверенность",
            high: "Подтверждено",
          } as Record<string, string>
        )[value] ||
        value}
    </span>
  );
}
export function Empty({
  title,
  children,
}: {
  title: string;
  children?: ReactNode;
}) {
  return (
    <div className="empty">
      <Inbox size={28} />
      <h3>{title}</h3>
      <p>{children}</p>
    </div>
  );
}
export function ErrorMessage({ error }: { error: unknown }) {
  return error ? (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="error"
      role="alert"
    >
      {error instanceof Error ? error.message : String(error)}
    </motion.div>
  ) : null;
}
export function Busy() {
  return (
    <div className="loading" role="status">
      <span>
        <LoaderCircle className="spin" size={18} /> Загружаем данные…
      </span>
      <div className="skeleton" />
      <div className="skeleton" />
      <div className="skeleton" />
    </div>
  );
}
export function External({
  href,
  children,
}: {
  href: string;
  children: ReactNode;
}) {
  let safe = false;
  try {
    safe = ["https:", "http:"].includes(new URL(href).protocol);
  } catch {}
  return safe ? (
    <a href={href} target="_blank" rel="noreferrer">
      {children}
      <ArrowUpRight size={13} />
    </a>
  ) : (
    <span>{children} · ссылка недоступна</span>
  );
}
export function PageHeading({
  eyebrow,
  title,
  description,
  children,
}: {
  eyebrow: string;
  title: string;
  description: string;
  children?: ReactNode;
}) {
  return (
    <header className="page-heading">
      <div>
        <span className="eyebrow">{eyebrow}</span>
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
      <div className="heading-actions">{children}</div>
    </header>
  );
}
