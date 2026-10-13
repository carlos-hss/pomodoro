"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type Phase = "foco" | "pausa";

// Durations are kept in minutes; the timer itself works in seconds.
type Durations = Record<Phase, number>;

const DEFAULT_DURATIONS: Durations = {
  foco: 25,
  pausa: 5,
};

const LIMITS: Record<Phase, [min: number, max: number]> = {
  foco: [1, 180],
  pausa: [1, 60],
};

const LABEL: Record<Phase, string> = {
  foco: "Foco",
  pausa: "Pausa",
};

const todayKey = () => `pomodoro:${new Date().toISOString().slice(0, 10)}`;
const DURATIONS_KEY = "pomodoro:duracoes";

function clampMinutes(phase: Phase, value: unknown) {
  if (value === null || value === undefined || value === "") return DEFAULT_DURATIONS[phase];
  const n = Math.round(Number(value));
  if (!Number.isFinite(n)) return DEFAULT_DURATIONS[phase];
  const [min, max] = LIMITS[phase];
  return Math.min(max, Math.max(min, n));
}

function readDurations(): Durations {
  try {
    const saved = JSON.parse(localStorage.getItem(DURATIONS_KEY) ?? "null");
    return { foco: clampMinutes("foco", saved?.foco), pausa: clampMinutes("pausa", saved?.pausa) };
  } catch {
    return DEFAULT_DURATIONS;
  }
}

function writeDurations(d: Durations) {
  try {
    localStorage.setItem(DURATIONS_KEY, JSON.stringify(d));
  } catch {}
}

function readCount() {
  try {
    return Number(localStorage.getItem(todayKey())) || 0;
  } catch {
    return 0;
  }
}

function writeCount(n: number) {
  try {
    localStorage.setItem(todayKey(), String(n));
  } catch {}
}

function format(seconds: number) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

// Two soft bell strikes, made with WebAudio so there's no audio file to ship.
function chime() {
  try {
    const ctx = new AudioContext();
    [0, 0.35].forEach((delay, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = i === 0 ? 880 : 660;
      const t = ctx.currentTime + delay;
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.exponentialRampToValueAtTime(0.3, t + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 1.4);
      osc.connect(gain).connect(ctx.destination);
      osc.start(t);
      osc.stop(t + 1.5);
    });
  } catch {}
}

function notify(next: Phase, minutes: number) {
  if (typeof Notification === "undefined" || Notification.permission !== "granted") return;
  new Notification(next === "pausa" ? "Hora da pausa" : "De volta ao foco", {
    body: next === "pausa" ? `${minutes} minutos para respirar.` : `Mais ${minutes} minutos.`,
  });
}

