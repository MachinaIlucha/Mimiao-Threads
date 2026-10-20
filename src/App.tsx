import { useState, useEffect, useRef, lazy, Suspense } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Ambient, MotionSwitch, useVisual } from "./visual";
import {
  CalendarDays,
  LayoutDashboard,
  Lightbulb,
  TrendingUp,
  MessageCircle,
  SlidersHorizontal,
  Plug,
  LogOut,
  Pause,
  Play,
  Menu,
  Radio,
} from "lucide-react";
import { api, setCsrf, useData, useAction, time } from "./api";
import { Busy, ErrorMessage } from "./components";
const Queue = lazy(() =>
  import("./pages/Queue").then((module) => ({ default: module.Queue })),
);
const Research = lazy(() =>
  import("./pages/Research").then((module) => ({ default: module.Research })),
);
const Analytics = lazy(() =>
  import("./pages/Analytics").then((module) => ({ default: module.Analytics })),
);
const Discussions = lazy(() =>
  import("./pages/Discussions").then((module) => ({
    default: module.Discussions,
  })),
);
const SettingsPage = lazy(() =>
  import("./pages/Settings").then((module) => ({
    default: module.SettingsPage,
  })),
);
const Connections = lazy(() =>
  import("./pages/Connections").then((module) => ({
    default: module.Connections,
  })),
);
import type { Settings } from "../shared/types";
const navigation = [
  ["today", "Рабочий стол", LayoutDashboard],
  ["calendar", "Контент-план", CalendarDays],
  ["trends", "Что обсуждают", Radio],
  ["ideas", "Банк идей", Lightbulb],
  ["analytics", "Результаты", TrendingUp],
  ["discussions", "Обсуждения", MessageCircle],
  ["voice", "Голос и знания", SlidersHorizontal],
  ["connections", "Подключения", Plug],
] as const;
export function App() {
  const session = useData<{ authenticated: boolean; csrf?: string }>(
    "/auth/session",
  );
  const [password, setPassword] = useState(""),
    [error, setError] = useState<unknown>(),
    [pending, setPending] = useState(false);
  if (session.isPending) return <Busy />;
  if (session.error) return <ErrorMessage error={session.error} />;
  if (!session.data?.authenticated)
    return (
      <main className="login">
        <div className="login-brand">
          <Ambient variant="login-ambient" />
          <div className="brand-mark">m.</div>
          <span>MIMIAO / THREADS STUDIO</span>
          <h1>
            Хорошие разговоры
            <br />
            начинаются здесь.
          </h1>
          <p>Идеи, публикации и результаты — в одном рабочем пространстве.</p>
          <div className="login-art">
            <span>01 / ИССЛЕДОВАТЬ</span>
            <span>02 / СОЗДАВАТЬ</span>
            <span>03 / РАСТИ</span>
          </div>
        </div>
        <form
          className="login-form"
          onSubmit={async (e) => {
            e.preventDefault();
            setPending(true);
            try {
              const data = await api("/auth/login", "POST", { password });
              setCsrf(data.csrf);
              await session.refetch();
            } catch (e) {
              setError(e);
            } finally {
              setPending(false);
            }
          }}
        >
          <span className="eyebrow">ЛИЧНЫЙ КАБИНЕТ</span>
          <h2>С возвращением</h2>
          <p>Войдите, чтобы подготовить следующий день Mimiao.</p>
          <label>
            Пароль владельца
            <input
              type="password"
              required
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </label>
          <ErrorMessage error={error} />
          <button className="primary" disabled={pending}>
            {pending ? "Входим…" : "Открыть студию →"}
          </button>
          <small>
            Личное пространство для идей, которые становятся разговорами.
          </small>
        </form>
      </main>
    );
  setCsrf(session.data.csrf || "");
  return <Studio />;
}
function Studio() {
  const [page, setPage] = useState(
      new URLSearchParams(location.search).get("page") || "today",
    ),
    [menu, setMenu] = useState(false);
  const { calm } = useVisual();
  const sidebarRef = useRef<HTMLElement>(null),
    menuRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const media = matchMedia("(max-width: 700px)");
    const sync = () => {
      if (sidebarRef.current) sidebarRef.current.inert = media.matches && !menu;
      if (!media.matches && menu) setMenu(false);
    };
    sync();
    media.addEventListener("change", sync);
    return () => media.removeEventListener("change", sync);
  }, [menu]);
  useEffect(() => {
    if (!menu) return;
    const main = document.querySelector<HTMLElement>(".main");
    if (main) main.inert = true;
    const sidebar = sidebarRef.current;
    sidebar?.querySelector<HTMLButtonElement>("button")?.focus();
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setMenu(false);
      }
      if (e.key === "Tab" && sidebar) {
        const items = Array.from(
          sidebar.querySelectorAll<HTMLElement>(
            "button:not([disabled]),a[href]",
          ),
        );
        const first = items[0],
          last = items.at(-1);
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last?.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first?.focus();
        }
      }
    };
    document.addEventListener("keydown", key);
    return () => {
      if (main) main.inert = false;
      document.removeEventListener("keydown", key);
      menuRef.current?.focus();
    };
  }, [menu]);
  const { data: settings } = useData<Settings>("/settings");
  const integrations = useData("/integrations");
  const threadsReady = integrations.data?.publishingMode === "browser"
    ? integrations.data?.browser?.state === "ready"
    : !!integrations.data?.threads;
  const action = useAction();
  function navigate(next: string) {
    setPage(next);
    setMenu(false);
    history.replaceState(null, "", `?page=${next}`);
  }
  return (
    <div className="studio">
      <a className="skip-link" href="#main-content">
        К содержимому
      </a>
      {menu && (
        <button
          className="nav-backdrop"
          aria-label="Закрыть меню"
          onClick={() => setMenu(false)}
        />
      )}
      <aside ref={sidebarRef} className={`sidebar ${menu ? "open" : ""}`}>
        <button className="brand" onClick={() => navigate("today")}>
          <span className="brand-mark">m.</span>
          <span>
            mimiao<small>THREADS STUDIO</small>
          </span>
        </button>
        <div className="workspace">
          <span className="avatar">m</span>
          <div>
            @mimiao.crm<small>Ваше пространство</small>
          </div>
          <span
            className={`dot ${threadsReady ? "green" : ""}`}
          />
        </div>
        <nav aria-label="Разделы студии">
          {navigation.map(([id, label, Icon]) => (
            <button
              key={id}
              aria-current={page === id ? "page" : undefined}
              className={page === id ? "active" : ""}
              onClick={() => navigate(id)}
            >
              {page === id && (
                <motion.span
                  className="nav-active"
                  layoutId="active-navigation"
                  transition={{ duration: calm ? 0 : 0.3 }}
                />
              )}
              <Icon size={19} />
              <span>{label}</span>
              {id === "today" && <span className="nav-mini">01</span>}
            </button>
          ))}
        </nav>
        <div className="sidebar-foot">
          <div className="orbit-mark" aria-hidden="true">
            ✳
          </div>
          <span className="eyebrow">РИТМ СТУДИИ</span>
          <strong>Сегодня готовим завтра</strong>
          <p>
            18:00 · исследование
            <br />
            19:00 · план публикаций
          </p>
          <small>Время Киева · Europe/Kyiv</small>
        </div>
        <MotionSwitch />
        <button
          className="logout"
          onClick={() => action.mutate({ path: "/auth/logout" })}
        >
          <LogOut size={16} /> Выйти
        </button>
      </aside>
      <div className="main">
        <div className="topbar">
          <button
            ref={menuRef}
            aria-expanded={menu}
            className="mobile-menu"
            aria-label="Меню"
            onClick={() => setMenu(!menu)}
          >
            <Menu />
          </button>
          <div className="breadcrumb">
            Студия <span>/</span> {navigation.find((n) => n[0] === page)?.[1]}
          </div>
          <div className="topbar-right">
            <span className="kyiv">
              {time(new Date().toISOString(), {
                day: "numeric",
                month: "long",
              })}{" "}
              · Киев
            </span>
            <button
              className={`pause-button ${settings?.paused ? "paused" : ""}`}
              disabled={!settings || action.isPending}
              onClick={() =>
                action.mutate({
                  path: "/pause",
                  body: { paused: !settings?.paused },
                })
              }
            >
              {settings?.paused ? <Play size={14} /> : <Pause size={14} />}{" "}
              {settings?.paused ? "Снять паузу" : "Пауза"}
            </button>
          </div>
        </div>
        <main id="main-content" tabIndex={-1} className="content">
          <ErrorMessage error={action.error} />
          {integrations.data && (!integrations.data.deepseek || !threadsReady) && (
            <div className="setup-strip">
              <span>
                <Plug size={16} /> {integrations.data.publishingMode === "browser" && integrations.data.deepseek
                  ? "Завершите вход в браузере Threads и проверьте подключение."
                  : "Подключите DeepSeek и Threads для автоматической работы."}
              </span>
              <button onClick={() => navigate("connections")}>
                Настроить →
              </button>
            </div>
          )}
          {settings?.paused && (
            <div className="pause-notice">
              Автопубликация на паузе. Исследование и подготовка черновиков
              продолжаются.
            </div>
          )}
          <Suspense fallback={<Busy />}>
            <AnimatePresence mode="wait" initial={false}>
              <motion.div
                key={page}
                className="page-view"
                initial={{ opacity: 0, y: calm ? 0 : 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: calm ? 0 : -6 }}
                transition={{ duration: calm ? 0 : 0.22 }}
              >
                {(page === "today" || page === "calendar") && (
                  <Queue calendar={page === "calendar"} />
                )}{" "}
                {(page === "trends" || page === "ideas") && (
                  <Research mode={page} />
                )}{" "}
                {page === "analytics" && <Analytics />}
                {page === "discussions" && <Discussions />}
                {page === "voice" && <SettingsPage />}
                {page === "connections" && <Connections />}
              </motion.div>
            </AnimatePresence>
          </Suspense>
        </main>
        <footer>
          Сначала полезный разговор. Потом — цифры.{" "}
          <span>Mimiao Threads Studio</span>
        </footer>
      </div>
    </div>
  );
}
