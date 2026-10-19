import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { MotionConfig, useReducedMotion } from "motion/react";
import { Sparkles, Moon } from "lucide-react";

const VisualContext = createContext({
  calm: false,
  preference: false,
  toggle: () => {},
});
export function VisualProvider({ children }: { children: ReactNode }) {
  const reduced = useReducedMotion();
  const [preference, setPreference] = useState(() => {
    try {
      return localStorage.getItem("mimiao-motion") === "calm";
    } catch {
      return false;
    }
  });
  const calm = !!reduced || preference;
  useEffect(() => {
    document.documentElement.dataset.motion = calm ? "calm" : "full";
  }, [calm]);
  function toggle() {
    setPreference((value) => {
      try {
        localStorage.setItem("mimiao-motion", value ? "full" : "calm");
      } catch {
        /* Browser storage can be disabled. */
      }
      return !value;
    });
  }
  return (
    <VisualContext value={{ calm, preference, toggle }}>
      <MotionConfig
        reducedMotion={calm ? "always" : "never"}
        transition={{ duration: calm ? 0 : 0.26 }}
      >
        {children}
      </MotionConfig>
    </VisualContext>
  );
}
export const useVisual = () => useContext(VisualContext);
export function MotionSwitch() {
  const { calm, preference, toggle } = useVisual();
  return (
    <button
      className="motion-switch"
      onClick={toggle}
      aria-label="Спокойные эффекты"
      aria-pressed={preference}
      title="Системная настройка уменьшения движения имеет приоритет"
    >
      {calm ? <Moon size={15} /> : <Sparkles size={15} />}
      <span>Эффекты: {calm ? "спокойные" : "полные"}</span>
    </button>
  );
}

/** Decorative only: no pointer state updates or motion on form controls. */
export function Ambient({ variant = "" }: { variant?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const { calm } = useVisual();
  useEffect(() => {
    const el = ref.current,
      host = el?.parentElement;
    if (!el || !host || calm) return;
    let visible = true,
      frame = 0;
    const active = () => {
      el.dataset.running = String(visible && !document.hidden);
    };
    const observer = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
      active();
    });
    observer.observe(el);
    document.addEventListener("visibilitychange", active);
    active();
    const move = (event: PointerEvent) => {
      if (event.pointerType !== "mouse" || !visible || document.hidden) return;
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const rect = host.getBoundingClientRect();
        el.style.setProperty(
          "--px",
          `${((event.clientX - rect.left) / rect.width) * 100}%`,
        );
        el.style.setProperty(
          "--py",
          `${((event.clientY - rect.top) / rect.height) * 100}%`,
        );
      });
    };
    host.addEventListener("pointermove", move);
    return () => {
      observer.disconnect();
      cancelAnimationFrame(frame);
      document.removeEventListener("visibilitychange", active);
      host.removeEventListener("pointermove", move);
    };
  }, [calm]);
  return (
    <div ref={ref} className={`ambient ${variant}`} aria-hidden="true">
      <div className="ambient-glow" />
      <div className="ambient-grid" />
      <svg
        className="light-thread"
        viewBox="0 0 900 400"
        preserveAspectRatio="none"
      >
        <path d="M-60 340 C180 340 80 55 340 130 S600 410 980 80" />
        <path
          className="thread-tracer"
          d="M-60 340 C180 340 80 55 340 130 S600 410 980 80"
        />
      </svg>
      {Array.from({ length: 9 }, (_, i) => (
        <i
          key={i}
          style={{
            left: `${12 + i * 10}%`,
            top: `${20 + ((i * 23) % 65)}%`,
            animationDelay: `${i * -0.8}s`,
          }}
        />
      ))}
    </div>
  );
}
