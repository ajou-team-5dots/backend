// Shapes of the JSON files the Python batch writes (front-demo docs/DATA_SPEC.md 5장).
// Our own batch output, so types are enough; no runtime validation (CONVENTION 7장).
import type { PentagonAxis } from '../types/monsters.js';

/** The batch writes two independent results, selected by the same heavy filter as SQL. */
export interface HeavyResults<T> {
  include: Record<string, T>;
  exclude: Record<string, T>;
}

/** pentagon.json, per monster. */
export interface PentagonResult {
  rank: number;
  axes: PentagonAxis[];
}

/** h2-same-condition.json, per patch and monster. Null fields: fit failed or SE > 5. */
export interface PatchModel {
  or: number | null;
  lo: number | null;
  hi: number | null;
  netOfComparator: number | null;
}

/** patches.json, one patch of any kind. */
export interface MonsterPatch {
  id: string;
  /** ISO time with offset, e.g. 2026-10-14T14:40:00+09:00 */
  ts: string;
  kind: string;
  label: string;
  changed?: Record<string, { hpRatio: number | null; dmgRatio: number | null }>;
}

/** meta.json: batch time and data range (YYYY-MM-DD, Seoul days). */
export interface MetaFile {
  generatedAt: string;
  dataFrom: string;
  dataTo: string;
  rows: number;
  encounters: number;
  script: string;
}
