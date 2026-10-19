import { useId, useState } from "react";
import { motion } from "motion/react";
import { number } from "../api";
import { useVisual } from "../visual";

type Point = { day: string; followers: number | null };
export function FollowersChart({ account }: { account: Point[] }) {
  const points = account.slice(0, 30).reverse(),
    values = points.flatMap((p) => (p.followers === null ? [] : [p.followers]));
  const min = Math.min(...values),
    max = Math.max(...values);
  const [selected, setSelected] = useState<Point | null>(null);
  const { calm } = useVisual();
  const id = useId();
  return (
    <section className="panel chart-panel">
      <div className="section-label">
        <div>
          <span className="eyebrow">АУДИТОРИЯ В ДВИЖЕНИИ</span>
          <h3>Динамика подписчиков</h3>
        </div>
        <span className="chart-value" aria-live="polite">
          {selected
            ? `${String(selected.day).slice(0, 10)} · ${number(selected.followers)}`
            : "Последние 30 замеров"}
        </span>
      </div>
      <div className="chart-scale">
        <span>{number(max)}</span>
        <span>{number(min)}</span>
      </div>
      <div
        className="bar-chart"
        role="group"
        aria-label="Количество подписчиков по дням"
        aria-describedby={id}
      >
        {points.map((p, index) => (
          <button
            key={String(p.day)}
            aria-label={`${String(p.day).slice(0, 10)}: ${number(p.followers)} подписчиков`}
            onFocus={() => setSelected(p)}
            onBlur={() => setSelected(null)}
            onMouseEnter={() => setSelected(p)}
            onMouseLeave={() => setSelected(null)}
            onClick={() => setSelected(p)}
          >
            <motion.span
              initial={{ scaleY: calm ? 1 : 0 }}
              whileInView={{ scaleY: 1 }}
              viewport={{ once: true }}
              transition={{
                duration: calm ? 0 : 0.6,
                delay: calm ? 0 : index * 0.015,
              }}
              style={{
                height:
                  p.followers === null
                    ? 0
                    : `${15 + ((p.followers - min) / Math.max(1, max - min)) * 85}%`,
              }}
            />
            <small>{String(p.day).slice(8, 10)}</small>
          </button>
        ))}
      </div>
      <p id={id} className="hint">
        Высота относительно минимума за период. Прирост аккаунта не доказывает
        вклад отдельного поста.
      </p>
    </section>
  );
}
