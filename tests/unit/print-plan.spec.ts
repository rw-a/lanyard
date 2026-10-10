import { expect, test } from '@playwright/test';
import { cropMarks, expandBadges, pagesOfSheet, planPrint, printMode, reflectForDuplex, slotPosition, type PrintPlan } from '../../src/lib/print-plan';
import { computeSheetLayout, defaultTemplate } from '../../src/lib/template';
import type { PrintMethod, Sidedness, Template } from '../../src/lib/types';

/** A template whose sheet holds exactly `cols × rows` cards (A4 portrait, 5 mm margin). */
function template(opts: { sidedness?: Sidedness; method?: PrintMethod; cols?: number; rows?: number; copies?: number } = {}): Template {
  const t = defaultTemplate(['Name']);
  t.sidedness = opts.sidedness ?? 'single';
  t.page.printMethod = opts.method ?? 'cutouts';
  t.page.copies = opts.copies ?? 1;
  const cols = opts.cols ?? 2;
  const rows = opts.rows ?? 2;
  // 200 × 287 printable: pick a card size that fits exactly cols × rows
  t.card.width = cols === 0 ? 250 : Math.floor(200 / cols);
  t.card.height = rows === 0 ? 300 : Math.floor(287 / rows);
  return t;
}

const range = (n: number) => Array.from({ length: n }, (_, i) => i);

/** "row/copy/side" for every placement of a page, in placement order. */
const faces = (plan: PrintPlan, pageIndex: number) =>
  plan.pages[pageIndex].placements.map((p) => {
    const b = plan.instances[p.instanceIndex];
    return `${b.rowIndex}.${b.copyIndex}${p.side === 'front' ? 'F' : 'B'}@${p.slotIndex}`;
  });

test.describe('badge instances', () => {
  test('rows are expanded by copies once, in order, with unique instance ids', () => {
    expect(expandBadges([3, 1], 2)).toEqual([
      { instanceIndex: 0, rowIndex: 3, copyIndex: 0 },
      { instanceIndex: 1, rowIndex: 3, copyIndex: 1 },
      { instanceIndex: 2, rowIndex: 1, copyIndex: 0 },
      { instanceIndex: 3, rowIndex: 1, copyIndex: 1 },
    ]);
    // A repeated row is two independent badges
    expect(expandBadges([0, 0], 1).map((b) => b.instanceIndex)).toEqual([0, 1]);
    expect(expandBadges([0], 0)).toHaveLength(1); // copies is at least 1
    expect(expandBadges([], 3)).toEqual([]);
  });

  test('one-sided designs always print plain sheets whatever method is remembered', () => {
    expect(printMode(template({ sidedness: 'single', method: 'duplex' }))).toBe('single');
    expect(printMode(template({ sidedness: 'same', method: 'duplex' }))).toBe('duplex');
    expect(printMode(template({ sidedness: 'different', method: 'cutouts' }))).toBe('cutouts');
  });
});

