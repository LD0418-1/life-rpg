"use client";

// The world map, drawn in code. Each region's buildings depend on its stage
// (0-5), so the island fills up as your domains level up. Colors come from
// the theme tokens, so the map follows the theme you pick.
import type { ReactNode } from "react";
import { REGIONS, type Region, stageFor } from "@/lib/game/world";

const INK = "var(--ink)";
const PAPER = "var(--paper)";
const ACCENT = "var(--crimson)";
const GOLD = "var(--volt)";
const STONE = "#4a4a55";

/** Where each region sits on the 1000 x 680 map. */
const PLACES: Record<string, { x: number; y: number }> = {
  body: { x: 250, y: 215 },
  mind: { x: 755, y: 200 },
  craft: { x: 500, y: 345 },
  social: { x: 265, y: 495 },
  spirit: { x: 735, y: 480 },
};

const ROADS: [string, string][] = [
  ["body", "craft"],
  ["mind", "craft"],
  ["social", "craft"],
  ["spirit", "craft"],
  ["body", "social"],
  ["mind", "spirit"],
];

// ---------- building blocks (local coords: ground is y = 40) ----------

function House({ x, w, h, roof = "peak", windows = 1 }: { x: number; w: number; h: number; roof?: "peak" | "flat" | "battle"; windows?: number }) {
  const top = 40 - h;
  const win = Array.from({ length: windows }, (_, i) => (
    <rect key={i} x={x - w / 2 + ((i + 1) * w) / (windows + 1) - 4} y={top + h * 0.35} width={8} height={10} fill={INK} />
  ));
  return (
    <g>
      <rect x={x - w / 2} y={top} width={w} height={h} fill={PAPER} stroke={INK} strokeWidth={3} />
      {win}
      {roof === "peak" && <polygon points={`${x - w / 2 - 6},${top} ${x},${top - w * 0.55} ${x + w / 2 + 6},${top}`} fill={ACCENT} stroke={INK} strokeWidth={3} strokeLinejoin="round" />}
      {roof === "battle" &&
        Array.from({ length: Math.max(2, Math.round(w / 14)) }, (_, i) => {
          const n = Math.max(2, Math.round(w / 14));
          return <rect key={i} x={x - w / 2 + (i * w) / n + 1} y={top - 9} width={w / n - 4} height={10} fill={PAPER} stroke={INK} strokeWidth={2.5} />;
        })}
    </g>
  );
}

function Tower({ x, h, w = 26, cap = "spire" }: { x: number; h: number; w?: number; cap?: "spire" | "dome" }) {
  const top = 40 - h;
  return (
    <g>
      <rect x={x - w / 2} y={top} width={w} height={h} fill={PAPER} stroke={INK} strokeWidth={3} />
      {Array.from({ length: Math.floor(h / 26) }, (_, i) => (
        <rect key={i} x={x - 3} y={top + 10 + i * 26} width={6} height={10} fill={INK} />
      ))}
      {cap === "spire" ? (
        <polygon points={`${x - w / 2 - 4},${top} ${x},${top - w * 1.3} ${x + w / 2 + 4},${top}`} fill={ACCENT} stroke={INK} strokeWidth={3} strokeLinejoin="round" />
      ) : (
        <path d={`M${x - w / 2 - 6} ${top} a${w / 2 + 6} ${w / 2 + 6} 0 0 1 ${w + 12} 0z`} fill={GOLD} stroke={INK} strokeWidth={3} />
      )}
    </g>
  );
}

function Flag({ x, y }: { x: number; y: number }) {
  return (
    <g>
      <line x1={x} y1={y} x2={x} y2={y - 30} stroke={INK} strokeWidth={3} />
      <polygon points={`${x},${y - 30} ${x + 22},${y - 24} ${x},${y - 17}`} fill={ACCENT} stroke={INK} strokeWidth={2} />
    </g>
  );
}

function Lantern({ x, y, lit }: { x: number; y: number; lit: boolean }) {
  return <rect x={x - 5} y={y} width={10} height={13} rx={3} fill={lit ? GOLD : PAPER} stroke={INK} strokeWidth={2} />;
}

function PagodaTier({ y, w }: { y: number; w: number }) {
  return (
    <g>
      <rect x={-w / 2 + 8} y={y - 18} width={w - 16} height={18} fill={PAPER} stroke={INK} strokeWidth={3} />
      <polygon points={`${-w / 2 - 6},${y - 16} ${w / 2 + 6},${y - 16} ${w / 2 - 10},${y - 30} ${-w / 2 + 10},${y - 30}`} fill={ACCENT} stroke={INK} strokeWidth={3} strokeLinejoin="round" />
    </g>
  );
}

