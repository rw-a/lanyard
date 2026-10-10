import type { CardGeometry, PageSettings, PrintMethod, SideId, Template } from './types';
import { computeSheetLayout, type SheetLayout } from './template';
import { getPrintedSides } from './sides';

/**
 * Turning "these rows, this many copies" into printed pages.
 *
 * Every page lists explicit placements (which badge, which face, where), so the
 * on-screen preview, the print portal, crop marks and tests all read the same
 * plan instead of re-deriving positions from array indexes.
 *
 * Duplex convention: the sheet is turned over around its vertical axis, as seen
 * in the preview (long-edge flip for portrait paper, short-edge flip for landscape;
 * square paper counts as portrait). Back placements are the front rectangles
 * reflected left–right across the page; the artwork itself is never mirrored
 * and needs no extra rotation.
 */

/** One completed badge: a dataset row and which copy of it this is. */
export interface BadgeInstance {
  /** Unique across the job, including repeated rows. */
  instanceIndex: number;
  /** Index into the full dataset. */
  rowIndex: number;
  copyIndex: number;
}

/** One printed face of one badge on a page, positioned in mm from the page's top-left. */
export interface FacePlacement {
  instanceIndex: number;
  side: SideId;
  /** The card slot (row-major on the front of the sheet) this face occupies. In duplex, a back shares its front's slot. */
  slotIndex: number;
  x: number;
  y: number;
}

export interface PlannedPage {
  /** Position in the printed document / PDF. */
  pageIndex: number;
  /** Which physical sheet of paper this page is printed on. */
  sheetIndex: number;
  face: 'front' | 'back' | 'mixed';
  placements: FacePlacement[];
  /** Whether crop marks/outlines belong on this page (duplex prints them on the front only). */
  guides: boolean;
}

export type PrintMode = 'single' | PrintMethod;

export interface PrintPlan {
  mode: PrintMode;
  layout: SheetLayout;
  /** Badges placed on each physical sheet. */
  badgesPerSheet: number;
  instances: BadgeInstance[];
  pages: PlannedPage[];
  physicalSheetCount: number;
  badgeCount: number;
  printedFaceCount: number;
}

/** How a template prints: one-sided designs always print ordinary sheets, whatever method is remembered. */
export function printMode(t: Pick<Template, 'sidedness' | 'page'>): PrintMode {
  return t.sidedness === 'single' ? 'single' : t.page.printMethod;
}

/** Expand selected rows (in the given order, repeats kept) by copies into badge instances. */
export function expandBadges(rowIndexes: number[], copies: number): BadgeInstance[] {
  const n = Math.max(1, Math.round(copies));
  const out: BadgeInstance[] = [];
  for (const rowIndex of rowIndexes) {
    for (let copyIndex = 0; copyIndex < n; copyIndex++) out.push({ instanceIndex: out.length, rowIndex, copyIndex });
  }
  return out;
}

/** Top-left of a card slot (row-major) on the front of a sheet. */
export function slotPosition(layout: SheetLayout, card: CardGeometry, page: Pick<PageSettings, 'gapX' | 'gapY'>, slot: number): { x: number; y: number } {
  const col = slot % layout.cols;
  const row = Math.floor(slot / layout.cols);
  return { x: layout.offsetX + col * (card.width + page.gapX), y: layout.offsetY + row * (card.height + page.gapY) };
}

/** Where a back lands when the sheet is turned over around its vertical axis. */
export function reflectForDuplex(layout: SheetLayout, card: CardGeometry, pos: { x: number; y: number }): { x: number; y: number } {
  return { x: layout.pageWidth - pos.x - card.width, y: pos.y };
}