test.describe('counts for every capacity, mode and method', () => {
  const capacities: [number, number][] = [
    [0, 0],
    [1, 1],
    [2, 1],
    [3, 1],
    [2, 2],
    [2, 3],
  ];
  for (const [cols, rows] of capacities) {
    const S = cols * rows;
    for (const n of [0, 1, 5, 12]) {
      test(`capacity ${S}, ${n} badges`, () => {
        const single = planPrint(template({ cols, rows }), range(n));
        const cut = planPrint(template({ cols, rows, sidedness: 'different', method: 'cutouts' }), range(n));
        const dup = planPrint(template({ cols, rows, sidedness: 'same', method: 'duplex' }), range(n));
        expect(single.layout.perPage).toBe(S);
        if (S === 0 || n === 0) {
          for (const p of [single, cut, dup]) {
            expect(p.pages).toEqual([]);
            expect(p.physicalSheetCount).toBe(0);
          }
          return;
        }
        expect(single.physicalSheetCount).toBe(Math.ceil(n / S));
        expect(single.pages).toHaveLength(Math.ceil(n / S));
        expect(single.printedFaceCount).toBe(n);

        const cutSheets = S === 1 ? 2 * n : Math.ceil(n / Math.floor(S / 2));
        expect(cut.physicalSheetCount).toBe(cutSheets);
        expect(cut.pages).toHaveLength(cutSheets);
        expect(cut.printedFaceCount).toBe(2 * n);

        expect(dup.physicalSheetCount).toBe(Math.ceil(n / S));
        expect(dup.pages).toHaveLength(2 * Math.ceil(n / S));
        expect(dup.printedFaceCount).toBe(2 * n);

        for (const p of [single, cut, dup]) {
          // Every badge appears exactly once per face, and no slot is used twice on a page
          const seen = p.pages.flatMap((pg) => pg.placements.map((f) => `${f.instanceIndex}${f.side}`));
          expect(new Set(seen).size).toBe(seen.length);
          expect(seen).toHaveLength(p.printedFaceCount);
          for (const pg of p.pages) {
            const slots = pg.placements.map((f) => f.slotIndex);
            expect(new Set(slots).size).toBe(slots.length);
            expect(Math.max(...slots)).toBeLessThan(S);
          }
          expect(p.pages.map((pg) => pg.pageIndex)).toEqual(range(p.pages.length));
        }
      });
    }
  }

  test('the documented example: 25 people, 1 copy, 4 slots', () => {
    const rows = range(25);
    const one = planPrint(template(), rows);
    const cut = planPrint(template({ sidedness: 'different', method: 'cutouts' }), rows);
    const dup = planPrint(template({ sidedness: 'different', method: 'duplex' }), rows);
    expect([one.badgeCount, one.printedFaceCount, one.physicalSheetCount, one.pages.length]).toEqual([25, 25, 7, 7]);
    expect([cut.badgeCount, cut.printedFaceCount, cut.physicalSheetCount, cut.pages.length]).toEqual([25, 50, 13, 13]);
    expect([dup.badgeCount, dup.printedFaceCount, dup.physicalSheetCount, dup.pages.length]).toEqual([25, 50, 7, 14]);
  });
});

test.describe('one-sided', () => {
  test('packs fronts row-major, positioned like before', () => {
    const t = defaultTemplate(['Name']); // 100 × 140 on A4: 2 × 2, offsets 5 / 8.5
    const plan = planPrint(t, range(5));
    expect(plan.pages.map((p) => p.face)).toEqual(['front', 'front']);
    expect(plan.pages[0].placements.map((p) => [p.x, p.y])).toEqual([
      [5, 8.5],
      [105, 8.5],
      [5, 148.5],
      [105, 148.5],
    ]);
    expect(faces(plan, 1)).toEqual(['4.0F@0']);
  });

  test('copies follow each other and a row range keeps its order', () => {
    const plan = planPrint({ ...template({ copies: 2 }) }, [7, 2]);
    expect(faces(plan, 0)).toEqual(['7.0F@0', '7.1F@1', '2.0F@2', '2.1F@3']);
  });
});

