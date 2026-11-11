"use client";

// How to build the iPhone Shortcut that sends Apple Health data, with every key it can use.
import { useState } from "react";
import { GROUPS, METRICS } from "@/lib/health/metrics";

const EXAMPLE = {
  date: "2026-11-10",
  steps: 8423,
  active_energy: 512,
  exercise_minutes: 34,
  workout_minutes: 45,
  heart_rate: [62, 75, 88, 71],
  resting_heart_rate: 58,
  hrv: 46,
  sleep_hours: 7.4,
  deep_sleep_hours: 1.1,
  weight_kg: 78.2,
  mindful_minutes: 10,
};

export function HealthShortcutGuide({ endpoint }: { endpoint: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="space-y-4 text-sm">
      <p className="text-muted">
        Build it one metric at a time. Start with steps, get it working end to end, then add more with the same pattern. (Search box = the bar at the
        bottom of the Shortcut editor.)
      </p>
      <ol className="ml-5 list-decimal space-y-2 text-muted">
        <li>
          <strong className="text-paper">Find Health Samples</strong>: Type <em>Steps</em>, Start Date <em>is today</em>, and set <em>Group by</em> to <em>Day</em> (so your
          iPhone and Watch aren&apos;t counted twice).
        </li>
        <li>
          Search <strong className="text-paper">Calculate Statistics</strong> and add it. Tap <em>Average</em> and change it to <em>Sum</em>.
        </li>
        <li>
          Search <strong className="text-paper">Set Variable</strong> and add it. Name the variable <code>steps</code>.
        </li>
        <li>
          Readings (resting heart rate, HRV, weight…): the same three actions, but with <em>Average</em> instead of Sum, no grouping, and the variable named after
          the metric (e.g. <code>resting_heart_rate</code>).
        </li>
        <li>
          At the end, search <strong className="text-paper">Get Contents of URL</strong>. Paste the URL below. Tap the arrow to show more: Method <em>POST</em>; Headers →
          Add → key <code>Authorization</code>, value <code>Bearer </code> followed by your token; Request Body <em>JSON</em> → Add new field → <em>Text</em>, key{" "}
          <code>date</code>, value: the <em>Current Date</em> variable (no formatting needed). Then one <em>Number</em> field per variable, key = its name.
        </li>
        <li>Tap ▶. It should answer &ldquo;Saved … health metric(s)&rdquo;. Compare the steps with the Health app the first time.</li>
        <li>
          <strong className="text-paper">Automation</strong> tab → <strong className="text-paper">+</strong> → <em>Time of Day</em>, daily, late evening (e.g. 23:30) →{" "}
          <em>Run Immediately</em> → run &ldquo;Life RPG&rdquo;.
        </li>
      </ol>
      <p className="text-xs text-muted">
        URL: <code className="break-all">{endpoint}</code>. Running it again the same day just updates that day. Values can be numbers or lists of numbers. Sleep and workouts need different actions: ask for help with those. Any other
        Apple Health type works too: give it a name with letters and _ (like <code>vitamin_c</code>) and it shows up under &ldquo;Other&rdquo;.
      </p>

      <details className="group">
        <summary className="cursor-pointer font-label text-sm font-extrabold tracking-widest text-volt uppercase">Every metric name ({METRICS.length})</summary>
        <div className="mt-3 grid gap-4 sm:grid-cols-2">
          {GROUPS.filter((g) => g.id !== "other").map((g) => (
            <div key={g.id}>
              <p className="mb-1 font-label text-xs font-extrabold tracking-widest text-muted uppercase">{g.label}</p>
              <ul className="space-y-0.5 text-xs">
                {METRICS.filter((m) => m.group === g.id).map((m) => (
                  <li key={m.id}>
                    <code className="text-paper">{m.id}</code> <span className="text-muted">· {m.label}{m.unit ? ` (${m.unit})` : ""}{m.xp ? " · XP" : ""}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <p className="mt-3 text-xs text-muted">
          Also accepted: <code>sleep_minutes</code>, <code>distance_m</code>, <code>distance_mi</code>, <code>weight_lb</code>, <code>water_l</code> (converted for you). Blood oxygen
          and body fat can be sent as 0.97 or 97.
        </p>
      </details>

      <div>
        <div className="mb-1 flex items-center gap-3">
          <span className="font-label text-xs font-extrabold tracking-widest text-muted uppercase">Example body</span>
          <button
            onClick={() => navigator.clipboard?.writeText(JSON.stringify(EXAMPLE, null, 2)).then(() => setCopied(true))}
            className="font-label text-xs font-extrabold tracking-widest text-volt uppercase hover:text-paper"
          >
            {copied ? "Copied ✓" : "Copy"}
          </button>
        </div>
        <pre className="overflow-x-auto bg-ink-3 p-3 text-xs">{JSON.stringify(EXAMPLE, null, 2)}</pre>
      </div>
    </div>
  );
}