function Glow() {
  return (
    <g aria-hidden>
      {/* rays fanning out above the building only, so neighbors don't collide */}
      {Array.from({ length: 7 }, (_, i) => {
        const a = Math.PI + (i / 6) * Math.PI;
        return (
          <line key={i} x1={Math.cos(a) * 62} y1={-24 + Math.sin(a) * 62} x2={Math.cos(a) * 82} y2={-24 + Math.sin(a) * 82} stroke={GOLD} strokeWidth={4} strokeLinecap="round" />
        );
      })}
    </g>
  );
}

// ---------- region art ----------

function IronPeaks({ stage }: { stage: number }) {
  const keepH = [0, 30, 58, 68, 88, 108][stage];
  return (
    <g>
      {stage === 5 && <Glow />}
      {/* mountains, always there */}
      <polygon points="-110,40 -62,-62 -14,40" fill={STONE} stroke={INK} strokeWidth={3} strokeLinejoin="round" />
      <polygon points="-79,-26 -62,-62 -45,-26 -55,-20 -62,-28 -70,-20" fill={PAPER} />
      <polygon points="20,40 72,-74 124,40" fill={STONE} stroke={INK} strokeWidth={3} strokeLinejoin="round" />
      <polygon points="54,-34 72,-74 90,-34 80,-28 72,-36 63,-28" fill={PAPER} />
      {stage === 0 ? (
        <g>
          <polygon points="-22,40 0,6 22,40" fill={ACCENT} stroke={INK} strokeWidth={3} strokeLinejoin="round" />
          <polygon points="30,40 36,26 42,40" fill={GOLD} stroke={INK} strokeWidth={2} />
        </g>
      ) : (
        <g>
          {stage >= 3 && <Tower x={-40} h={keepH * 0.75} w={22} />}
          {stage >= 3 && <Tower x={40} h={keepH * 0.75} w={22} />}
          <House x={0} w={stage >= 4 ? 64 : 48} h={keepH} roof={stage === 1 ? "peak" : "battle"} windows={stage >= 2 ? 2 : 1} />
          {stage >= 3 && <Flag x={0} y={40 - keepH - 9} />}
          {stage === 5 && <Tower x={0} h={keepH + 38} w={20} />}
        </g>
      )}
    </g>
  );
}

function ArchiveSpires({ stage }: { stage: number }) {
  if (stage === 0) {
    return (
      <g>
        {[-40, -6, 28].map((x, i) => (
          <rect key={x} x={x} y={28 - i * 2} width={26} height={9} rx={4} fill={PAPER} stroke={INK} strokeWidth={2.5} transform={`rotate(${i * 12 - 10} ${x + 13} 32)`} />
        ))}
      </g>
    );
  }
  if (stage === 1) return <House x={0} w={52} h={34} windows={2} />;
  const towers: { x: number; h: number }[] = [
    [],
    [],
    [{ x: 0, h: 92 }],
    [{ x: -22, h: 92 }, { x: 22, h: 104 }],
    [{ x: -46, h: 80 }, { x: 0, h: 118 }, { x: 46, h: 92 }],
    [{ x: -56, h: 84 }, { x: -18, h: 104 }, { x: 18, h: 130 }, { x: 56, h: 96 }],
  ][stage];
  return (
    <g>
      {stage === 5 && <Glow />}
      {stage >= 4 && <rect x={-50} y={-6} width={100} height={10} fill={PAPER} stroke={INK} strokeWidth={3} />}
      {towers.map((t, i) => (
        <Tower key={i} x={t.x} h={t.h} cap={stage === 5 && i === 2 ? "dome" : "spire"} />
      ))}
    </g>
  );
}

