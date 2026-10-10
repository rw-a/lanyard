import type { SideDesign, SideId, Sidedness, Template } from './types';
import { uid } from './template';

/**
 * Pure helpers that answer "which design does this face show?" for a template.
 * Everything that renders, prints, counts columns or walks pictures goes through
 * these so the three sidedness modes behave consistently.
 */

export const SIDE_LABEL: Record<SideId, string> = { front: 'Front', back: 'Back' };

export const SIDEDNESS_OPTIONS: { value: Sidedness; label: string }[] = [
  { value: 'single', label: 'One Sided' },
  { value: 'same', label: 'Double-Sided — Same on Both Sides' },
  { value: 'different', label: 'Double-Sided — Different on Each Side' },
];

export function isDoubleSided(t: Pick<Template, 'sidedness'>): boolean {
  return t.sidedness !== 'single';
}

/** The faces each completed badge has, in print order. */
export function getPrintedSides(t: Pick<Template, 'sidedness'>): SideId[] {
  return t.sidedness === 'single' ? ['front'] : ['front', 'back'];
}

/**
 * The design a face is printed from. The back of a one-sided badge does not
 * exist (null); in `same` mode the back reads the front design.
 */
export function getDesignForSide(t: Pick<Template, 'sidedness' | 'sides'>, side: SideId): SideDesign | null {
  if (side === 'front') return t.sides.front;
  if (t.sidedness === 'single') return null;
  if (t.sidedness === 'same') return t.sides.front;
  return t.sides.back;
}

/** Every design kept in the template, used or not (for picture bookkeeping). */
export function getStoredDesigns(t: Pick<Template, 'sides'>): SideDesign[] {
  return t.sides.back ? [t.sides.front, t.sides.back] : [t.sides.front];
}

/** The distinct designs current output is made from: the front, plus the back only when it is independent. */
export function getUsedDesigns(t: Pick<Template, 'sidedness' | 'sides'>): SideDesign[] {
  return t.sidedness === 'different' && t.sides.back ? [t.sides.front, t.sides.back] : [t.sides.front];
}

/** The side the editor may edit: only `different` has an editable back. */
export function normalizeEditableSide(t: Pick<Template, 'sidedness' | 'sides'>, side: SideId): SideId {
  return side === 'back' && t.sidedness === 'different' && t.sides.back ? 'back' : 'front';
}

/** Label for the design currently on the canvas. */
export function editingLabel(t: Pick<Template, 'sidedness'>, side: SideId): string {
  if (t.sidedness === 'same') return 'Front & Back';
  return SIDE_LABEL[side];
}

/**
 * Deep copy of a design with fresh element ids (so ids stay unique across sides).
 * Picture references are plain strings and keep pointing at the same stored asset.
 * Pass a plain object (unwrap store proxies first).
 */
export function cloneSideDesign(source: SideDesign): SideDesign {
  const copy = structuredClone(source);
  for (const el of copy.elements) el.id = uid();
  return copy;
}

export function createBlankSide(): SideDesign {
  return { bg: '#ffffff', bgImage: null, elements: [] };
}

/** True when the design has anything worth confirming before it is replaced. */
export function sideHasContent(d: SideDesign | null): boolean {
  return !!d && (d.elements.length > 0 || !!d.bgImage || (d.bg.toLowerCase() !== '#ffffff' && d.bg.toLowerCase() !== '#fff'));
}
