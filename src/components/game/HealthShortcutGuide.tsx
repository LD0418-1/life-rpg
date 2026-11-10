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
      <ol className="ml-5 list-decimal space-y-2 text-muted">
        <li>
          Open <strong className="text-paper">Shortcuts</strong> → <strong className="text-paper">+</strong> → name it &ldquo;Life RPG&rdquo;.
        </li>
        <li>
          <strong className="text-paper">Totals</strong> (steps, distance, energy, flights, exercise, mindful minutes): add <strong className="text-paper">Find Health Samples</strong>,
          Type <em>Steps</em> (etc.), Start Date <em>is today</em>, <em>Group By Day</em>. Then <strong className="text-paper">Calculate Statistics</strong> → <em>Sum</em>.
        </li>
        <li>
          <strong className="text-paper">Readings</strong> (heart rate, resting heart rate, HRV, blood oxygen, weight…): <strong className="text-paper">Find Health Samples</strong>, Type,
          Start Date <em>is today</em>. Send the whole list as it is: Life RPG averages it and keeps the day&apos;s low and high.
        </li>
        <li>
          <strong className="text-paper">Sleep</strong>: Find Health Samples, Type <em>Sleep Analysis</em>, End Date <em>is today</em>, Value <em>is Asleep</em> (or Core / Deep /
          REM for the stages). <strong className="text-paper">Get Details of Health Samples</strong> → <em>Duration</em>, then Calculate Statistics → <em>Sum</em>. Send it as{" "}
          <code>sleep_minutes</code> or <code>sleep_hours</code>, whichever unit Shortcuts shows.
        </li>
        <li>
          <strong className="text-paper">Workouts</strong>: Find Workouts (today) → total duration → <code>workout_minutes</code>; running workouts only → <code>run_minutes</code>.
        </li>
        <li>
          Add <strong className="text-paper">Get Contents of URL</strong>: the URL below, Method <em>POST</em>, header <code>Authorization</code> = <code>Bearer </code>+ your token.
          Request Body <em>JSON</em>: <code>date</code> = Current Date formatted <code>yyyy-MM-dd</code>, then one field per metric, using the names in the table below.
        </li>
        <li>Run it once. It should answer &ldquo;Saved … health metric(s)&rdquo;. Compare one or two numbers with the Health app the first time.</li>
        <li>
          <strong className="text-paper">Automation</strong> tab → <strong className="text-paper">+</strong> → <em>Time of Day</em>, daily, late evening (e.g. 23:30) →{" "}
          <em>Run Immediately</em> → run &ldquo;Life RPG&rdquo;.
        </li>
      </ol>
      <p className="text-xs text-muted">
        URL: <code className="break-all">{endpoint}</code>. Running it again the same day just updates that day. Values can be numbers or lists of numbers. Any other
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