function WorkshopQuarter({ stage }: { stage: number }) {
  if (stage === 0) {
    return (
      <g stroke={INK} strokeWidth={3}>
        {[-48, -24, 0, 24, 48].map((x) => (
          <line key={x} x1={x} y1={40} x2={x} y2={20} />
        ))}
        <line x1={-52} y1={26} x2={52} y2={26} />
      </g>
    );
  }
  const smoke = (x: number, top: number) =>
    [0, 1, 2].map((i) => <circle key={i} cx={x + i * 9} cy={top - 12 - i * 13} r={6 + i * 2} fill={STONE} stroke={INK} strokeWidth={2} />);
  return (
    <g>
      {stage === 5 && <Glow />}
      {stage === 1 && <House x={0} w={44} h={26} />}
      {stage >= 2 && (
        <g>
          <rect x={20} y={stage >= 5 ? -58 : -30} width={14} height={stage >= 5 ? 98 : 70} fill={STONE} stroke={INK} strokeWidth={3} />
          {stage >= 3 && smoke(27, stage >= 5 ? -58 : -30)}
          <House x={-6} w={62} h={42} roof="peak" windows={2} />
        </g>
      )}
      {stage >= 3 && <House x={-62} w={38} h={30} />}
      {stage >= 4 && <House x={62} w={46} h={56} roof="battle" windows={2} />}
      {stage >= 4 && <Flag x={62} y={40 - 56 - 9} />}
      {stage === 5 && <rect x={-22} y={22} width={32} height={10} fill={GOLD} stroke={INK} strokeWidth={2} />}
    </g>
  );
}

function LanternSquare({ stage }: { stage: number }) {
  if (stage === 0) {
    return (
      <g stroke={INK} strokeWidth={3}>
        <rect x={-22} y={22} width={44} height={8} fill={PAPER} />
        <line x1={-16} y1={30} x2={-16} y2={40} />
        <line x1={16} y1={30} x2={16} y2={40} />
      </g>
    );
  }
  const houses = [
    [],
    [],
    [-40, 40],
    [-56, 0, 56],
    [-72, -24, 24, 72],
    [-84, -42, 0, 42, 84],
  ][stage];
  const lanterns = stage >= 3 ? [-60, -30, 0, 30, 60].slice(0, stage === 3 ? 3 : 5) : [];
  return (
    <g>
      {stage === 5 && <Glow />}
      {stage === 1 ? (
        <g>
          <rect x={-20} y={14} width={40} height={26} fill={PAPER} stroke={INK} strokeWidth={3} />
          <polygon points="-26,14 26,14 22,2 -22,2" fill={ACCENT} stroke={INK} strokeWidth={3} />
          <Lantern x={30} y={6} lit={false} />
        </g>
      ) : (
        houses.map((x, i) => <House key={x} x={x} w={34} h={28 + (i % 2) * 10} />)
      )}
      {lanterns.length > 0 && (
        <g>
          <path d={`M-80 -36 Q0 ${-12} 80 -36`} fill="none" stroke={INK} strokeWidth={2} />
          {lanterns.map((x) => (
            <Lantern key={x} x={x} y={-30 + Math.abs(x) * -0.12 + 10} lit={stage >= 4} />
          ))}
        </g>
      )}
      {stage >= 4 && <Flag x={-90} y={40} />}
      {stage >= 4 && <Flag x={90} y={40} />}
    </g>
  );
}

function StillLake({ stage }: { stage: number }) {
  const tiers = [0, 0, 1, 2, 3, 5][stage];
  return (
    <g>
      {stage === 5 && <Glow />}
      <ellipse cx={0} cy={36} rx={112} ry={30} fill={INK} stroke={PAPER} strokeWidth={2.5} />
      {[-60, 52].map((x) => (
        <path key={x} d={`M${x - 18} ${44} q9 -6 18 0 t18 0`} fill="none" stroke={STONE} strokeWidth={2.5} />
      ))}
      {stage === 0 && <path d="M-70 18 h40 M-20 10 h50 M20 22 h46" stroke={STONE} strokeWidth={4} strokeLinecap="round" />}
      {stage >= 1 && <ellipse cx={0} cy={36} rx={44} ry={11} fill={STONE} stroke={INK} strokeWidth={2.5} />}
      {stage === 1 && (
        <g>
          <rect x={-6} y={8} width={12} height={26} fill={STONE} stroke={INK} strokeWidth={2.5} />
          <rect x={-11} y={2} width={22} height={9} fill={STONE} stroke={INK} strokeWidth={2.5} />
          <rect x={-3} y={14} width={6} height={6} fill={GOLD} />
        </g>
      )}
      {Array.from({ length: tiers }, (_, i) => (
        <PagodaTier key={i} y={34 - i * 26} w={60 - i * 7} />
      ))}
      {stage >= 4 && (
        <g>
          <rect x={-96} y={2} width={6} height={36} fill={ACCENT} stroke={INK} strokeWidth={2} />
          <rect x={-70} y={2} width={6} height={36} fill={ACCENT} stroke={INK} strokeWidth={2} />
          <rect x={-102} y={-4} width={44} height={7} fill={ACCENT} stroke={INK} strokeWidth={2} />
        </g>
      )}
    </g>
  );
}

