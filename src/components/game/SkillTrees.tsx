"use client";

import { useEffect, useState } from "react";
import { Panel } from "@/components/ui/Panel";
import { SlashButton } from "@/components/ui/SlashButton";
import { gameConfig } from "@/lib/game/config";
import { domainGlyph } from "@/lib/game/format";
import { DEFAULT_SKILL_XP, type Skill, deleteBlocker, layoutTree, treeNames, unlockBlocker } from "@/lib/game/skills";
import { useGame } from "./GameProvider";

const COL = 184;
const NODE_W = 164;
const ROW = 140;
const NODE_H = 104;
const PAD = 12;

const fieldClass = "w-full bg-ink-3 px-3 py-2 text-paper outline-none focus:ring-2 focus:ring-crimson";
const labelClass = "mb-1 block font-label text-sm font-extrabold tracking-widest text-muted uppercase";

type FormState = { mode: "tree" } | { mode: "child"; parent: Skill } | null;

function SkillForm({ form, onDone }: { form: NonNullable<FormState>; onDone: (created?: Skill) => void }) {
  const { createSkill } = useGame();
  const isTree = form.mode === "tree";
  const [tree, setTree] = useState("");
  const [domain, setDomain] = useState(isTree ? gameConfig.domains[2].id : form.parent.domain);
  const [name, setName] = useState("");
  const [requirement, setRequirement] = useState("");
  const [xp, setXp] = useState(DEFAULT_SKILL_XP);
  const [saving, setSaving] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    const created = await createSkill({
      tree: isTree ? tree : form.parent.tree,
      name,
      requirement,
      domain,
      parentId: isTree ? null : form.parent.id,
      xpReward: xp,
    });
    setSaving(false);
    if (created) onDone(created);
  };

  return (
    <form onSubmit={submit} className="space-y-4 border-l-2 border-crimson pl-4">
      <p className="font-label text-sm font-extrabold tracking-widest uppercase">
        {isTree ? "New skill tree" : <>New skill after <span className="text-crimson">{form.parent.name}</span></>}
      </p>
      {isTree && (
        <div className="grid gap-4 sm:grid-cols-[1fr_10rem]">
          <div>
            <label htmlFor="skill-tree" className={labelClass}>Tree</label>
            <input id="skill-tree" required maxLength={40} value={tree} onChange={(e) => setTree(e.target.value)} placeholder="Guitar" className={fieldClass} />
          </div>
          <div>
            <label htmlFor="skill-domain" className={labelClass}>Domain</label>
            <select id="skill-domain" value={domain} onChange={(e) => setDomain(e.target.value)} className={fieldClass}>
              {gameConfig.domains.map((d) => (
                <option key={d.id} value={d.id}>{d.label}</option>
              ))}
            </select>
          </div>
        </div>
      )}
      <div className="grid gap-4 sm:grid-cols-[1fr_8rem]">
        <div>
          <label htmlFor="skill-name" className={labelClass}>{isTree ? "First skill" : "Skill"}</label>
          <input id="skill-name" required maxLength={120} value={name} onChange={(e) => setName(e.target.value)} placeholder={isTree ? "Hold it right" : "Barre chords"} className={fieldClass} />
        </div>
        <div>
          <label htmlFor="skill-xp" className={labelClass}>XP reward</label>
          <input id="skill-xp" type="number" min={0} max={5000} value={xp} onChange={(e) => setXp(Number(e.target.value))} className={fieldClass} />
        </div>
      </div>
      <div>
        <label htmlFor="skill-req" className={labelClass}>Milestone · how you know you&apos;ve got it</label>
        <input id="skill-req" maxLength={200} value={requirement} onChange={(e) => setRequirement(e.target.value)} placeholder="Play an F chord cleanly 10 times in a row" className={fieldClass} />
      </div>
      <div className="flex gap-3">
        <SlashButton type="submit" disabled={saving}>{saving ? "Saving…" : isTree ? "Plant tree" : "Add skill"}</SlashButton>
        <SlashButton type="button" variant="ghost" onClick={() => onDone()}>Cancel</SlashButton>
      </div>
    </form>
  );
}