export function planPrint(
  t: Pick<Template, 'card' | 'page' | 'sidedness'>,
  rowIndexes: number[],
): PrintPlan {
  const layout = computeSheetLayout(t);
  const mode = printMode(t);
  const instances = expandBadges(rowIndexes, t.page.copies);
  const sides = getPrintedSides(t);
  const S = layout.perPage;
  const pages: PlannedPage[] = [];
  const at = (slot: number) => slotPosition(layout, t.card, t.page, slot);
  const base = { mode, layout, instances, badgeCount: instances.length, printedFaceCount: instances.length * sides.length };

  if (S === 0 || instances.length === 0) {
    return { ...base, badgesPerSheet: mode === 'cutouts' ? Math.floor(S / 2) : S, pages: [], physicalSheetCount: 0 };
  }

  if (mode === 'single') {
    for (let i = 0; i < instances.length; i += S) {
      const chunk = instances.slice(i, i + S);
      const sheetIndex = pages.length;
      pages.push({
        pageIndex: pages.length,
        sheetIndex,
        face: 'front',
        guides: true,
        placements: chunk.map((b, slot) => ({ instanceIndex: b.instanceIndex, side: 'front', slotIndex: slot, ...at(slot) })),
      });
    }
    return { ...base, badgesPerSheet: S, pages, physicalSheetCount: pages.length };
  }

  if (mode === 'cutouts') {
    if (S === 1) {
      // One slot: each badge's front and back go on two consecutive sheets.
      for (const b of instances) {
        for (const side of ['front', 'back'] as const) {
          pages.push({
            pageIndex: pages.length,
            sheetIndex: pages.length,
            face: side,
            guides: true,
            placements: [{ instanceIndex: b.instanceIndex, side, slotIndex: 0, ...at(0) }],
          });
        }
      }
      return { ...base, badgesPerSheet: 1, pages, physicalSheetCount: pages.length };
    }
    // Front and back of a badge sit in adjacent slots on the same sheet; an odd last slot stays empty.
    const per = Math.floor(S / 2);
    for (let i = 0; i < instances.length; i += per) {
      const chunk = instances.slice(i, i + per);
      pages.push({
        pageIndex: pages.length,
        sheetIndex: pages.length,
        face: 'mixed',
        guides: true,
        placements: chunk.flatMap((b, k) =>
          (['front', 'back'] as const).map((side, j) => ({ instanceIndex: b.instanceIndex, side, slotIndex: 2 * k + j, ...at(2 * k + j) })),
        ),
      });
    }
    return { ...base, badgesPerSheet: per, pages, physicalSheetCount: pages.length };
  }

  // Duplex: sheet front, then the same sheet's back with every badge's back reflected
  // across the page. Unused slots stay empty on both faces, and a back page is
  // emitted even when its artwork is blank so later pairs stay aligned.
  let sheetIndex = 0;
  for (let i = 0; i < instances.length; i += S, sheetIndex++) {
    const chunk = instances.slice(i, i + S);
    pages.push({
      pageIndex: pages.length,
      sheetIndex,
      face: 'front',
      guides: true,
      placements: chunk.map((b, slot) => ({ instanceIndex: b.instanceIndex, side: 'front', slotIndex: slot, ...at(slot) })),
    });
    pages.push({
      pageIndex: pages.length,
      sheetIndex,
      face: 'back',
      guides: false,
      placements: chunk.map((b, slot) => ({ instanceIndex: b.instanceIndex, side: 'back', slotIndex: slot, ...reflectForDuplex(layout, t.card, at(slot)) })),
    });
  }
  return { ...base, badgesPerSheet: S, pages, physicalSheetCount: sheetIndex };
}

/** The pages of one physical sheet (both faces in duplex), e.g. for a test print. */
export function pagesOfSheet(plan: PrintPlan, sheetIndex: number): PlannedPage[] {
  return plan.pages.filter((p) => p.sheetIndex === sheetIndex);
}

export interface GuideLine {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

/**
 * Crop marks for a page, from the cards actually placed on it: short lines in the
 * margins in line with every used column's and row's edges, kept outside the
 * block of cards and inside the paper.
 */
export function cropMarks(page: PlannedPage, layout: SheetLayout, card: CardGeometry): GuideLine[] {
  const lines: GuideLine[] = [];
  if (page.placements.length === 0) return lines;
  const { pageWidth: pw, pageHeight: ph } = layout;
  const len = 4;
  const gapFromGrid = 1;
  const colXs = [...new Set(page.placements.map((p) => round3(p.x)))].sort((a, b) => a - b);
  const rowYs = [...new Set(page.placements.map((p) => round3(p.y)))].sort((a, b) => a - b);
  const gridLeft = colXs[0];
  const gridRight = colXs[colXs.length - 1] + card.width;
  const gridTop = rowYs[0];
  const gridBottom = rowYs[rowYs.length - 1] + card.height;
  const xs = colXs.flatMap((x) => [x, x + card.width]);
  const ys = rowYs.flatMap((y) => [y, y + card.height]);
  for (const x of xs) {
    // top & bottom margins
    lines.push({ x1: x, y1: Math.max(0, gridTop - gapFromGrid - len), x2: x, y2: Math.max(0, gridTop - gapFromGrid) });
    lines.push({ x1: x, y1: Math.min(ph, gridBottom + gapFromGrid), x2: x, y2: Math.min(ph, gridBottom + gapFromGrid + len) });
  }
  for (const y of ys) {
    lines.push({ x1: Math.max(0, gridLeft - gapFromGrid - len), y1: y, x2: Math.max(0, gridLeft - gapFromGrid), y2: y });
    lines.push({ x1: Math.min(pw, gridRight + gapFromGrid), y1: y, x2: Math.min(pw, gridRight + gapFromGrid + len), y2: y });
  }
  return lines;
}

function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}
