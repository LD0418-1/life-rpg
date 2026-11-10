"use client";

// Theme (dark / light / device) and sound on / off, saved on this device.
import { type Appearance, setAppearance, setSoundEnabled, usePrefs } from "@/lib/prefs";
import { sounds } from "@/lib/sound";

const APPEARANCES: { id: Appearance; label: string; hint: string }[] = [
  { id: "dark", label: "Dark", hint: "Ink and crimson" },
  { id: "light", label: "Light", hint: "Paper and crimson" },
  { id: "auto", label: "Device", hint: "Follows your device setting" },
];
const NEXT: Record<Appearance, Appearance> = { dark: "light", light: "auto", auto: "dark" };

function ThemeIcon({ a }: { a: Appearance }) {
  const common = { fill: "none", stroke: "currentColor", strokeWidth: 2.2 };
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5 shrink-0" aria-hidden>
      {a === "dark" && <path {...common} d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z" />}
      {a === "light" && (
        <g {...common}>
          <circle cx="12" cy="12" r="4" />
          <path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1 7 17M17 7l2.1-2.1" />
        </g>
      )}
      {a === "auto" && (
        <g {...common}>
          <rect x="3" y="4" width="18" height="12" />
          <path d="M8 20h8M12 16v4M12 4v12" />
        </g>
      )}
    </svg>
  );
}

function SoundIcon({ on }: { on: boolean }) {
  const common = { fill: "none", stroke: "currentColor", strokeWidth: 2.2 };
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5 shrink-0" aria-hidden>
      <path {...common} d="M4 9h4l5-4v14l-5-4H4z" />
      {on ? <path {...common} d="M16.5 8.5a5 5 0 0 1 0 7M19 6a8.5 8.5 0 0 1 0 12" /> : <path {...common} d="M16 9l5 6M21 9l-5 6" />}
    </svg>
  );
}

/** Two small buttons for the sidebar and the phone "More" sheet. */
export function PrefsButtons({ className = "" }: { className?: string }) {
  const { appearance, sound } = usePrefs();
  const label = APPEARANCES.find((a) => a.id === appearance)!.label;
  return (
    <div className={`flex items-center gap-1 ${className}`}>
      <button
        onClick={() => setAppearance(NEXT[appearance])}
        aria-label={`Theme: ${label}. Change theme`}
        title={`Theme: ${label}`}
        className="flex items-center gap-2 px-2 py-1 hover:text-paper"
      >
        <ThemeIcon a={appearance} />
        <span>{label}</span>
      </button>
      <button
        onClick={() => {
          setSoundEnabled(!sound);
          if (!sound) setTimeout(sounds.xp, 0);
        }}
        aria-pressed={sound}
        aria-label={sound ? "Sound on. Turn sound off" : "Sound off. Turn sound on"}
        title={sound ? "Sound on" : "Sound off"}
        className="flex items-center gap-2 px-2 py-1 hover:text-paper"
      >
        <SoundIcon on={sound} />
        <span>{sound ? "Sound" : "Muted"}</span>
      </button>
    </div>
  );
}

/** The full version for the Settings page. */
export function PrefsPanel() {
  const { appearance, sound } = usePrefs();
  return (
    <div className="space-y-6">
      <fieldset>
        <legend className="mb-2 font-label text-sm font-extrabold tracking-widest text-muted uppercase">Theme</legend>
        <div className="grid grid-cols-3 gap-3">
          {APPEARANCES.map((a) => (
            <label
              key={a.id}
              className="skew-box flex cursor-pointer items-center gap-2 bg-ink-3 px-4 py-2 has-[:checked]:bg-paper has-[:checked]:text-ink has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-volt"
            >
              <input type="radio" name="appearance" value={a.id} checked={appearance === a.id} onChange={() => setAppearance(a.id)} className="sr-only" />
              <ThemeIcon a={a.id} />
              <span className="font-label font-extrabold tracking-wider uppercase">{a.label}</span>
            </label>
          ))}
        </div>
        <p className="mt-2 text-xs text-muted">{APPEARANCES.find((a) => a.id === appearance)!.hint}. Saved on this device only.</p>
      </fieldset>
      <label className="flex cursor-pointer items-center gap-3">
        <input
          type="checkbox"
          checked={sound}
          onChange={(e) => {
            setSoundEnabled(e.target.checked);
            if (e.target.checked) setTimeout(sounds.levelUp, 0);
          }}
          className="h-4 w-4 accent-[var(--crimson)]"
        />
        <span>
          <span className="block font-label font-extrabold tracking-wider uppercase">Sound effects</span>
          <span className="block text-xs text-muted">Short sounds for XP, level-ups, quests and trophies. Saved on this device only.</span>
        </span>
      </label>
    </div>
  );
}
