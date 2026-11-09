// Skill trees: rules and layout. A skill can only be unlocked after its parent.
import { cleanTitle, cleanXpReward } from "./quests";
import { type GameConfig, gameConfig } from "./config";

export interface Skill {
  id: string;
  tree: string;
  name: string;
  requirement: string | null;
  domain: string;
  parentId: string | null;
  xpReward: number;
  unlockedAt: string | null;
}

export interface NewSkillInput {
  tree: string;
  name: string;
  requirement: string;
  domain: string;
  parentId: string | null;
  xpReward: number;
}

export const DEFAULT_SKILL_XP = 50;
export const MAX_SKILLS_PER_TREE = 40;

export function normalizeNewSkill(input: NewSkillInput, existing: ReadonlyArray<Skill>, config: GameConfig = gameConfig) {
  const tree = cleanTitle(input.tree, "skill tree");
  if (tree.length > 40) throw new Error("Keep tree names under 40 characters.");
  const name = cleanTitle(input.name, "skill");
  const requirement = input.requirement.trim().slice(0, 200) || null;
  if (!config.domains.some((d) => d.id === input.domain)) throw new Error("Pick a domain.");
  const xpReward = cleanXpReward(input.xpReward);
  const inTree = existing.filter((s) => s.tree === tree);
  if (inTree.length >= MAX_SKILLS_PER_TREE) throw new Error(`A tree can have at most ${MAX_SKILLS_PER_TREE} skills.`);
  if (input.parentId) {
    const parent = existing.find((s) => s.id === input.parentId);
    if (!parent || parent.tree !== tree) throw new Error("The skill it comes after must be in the same tree.");
  } else if (inTree.length > 0) {
    throw new Error("Pick which skill this one comes after.");
  }
  if (inTree.some((s) => s.name.toLowerCase() === name.toLowerCase())) throw new Error(`"${name}" is already in this tree.`);
  return { tree, name, requirement, domain: input.domain, parentId: input.parentId, xpReward, goldReward: Math.round(xpReward * config.gold.perXp) };
}

/** Why a skill can't be unlocked yet, or null if it can. */
export function unlockBlocker(skills: ReadonlyArray<Skill>, id: string): string | null {
  const s = skills.find((x) => x.id === id);
  if (!s) return "That skill no longer exists.";
  if (s.unlockedAt) return `"${s.name}" is already unlocked.`;
  const parent = s.parentId ? skills.find((x) => x.id === s.parentId) : null;
  if (parent && !parent.unlockedAt) return `Unlock "${parent.name}" first.`;
  return null;
}

/** Only locked skills with nothing after them can be deleted (unlocked ones are history). */
export function deleteBlocker(skills: ReadonlyArray<Skill>, id: string): string | null {
  const s = skills.find((x) => x.id === id);
  if (!s) return "That skill no longer exists.";
  if (s.unlockedAt) return "Unlocked skills stay. They're part of your history.";
  if (skills.some((x) => x.parentId === id)) return "Delete the skills after this one first.";
  return null;
}

export function treeNames(skills: ReadonlyArray<Skill>): string[] {
  return [...new Set(skills.map((s) => s.tree))].sort((a, b) => a.localeCompare(b));
}

/** Trees with 3+ skills that are all unlocked. */
export function completedTrees(skills: ReadonlyArray<Skill>): number {
  return treeNames(skills).filter((t) => {
    const inTree = skills.filter((s) => s.tree === t);
    return inTree.length >= 3 && inTree.every((s) => s.unlockedAt);
  }).length;
}

export interface PlacedSkill extends Skill {
  depth: number;
  /** Horizontal slot (0-based), leaves spread out, parents centered over children. */
  x: number;
}

/** Simple tidy-tree layout: depth top to bottom, children spread under their parent. */
export function layoutTree(skills: ReadonlyArray<Skill>): { nodes: PlacedSkill[]; width: number; depth: number } {
  const ids = new Set(skills.map((s) => s.id));
  const children = new Map<string | null, Skill[]>();
  for (const s of skills) {
    const parent = s.parentId && ids.has(s.parentId) ? s.parentId : null;
    children.set(parent, [...(children.get(parent) ?? []), s]);
  }
  const placed: PlacedSkill[] = [];
  let nextLeaf = 0;
  let maxDepth = 0;
  const visit = (s: Skill, depth: number): number => {
    maxDepth = Math.max(maxDepth, depth);
    const kids = children.get(s.id) ?? [];
    let x: number;
    if (kids.length === 0) x = nextLeaf++;
    else {
      const xs = kids.map((k) => visit(k, depth + 1));
      x = (xs[0] + xs[xs.length - 1]) / 2;
    }
    placed.push({ ...s, depth, x });
    return x;
  };
  for (const root of children.get(null) ?? []) visit(root, 0);
  return { nodes: placed, width: Math.max(1, nextLeaf), depth: maxDepth + 1 };
}