function TreeCanvas({ skills, selected, onSelect }: { skills: Skill[]; selected: string | null; onSelect: (id: string) => void }) {
  const { floatersFor } = useGame();
  const { nodes, width, depth } = layoutTree(skills);
  const w = width * COL + PAD * 2 - (COL - NODE_W);
  const h = depth * ROW + PAD * 2 - (ROW - NODE_H);
  const pos = (n: { x: number; depth: number }) => ({ left: PAD + n.x * COL, top: PAD + n.depth * ROW });
  const byId = new Map(nodes.map((n) => [n.id, n]));

  return (
    <div className="-mx-5 overflow-x-auto px-5 pb-2">
      <div className="relative mx-auto" style={{ width: w, height: h }}>
        <svg className="absolute inset-0" width={w} height={h} aria-hidden>
          {nodes.map((n) => {
            const parent = n.parentId ? byId.get(n.parentId) : null;
            if (!parent) return null;
            const a = pos(parent);
            const b = pos(n);
            const x1 = a.left + NODE_W / 2;
            const y1 = a.top + NODE_H;
            const x2 = b.left + NODE_W / 2;
            const y2 = b.top;
            const mid = (y1 + y2) / 2;
            return (
              <path
                key={n.id}
                d={`M${x1} ${y1} V${mid} H${x2} V${y2}`}
                fill="none"
                stroke={parent.unlockedAt ? "var(--crimson)" : "var(--ink-3)"}
                strokeWidth={parent.unlockedAt ? 3 : 2}
              />
            );
          })}
        </svg>
        {nodes.map((n) => {
          const ready = !n.unlockedAt && unlockBlocker(skills, n.id) === null;
          const state = n.unlockedAt ? "unlocked" : ready ? "ready" : "locked";
          return (
            <div key={n.id} className="absolute" style={{ ...pos(n), width: NODE_W, height: NODE_H }}>
              <button
                onClick={() => onSelect(n.id)}
                aria-pressed={selected === n.id}
                aria-label={`${n.name}: ${state}`}
                className={`slash-panel flex h-full w-full flex-col items-start p-2.5 text-left transition-transform hover:-translate-y-0.5 ${
                  state === "unlocked" ? "bg-crimson text-paper" : state === "ready" ? "border-2 border-paper bg-ink-2 text-paper" : "bg-ink-3 text-muted"
                } ${selected === n.id ? "outline-3 outline-offset-2 outline-volt" : ""}`}
              >
                <span className="font-label text-[11px] font-extrabold tracking-widest uppercase opacity-80">
                  {state === "unlocked" ? "Unlocked" : state === "ready" ? "Ready" : "Locked"} · +{n.xpReward}
                </span>
                <span className="mt-0.5 line-clamp-2 font-display text-lg leading-tight uppercase">{n.name}</span>
                {n.requirement && <span className="mt-auto line-clamp-2 text-[11px] leading-snug opacity-80">{n.requirement}</span>}
              </button>
              {floatersFor(n.id)}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function SkillTrees() {
  const { data, canEdit, unlockSkill, deleteSkill, isBusy } = useGame();
  const trees = treeNames(data.skills);
  // Open on the tree you've invested most in.
  const favorite = [...trees].sort(
    (a, b) => data.skills.filter((s) => s.tree === b && s.unlockedAt).length - data.skills.filter((s) => s.tree === a && s.unlockedAt).length,
  )[0];
  const [tree, setTree] = useState<string | null>(favorite ?? null);
  const [selected, setSelected] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(null);

  // Keep a valid tree selected as trees are added or emptied.
  useEffect(() => {
    if (!tree || !trees.includes(tree)) setTree(favorite ?? null);
  }, [tree, trees, favorite]);

  const skills = data.skills.filter((s) => s.tree === tree);
  const sel = skills.find((s) => s.id === selected) ?? null;
  const unlockedCount = skills.filter((s) => s.unlockedAt).length;

  return (
    <Panel title="Skill trees" kicker={tree ? `${tree} · ${unlockedCount}/${skills.length} unlocked` : "Real skills, step by step"}>
      <div className="mb-5 flex flex-wrap gap-2">
        {trees.map((t) => (
          <button
            key={t}
            onClick={() => {
              setTree(t);
              setSelected(null);
              setForm(null);
            }}
            aria-pressed={t === tree}
            className={`skew-box px-4 py-1 font-label font-extrabold tracking-wider uppercase ${t === tree ? "bg-paper text-ink" : "bg-ink-3 text-muted hover:text-paper"}`}
          >
            {domainGlyph(data.skills.find((s) => s.tree === t)?.domain ?? "")} · {t}
          </button>
        ))}
        {canEdit && (
          <button onClick={() => setForm({ mode: "tree" })} className="skew-box bg-crimson px-4 py-1 font-label font-extrabold tracking-wider uppercase hover:bg-paper hover:text-ink">
            + New tree
          </button>
        )}
      </div>

      {form?.mode === "tree" && (
        <div className="mb-6">
          <SkillForm
            form={form}
            onDone={(created) => {
              setForm(null);
              if (created) {
                setTree(created.tree);
                setSelected(created.id);
              }
            }}
          />
        </div>
      )}

      {trees.length === 0 ? (
        <p className="text-sm text-muted">
          {canEdit
            ? "Plant a tree for a real skill you're learning (guitar, cooking, a language). Each skill is a concrete milestone, and unlocking it pays XP. Skills further down need the one above them first."
            : "No skill trees yet."}
        </p>
      ) : (
        <>
          <TreeCanvas skills={skills} selected={selected} onSelect={(id) => setSelected(id === selected ? null : id)} />
          <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
            <li className="flex items-center gap-1.5"><span className="h-3 w-3 bg-crimson" /> unlocked</li>
            <li className="flex items-center gap-1.5"><span className="h-3 w-3 border-2 border-paper" /> ready to unlock</li>
            <li className="flex items-center gap-1.5"><span className="h-3 w-3 bg-ink-3" /> locked</li>
            <li>Tap a skill for details.</li>
          </ul>
        </>
      )}

      {sel && (
        <div className="mt-6 border-t border-ink-3 pt-5">
          <p className="font-label text-xs font-extrabold tracking-widest text-muted uppercase">
            {sel.unlockedAt ? `Unlocked ${new Date(sel.unlockedAt).toLocaleDateString()}` : unlockBlocker(skills, sel.id) ?? "Ready to unlock"}
          </p>
          <h3 className="font-display text-3xl uppercase">{sel.name}</h3>
          {sel.requirement && <p className="mt-1 text-sm">Milestone: {sel.requirement}</p>}
          <p className="mt-1 text-sm text-muted">
            Reward: +{sel.xpReward} XP · ◆{Math.round(sel.xpReward * gameConfig.gold.perXp)} gold
          </p>
          {canEdit && (
            <div className="mt-4 flex flex-wrap gap-3">
              {!sel.unlockedAt && unlockBlocker(skills, sel.id) === null && (
                <SlashButton onClick={() => unlockSkill(sel)} disabled={isBusy(`skill:${sel.id}`)}>
                  Unlock · +{sel.xpReward} XP
                </SlashButton>
              )}
              <SlashButton variant="ghost" onClick={() => setForm({ mode: "child", parent: sel })}>
                + Skill after this
              </SlashButton>
              {deleteBlocker(skills, sel.id) === null && (
                <SlashButton variant="ghost" onClick={() => deleteSkill(sel)} disabled={isBusy(`skill:${sel.id}`)}>
                  Delete
                </SlashButton>
              )}
            </div>
          )}
          {form?.mode === "child" && form.parent.id === sel.id && (
            <div className="mt-5">
              <SkillForm
                form={form}
                onDone={(created) => {
                  setForm(null);
                  if (created) setSelected(created.id);
                }}
              />
            </div>
          )}
        </div>
      )}
    </Panel>
  );
}