const ART: Record<string, (props: { stage: number }) => ReactNode> = {
  body: IronPeaks,
  mind: ArchiveSpires,
  craft: WorkshopQuarter,
  social: LanternSquare,
  spirit: StillLake,
};

export function WorldMap({
  levels,
  selected,
  onSelect,
}: {
  levels: Record<string, number>;
  selected: string | null;
  onSelect: (domain: string) => void;
}) {
  const label = (r: Region) => {
    const level = levels[r.domain] ?? 1;
    return `${r.name}, level ${level}: ${r.stages[stageFor(level)]}`;
  };

  return (
    <svg viewBox="0 0 1000 680" className="w-full select-none" role="group" aria-label="World map">
      <defs>
        <pattern id="sea-dots" width="14" height="14" patternUnits="userSpaceOnUse">
          <circle cx="7" cy="7" r="1.6" fill="var(--ink-3)" />
        </pattern>
        <pattern id="land-dots" width="10" height="10" patternUnits="userSpaceOnUse">
          <circle cx="5" cy="5" r="1.2" fill="var(--ink-3)" />
        </pattern>
      </defs>

      {/* sea */}
      <rect width="1000" height="680" fill="var(--ink)" />
      <rect width="1000" height="680" fill="url(#sea-dots)" />
      {[
        [80, 80],
        [880, 70],
        [930, 600],
        [60, 620],
        [520, 650],
      ].map(([x, y]) => (
        <path key={`${x}-${y}`} d={`M${x} ${y} q12 -8 24 0 t24 0 t24 0`} fill="none" stroke="var(--ink-3)" strokeWidth={3} />
      ))}

      {/* island with an offset accent shadow, like the panels */}
      <polygon
        points="132,152 330,82 520,122 700,72 902,162 944,342 886,532 704,632 464,612 264,652 98,532 66,342"
        fill={ACCENT}
        transform="translate(14 16)"
      />
      <polygon
        points="132,152 330,82 520,122 700,72 902,162 944,342 886,532 704,632 464,612 264,652 98,532 66,342"
        fill="var(--ink-2)"
        stroke={PAPER}
        strokeWidth={5}
        strokeLinejoin="round"
      />
      <polygon points="132,152 330,82 520,122 700,72 902,162 944,342 886,532 704,632 464,612 264,652 98,532 66,342" fill="url(#land-dots)" />

      {/* roads */}
      {ROADS.map(([a, b]) => (
        <line
          key={`${a}-${b}`}
          x1={PLACES[a].x}
          y1={PLACES[a].y + 40}
          x2={PLACES[b].x}
          y2={PLACES[b].y + 40}
          stroke="var(--ink-3)"
          strokeWidth={6}
          strokeDasharray="2 14"
          strokeLinecap="round"
        />
      ))}

      {/* regions */}
      {REGIONS.map((r) => {
        const level = levels[r.domain] ?? 1;
        const stage = stageFor(level);
        const Art = ART[r.domain];
        const p = PLACES[r.domain];
        const isSel = selected === r.domain;
        return (
          <g
            key={r.domain}
            transform={`translate(${p.x} ${p.y})`}
            role="button"
            tabIndex={0}
            aria-label={label(r)}
            aria-pressed={isSel}
            onClick={() => onSelect(r.domain)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onSelect(r.domain);
              }
            }}
            className="cursor-pointer outline-none"
          >
            {/* plot */}
            <ellipse cx={0} cy={44} rx={126} ry={36} fill="var(--ink-3)" stroke={isSel ? ACCENT : PAPER} strokeWidth={isSel ? 6 : 2.5} />
            <g opacity={stage === 0 ? 0.6 : 1} transform="translate(0 40) scale(1.2) translate(0 -40)">
              <Art stage={stage} />
            </g>
            {/* name banner */}
            <g transform="translate(0 94)">
              <polygon points="-120,-17 128,-17 120,17 -128,17" fill={isSel ? ACCENT : PAPER} stroke={INK} strokeWidth={3} />
              <text x={-22} y={8} textAnchor="middle" className="font-display" fontSize={r.name.length > 13 ? 19 : 22} fill={isSel ? PAPER : INK}>
                {r.name.toUpperCase()}
              </text>
              <polygon points="76,-13 120,-13 114,13 70,13" fill={INK} />
              <text x={95} y={7} textAnchor="middle" className="font-display" fontSize={17} fill={GOLD}>
                {level}
              </text>
            </g>
            {/* bigger hit area */}
            <rect x={-130} y={-120} width={260} height={230} fill="transparent" />
          </g>
        );
      })}
    </svg>
  );
}