test.describe('separate cutouts', () => {
  test('each front sits next to its own back on the same sheet; an odd last slot stays empty', () => {
    const plan = planPrint(template({ cols: 3, rows: 1, sidedness: 'different', method: 'cutouts' }), range(3));
    expect(plan.badgesPerSheet).toBe(1);
    expect(plan.pages.map((p) => p.face)).toEqual(['mixed', 'mixed', 'mixed']);
    expect(faces(plan, 0)).toEqual(['0.0F@0', '0.0B@1']);
    expect(faces(plan, 2)).toEqual(['2.0F@0', '2.0B@1']);
  });

  test('pairs are in order A front, A back, B front, B back, including copies', () => {
    const plan = planPrint(template({ sidedness: 'same', method: 'cutouts', copies: 2 }), [4, 9]);
    expect(faces(plan, 0)).toEqual(['4.0F@0', '4.0B@1', '4.1F@2', '4.1B@3']);
    expect(faces(plan, 1)).toEqual(['9.0F@0', '9.0B@1', '9.1F@2', '9.1B@3']);
  });

  test('artwork is upright: backs are placed in ordinary slots, not reflected', () => {
    const t = template({ sidedness: 'different', method: 'cutouts' });
    const plan = planPrint(t, range(1));
    const L = computeSheetLayout(t);
    expect(plan.pages[0].placements.map((p) => ({ x: p.x, y: p.y }))).toEqual([slotPosition(L, t.card, t.page, 0), slotPosition(L, t.card, t.page, 1)]);
  });

  test('with one slot per sheet each badge takes two consecutive sheets', () => {
    const plan = planPrint(template({ cols: 1, rows: 1, sidedness: 'different', method: 'cutouts' }), range(2));
    expect(plan.pages.map((p) => [p.sheetIndex, p.face])).toEqual([
      [0, 'front'],
      [1, 'back'],
      [2, 'front'],
      [3, 'back'],
    ]);
    expect(plan.pages.every((p) => p.guides)).toBe(true);
  });
});

test.describe('duplex sheets', () => {
  test('the documented three badges on a 2 × 2 sheet', () => {
    const t = template({ sidedness: 'different', method: 'duplex' });
    const plan = planPrint(t, range(3));
    expect(plan.pages.map((p) => [p.sheetIndex, p.face])).toEqual([
      [0, 'front'],
      [0, 'back'],
    ]);
    const [front, back] = plan.pages;
    // Front: A | B / C | empty. Back as seen from the back: B | A / empty | C
    const L = plan.layout;
    const at = (page: typeof front, x: number, y: number) =>
      page.placements.find((p) => Math.abs(p.x - x) < 1e-9 && Math.abs(p.y - y) < 1e-9)?.instanceIndex;
    const col = (c: number) => L.offsetX + c * (t.card.width + t.page.gapX);
    const row = (r: number) => L.offsetY + r * (t.card.height + t.page.gapY);
    expect([at(front, col(0), row(0)), at(front, col(1), row(0)), at(front, col(0), row(1)), at(front, col(1), row(1))]).toEqual([0, 1, 2, undefined]);
    expect([at(back, col(0), row(0)), at(back, col(1), row(0)), at(back, col(0), row(1)), at(back, col(1), row(1))]).toEqual([1, 0, undefined, 2]);
    expect(front.guides).toBe(true);
    expect(back.guides).toBe(false); // cutting guides on the front only
  });

  test('every back is its own front reflected across the page width (portrait, landscape, custom, gaps, non-square cards)', () => {
    const variants: ((t: Template) => void)[] = [
      () => undefined,
      (t) => (t.page.landscape = true),
      (t) => {
        t.page.preset = 'custom';
        t.page.width = 320;
        t.page.height = 260;
        t.page.margin = 12;
        t.page.gapX = 7;
        t.page.gapY = 3;
      },
      (t) => {
        t.card.width = 85.6;
        t.card.height = 54;
        t.page.gapX = 4.5;
        t.page.margin = 9;
      },
    ];
    for (const vary of variants) {
      const t = template({ sidedness: 'different', method: 'duplex' });
      vary(t);
      const L = computeSheetLayout(t);
      expect(L.perPage).toBeGreaterThan(0);
      const plan = planPrint(t, range(L.perPage * 2 + 1)); // two full sheets and a partial one
      expect(plan.physicalSheetCount).toBe(3);
      for (let s = 0; s < plan.physicalSheetCount; s++) {
        const [front, back] = pagesOfSheet(plan, s);
        expect([front.face, back.face]).toEqual(['front', 'back']);
        expect(back.placements.map((p) => p.instanceIndex).sort()).toEqual(front.placements.map((p) => p.instanceIndex).sort());
        for (const f of front.placements) {
          const b = back.placements.find((p) => p.instanceIndex === f.instanceIndex)!;
          expect(b.side).toBe('back');
          expect(b.slotIndex).toBe(f.slotIndex);
          expect(b.x).toBeCloseTo(L.pageWidth - f.x - t.card.width, 9);
          expect(b.y).toBeCloseTo(f.y, 9);
          expect(reflectForDuplex(L, t.card, f)).toEqual({ x: b.x, y: b.y });
          // inside the paper
          expect(b.x).toBeGreaterThanOrEqual(0);
          expect(b.x + t.card.width).toBeLessThanOrEqual(L.pageWidth + 1e-9);
        }
      }
    }
  });

  test('a partial last sheet keeps each back at its full-sheet reflected position', () => {
    const t = template({ cols: 3, rows: 2, sidedness: 'different', method: 'duplex' });
    const plan = planPrint(t, range(7)); // sheet 2 holds one badge in slot 0
    const [front, back] = pagesOfSheet(plan, 1);
    expect(front.placements).toHaveLength(1);
    expect(back.placements).toHaveLength(1);
    expect(back.placements[0].x).toBeCloseTo(plan.layout.pageWidth - front.placements[0].x - t.card.width, 9);
    // …which is where slot 2 (top right) is on the front, not compacted to the left
    expect(back.placements[0].x).toBeCloseTo(slotPosition(plan.layout, t.card, t.page, 2).x, 9);
  });

  test('back pages are emitted even when the back artwork is blank', () => {
    const t = template({ sidedness: 'different', method: 'duplex' });
    t.sides.back = { bg: '#ffffff', bgImage: null, elements: [] };
    const plan = planPrint(t, range(9));
    expect(plan.pages.map((p) => p.face)).toEqual(['front', 'back', 'front', 'back', 'front', 'back']);
  });

  test('copies and repeated rows are paired by instance, never by row', () => {
    const plan = planPrint(template({ sidedness: 'same', method: 'duplex', copies: 2 }), [5, 5]);
    expect(plan.instances.map((b) => `${b.rowIndex}.${b.copyIndex}`)).toEqual(['5.0', '5.1', '5.0', '5.1']);
    expect(faces(plan, 0)).toEqual(['5.0F@0', '5.1F@1', '5.0F@2', '5.1F@3']);
    expect(faces(plan, 1)).toEqual(['5.0B@0', '5.1B@1', '5.0B@2', '5.1B@3']);
  });
});