function Settings({
  durations,
  onSave,
  onClose,
}: {
  durations: Durations;
  onSave: (d: Durations) => void;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState({ foco: String(durations.foco), pausa: String(durations.pausa) });

  return (
    <form
      className="settings"
      aria-label="Ajustes de duração"
      onSubmit={(e) => {
        e.preventDefault();
        onSave({ foco: clampMinutes("foco", draft.foco), pausa: clampMinutes("pausa", draft.pausa) });
      }}
      onKeyDown={(e) => {
        if (e.key === "Escape") onClose();
      }}
    >
      {(["foco", "pausa"] as const).map((p, i) => (
        <label key={p}>
          <span>{LABEL[p]}</span>
          <input
            type="number"
            inputMode="numeric"
            min={LIMITS[p][0]}
            max={LIMITS[p][1]}
            step={1}
            required
            autoFocus={i === 0}
            value={draft[p]}
            onChange={(e) => setDraft((d) => ({ ...d, [p]: e.target.value }))}
          />
          <span className="unit">min</span>
        </label>
      ))}
      <div className="settings-actions">
        <button type="submit" className="primary">
          Salvar
        </button>
        <button type="button" onClick={onClose}>
          Cancelar
        </button>
      </div>
    </form>
  );
}

export default function Pomodoro() {
  const [durations, setDurations] = useState<Durations>(DEFAULT_DURATIONS);
  const [phase, setPhase] = useState<Phase>("foco");
  // Length of the phase on screen, fixed when it starts so editing the
  // settings mid-phase doesn't make the fill jump.
  const [total, setTotal] = useState(DEFAULT_DURATIONS.foco * 60);
  const [remaining, setRemaining] = useState(DEFAULT_DURATIONS.foco * 60);
  const [running, setRunning] = useState(false);
  const [count, setCount] = useState(0);
  const [focused, setFocused] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const endAt = useRef<number | null>(null);
  const settingsButton = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    setCount(readCount());
    const saved = readDurations();
    setDurations(saved);
    setTotal(saved.foco * 60);
    setRemaining(saved.foco * 60);
  }, []);

  const switchTo = useCallback(
    (next: Phase, keepRunning: boolean) => {
      const seconds = durations[next] * 60;
      setPhase(next);
      setTotal(seconds);
      setRemaining(seconds);
      endAt.current = keepRunning ? Date.now() + seconds * 1000 : null;
      setRunning(keepRunning);
    },
    [durations],
  );

  const finishPhase = useCallback(() => {
    const next: Phase = phase === "foco" ? "pausa" : "foco";
    if (phase === "foco") {
      const n = readCount() + 1;
      writeCount(n);
      setCount(n);
    }
    chime();
    notify(next, durations[next]);
    switchTo(next, true);
  }, [phase, durations, switchTo]);

  // Count down against a wall-clock deadline so background-tab throttling can't drift it.
  useEffect(() => {
    if (!running) return;
    const tick = () => {
      if (endAt.current === null) return;
      const left = Math.max(0, Math.round((endAt.current - Date.now()) / 1000));
      setRemaining(left);
      if (left === 0) finishPhase();
    };
    tick();
    const id = setInterval(tick, 250);
    return () => clearInterval(id);
  }, [running, finishPhase]);

  useEffect(() => {
    document.title = `${format(remaining)} · ${LABEL[phase]}`;
  }, [remaining, phase]);

  const toggle = useCallback(() => {
    if (running) {
      endAt.current = null;
      setRunning(false);
      return;
    }
    if (typeof Notification !== "undefined" && Notification.permission === "default") {
      Notification.requestPermission();
    }
    endAt.current = Date.now() + remaining * 1000;
    setRunning(true);
  }, [running, remaining]);

  const reset = useCallback(() => switchTo(phase, false), [phase, switchTo]);
  const skip = useCallback(
    () => switchTo(phase === "foco" ? "pausa" : "foco", false),
    [phase, switchTo],
  );

  const openSettings = useCallback(() => setSettingsOpen(true), []);
  const closeSettings = useCallback(() => {
    setSettingsOpen(false);
    settingsButton.current?.focus();
  }, []);

  const saveSettings = useCallback(
    (next: Durations) => {
      writeDurations(next);
      setDurations(next);
      // A phase that hasn't started yet picks up the new length right away;
      // one in progress keeps its length and the change applies from the next phase.
      if (!running && remaining === total) {
        setTotal(next[phase] * 60);
        setRemaining(next[phase] * 60);
      }
      closeSettings();
    },
    [running, remaining, total, phase, closeSettings],
  );

  useEffect(() => {
    if (settingsOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.code === "Space") {
        e.preventDefault();
        toggle();
      } else if (e.key === "r" || e.key === "R") reset();
      else if (e.key === "p" || e.key === "P") skip();
      else if (e.key === "a" || e.key === "A") {
        e.preventDefault();
        openSettings();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [settingsOpen, toggle, reset, skip, openSettings]);

  const elapsed = 1 - remaining / total;
  const isFresh = remaining === total && !running;
  const primary = running ? "Pausar" : isFresh ? "Começar" : "Continuar";

  // The screen is drawn twice: once on the light ground, once on the colored fill.
  // The fill layer is clipped from the top as time passes, so the color drains
  // downward and the numerals change color exactly where the level crosses them.
  const face = (ghost: boolean) => (
    <div className="face">
      <header className="top">
        <span className="phase">{LABEL[phase]}</span>
        <span className="tally" aria-label={`${count} pomodoros concluídos hoje`}>
          {Array.from({ length: Math.min(count, 12) }, (_, i) => (
            <i key={i} />
          ))}
          {count > 12 && <span className="more">+{count - 12}</span>}
          {count === 0 && <span className="none">Nenhum pomodoro hoje</span>}
        </span>
      </header>

      <div className="clock" role={ghost ? undefined : "timer"} aria-live="off">
        {format(remaining)}
      </div>

      <nav className="controls">
        {(
          [
            ["toggle", primary, toggle, "Espaço"],
            ["reset", "Reiniciar", reset, "R"],
            ["skip", phase === "foco" ? "Pular para pausa" : "Pular para foco", skip, "P"],
            ["settings", "Ajustes", openSettings, "A"],
          ] as const
        ).map(([id, label, action, key]) => (
          <button
            key={id}
            ref={!ghost && id === "settings" ? settingsButton : undefined}
            type="button"
            className={`${id === "toggle" ? "primary" : ""} ${ghost && focused === id ? "is-focused" : ""}`}
            onClick={ghost ? undefined : action}
            onFocus={ghost ? undefined : () => setFocused(id)}
            onBlur={ghost ? undefined : () => setFocused(null)}
            tabIndex={ghost ? -1 : 0}
            aria-expanded={!ghost && id === "settings" ? settingsOpen : undefined}
            aria-keyshortcuts={ghost ? undefined : key === "Espaço" ? "Space" : key}
          >
            {label}
            <kbd>{key}</kbd>
          </button>
        ))}
      </nav>
    </div>
  );

  return (
    <main className={`stage ${phase}`}>
      <div className="layer ground">{face(false)}</div>
      <div
        className="layer fill"
        aria-hidden="true"
        style={{ clipPath: `inset(${(elapsed * 100).toFixed(3)}% 0 0 0)` }}
      >
        {face(true)}
      </div>
      {settingsOpen && (
        <Settings durations={durations} onSave={saveSettings} onClose={closeSettings} />
      )}
    </main>
  );
}