test.describe('crop marks', () => {
  test('a full 2 × 2 sheet gets marks for both columns and rows, as before', () => {
    const t = defaultTemplate(['Name']);
    const plan = planPrint(t, range(4));
    const marks = cropMarks(plan.pages[0], plan.layout, t.card);
    expect(marks).toHaveLength(16); // 4 x-positions × 2 + 4 y-positions × 2
    for (const m of marks) {
      for (const v of [m.x1, m.x2]) expect(v).toBeGreaterThanOrEqual(0);
      for (const v of [m.y1, m.y2]) expect(v).toBeGreaterThanOrEqual(0);
      expect(Math.max(m.x1, m.x2)).toBeLessThanOrEqual(plan.layout.pageWidth);
      expect(Math.max(m.y1, m.y2)).toBeLessThanOrEqual(plan.layout.pageHeight);
    }
  });

  test('marks follow the occupied placements, not a count of cards', () => {
    const t = defaultTemplate(['Name']);
    const plan = planPrint(t, range(1));
    expect(cropMarks(plan.pages[0], plan.layout, t.card)).toHaveLength(8); // one column, one row
    // A reflected back alone in the right-hand column gets marks there
    const dup = planPrint({ ...t, sidedness: 'same', page: { ...t.page, printMethod: 'duplex' } }, range(1));
    const backMarks = cropMarks(dup.pages[1], dup.layout, t.card);
    expect(new Set(backMarks.filter((m) => m.x1 === m.x2).map((m) => m.x1))).toEqual(new Set([105, 205]));
  });

  test('an empty page has no marks', () => {
    const t = defaultTemplate();
    expect(cropMarks({ pageIndex: 0, sheetIndex: 0, face: 'front', guides: true, placements: [] }, computeSheetLayout(t), t.card)).toEqual([]);
  });
});
