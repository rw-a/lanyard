import { expect, test } from '@playwright/test';
import {
  buildColorRule,
  buildImageRule,
  columnsUsedBy,
  computeSheetLayout,
  defaultTemplate,
  describeFit,
  distinctValues,
  fileStem,
  matchFilesToValues,
  newImageElement,
  newRectElement,
  normalizeKey,
  outsideCard,
  pageDims,
  placeholdersIn,
  resolveFill,
  resolveImageSrc,
  substitute,
} from '../../src/lib/template';
import type { Row, Template } from '../../src/lib/types';

test.describe('placeholders', () => {
  test('finds {{Field}} names, tolerating spaces and duplicates', () => {
    expect(placeholdersIn('Hi {{Name}}, cabin {{ Cabin }} / {{Name}}')).toEqual(['Name', 'Cabin']);
    expect(placeholdersIn('no fields here')).toEqual([]);
  });

  test('substitutes values and blanks unknown fields', () => {
    const row: Row = { Name: 'Ada', Cabin: '3' };
    expect(substitute('{{Name}} — Cabin {{Cabin}}', row)).toBe('Ada — Cabin 3');
    expect(substitute('{{Missing}}!', row)).toBe('!');
    expect(substitute('plain', row)).toBe('plain');
  });

  test('columnsUsedBy collects placeholders, colour-rule, image-rule and image-URL columns', () => {
    const t = defaultTemplate(['Name', 'Accommodation', 'Group']);
    t.sides.front.elements.push(newRectElement({ colorRule: { column: 'Team', map: {}, fallback: '#000' } }));
    t.sides.front.elements.push(newImageElement({ srcColumn: 'Photo' }));
    t.sides.front.elements.push(newImageElement({ imageRule: { column: 'Animal', map: {}, fallback: '' } }));
    const used = columnsUsedBy(t);
    expect(used).toEqual(expect.arrayContaining(['Name', 'Accommodation', 'Group', 'Team', 'Photo', 'Animal']));
  });
});

test.describe('defaultTemplate', () => {
  test('binds common header names for name, accommodation and group', () => {
    const t = defaultTemplate(['Full Name', 'Cabin', 'Team', 'Allergies']);
    const contents = t.sides.front.elements.filter((e) => e.kind === 'text').map((e) => (e as { content: string }).content);
    expect(contents).toContain('{{Full Name}}');
    expect(contents).toContain('{{Cabin}}');
    expect(contents).toContain('{{Team}}');
  });

  test('combines first and last name columns', () => {
    const t = defaultTemplate(['First name', 'Last name', 'Tent']);
    const contents = t.sides.front.elements.filter((e) => e.kind === 'text').map((e) => (e as { content: string }).content);
    expect(contents).toContain('{{First name}} {{Last name}}');
    expect(contents).toContain('{{Tent}}');
  });

  test('falls back to the first columns when nothing matches', () => {
    const t = defaultTemplate(['Alpha', 'Beta', 'Gamma']);
    expect(columnsUsedBy(t)).toEqual(expect.arrayContaining(['Alpha', 'Beta', 'Gamma']));
  });

  test('every element starts inside the card', () => {
    const t = defaultTemplate(['Name']);
    for (const el of t.sides.front.elements) expect(outsideCard(el, t.card), el.name).toBe(false);
  });

  test('all element ids are unique', () => {
    const t = defaultTemplate(['Name']);
    expect(new Set(t.sides.front.elements.map((e) => e.id)).size).toBe(t.sides.front.elements.length);
  });
});

test.describe('sheet layout', () => {
  const base = (): Template => defaultTemplate(['Name']);

  test('100 × 140 cards go 2 × 2 on A4 portrait with 5 mm margins', () => {
    const L = computeSheetLayout(base());
    expect(L).toMatchObject({ cols: 2, rows: 2, perPage: 4, pageWidth: 210, pageHeight: 297 });
    // 2 × 100 = 200 used of 200 available → no horizontal centring offset beyond the margin
    expect(L.offsetX).toBeCloseTo(5, 5);
    // 2 × 140 = 280 used of 287 → centred: 5 + 3.5
    expect(L.offsetY).toBeCloseTo(8.5, 5);
  });

  test('landscape swaps the page dimensions', () => {
    const t = base();
    t.page.landscape = true;
    expect(pageDims(t)).toEqual({ width: 297, height: 210 });
    const L = computeSheetLayout(t);
    expect(L.cols).toBe(2); // floor(287 / 100)
    expect(L.rows).toBe(1); // floor(200 / 140)
  });

  test('gaps reduce how many fit', () => {
    const t = base();
    t.page.gapX = 10;
    // (200 + 10) / (100 + 10) = 1.9 → 1 column
    expect(computeSheetLayout(t).cols).toBe(1);
  });

  test('a card bigger than the printable area gives zero per page', () => {
    const t = base();
    t.card.width = 250;
    expect(computeSheetLayout(t).perPage).toBe(0);
  });

  test('exact A6 fits far fewer per A4 than 100 × 140 (the reason for the default)', () => {
    const t = base();
    t.card.width = 105;
    t.card.height = 148;
    expect(computeSheetLayout(t).perPage).toBe(1); // 200 × 287 printable → 1 × 1
    t.page.landscape = true;
    expect(computeSheetLayout(t).perPage).toBe(2); // 287 × 200 → 2 × 1
    t.page.landscape = false;
    t.page.margin = 0;
    expect(computeSheetLayout(t).perPage).toBe(4); // only borderless printing gets 2 × 2
  });
});

test.describe('colour rules', () => {
  const rows: Row[] = [{ G: 'Otters' }, { G: 'Bears' }, { G: 'Otters' }, { G: ' Eagles ' }, { G: '' }];

  test('distinctValues orders by frequency then name and trims', () => {
    expect(distinctValues(rows, 'G')).toEqual(['Otters', '', 'Bears', 'Eagles']);
  });

  test('buildColorRule assigns a palette colour per value and keeps existing choices', () => {
    const rule = buildColorRule(rows, 'G');
    expect(Object.keys(rule.map).sort()).toEqual(['', 'Bears', 'Eagles', 'Otters']);
    expect(new Set(Object.values(rule.map)).size).toBe(4);
    const custom = { ...rule, map: { ...rule.map, Bears: '#123456' } };
    const rebuilt = buildColorRule(rows, 'G', custom);
    expect(rebuilt.map.Bears).toBe('#123456');
  });

  test('resolveFill picks the mapped colour, else the fallback, else the fixed colour', () => {
    const rule = { column: 'G', map: { Otters: '#111111' }, fallback: '#999999' };
    expect(resolveFill('#abcdef', null, { G: 'Otters' })).toBe('#abcdef');
    expect(resolveFill('#abcdef', rule, { G: 'Otters' })).toBe('#111111');
    expect(resolveFill('#abcdef', rule, { G: 'Wolves' })).toBe('#999999');
    expect(resolveFill('#abcdef', rule, {})).toBe('#999999');
  });
});

test.describe('outsideCard / describeFit', () => {
  const card = { width: 100, height: 140 };

  test('detects boxes poking out on any side, with a flush box allowed', () => {
    expect(outsideCard({ x: 0, y: 0, w: 100, h: 140 }, card)).toBe(false);
    expect(outsideCard({ x: 12, y: 44, w: 88, h: 30 }, card)).toBe(false);
    expect(outsideCard({ x: 12.5, y: 44, w: 88, h: 30 }, card)).toBe(true);
    expect(outsideCard({ x: -1, y: 0, w: 10, h: 10 }, card)).toBe(true);
    expect(outsideCard({ x: 0, y: -1, w: 10, h: 10 }, card)).toBe(true);
    expect(outsideCard({ x: 0, y: 135, w: 10, h: 10 }, card)).toBe(true);
  });

  test('describeFit explains each combination', () => {
    expect(describeFit(undefined)).toBeNull();
    expect(describeFit({ overflow: false, clipped: false })).toBeNull();
    expect(describeFit({ overflow: true, clipped: false })).toMatch(/overflows/);
    expect(describeFit({ overflow: false, clipped: true })).toMatch(/cut off by the card edge/);
    expect(describeFit({ overflow: true, clipped: true })).toMatch(/overflows.*cut off/);
  });
});

test.describe('picture by field', () => {
  const bear = 'data:image/png;base64,BEAR';
  const lion = 'data:image/png;base64,LION';
  const other = 'data:image/png;base64,OTHER';

  test('resolveImageSrc prefers the rule, then the URL column, then the fixed picture', () => {
    const fixed = { src: 'logo', srcColumn: null, imageRule: null };
    expect(resolveImageSrc(fixed, { Group: 'Bears' })).toBe('logo');

    const byColumn = { src: 'logo', srcColumn: 'Photo', imageRule: null };
    expect(resolveImageSrc(byColumn, { Photo: 'https://x/y.png' })).toBe('https://x/y.png');
    expect(resolveImageSrc(byColumn, { Photo: '  ' })).toBe('logo'); // blank cell → fixed picture

    const rule = { column: 'Group', map: { Bears: bear, Lions: lion }, fallback: other };
    const byRule = { src: 'logo', srcColumn: 'Photo', imageRule: rule };
    expect(resolveImageSrc(byRule, { Group: 'Bears', Photo: 'https://x/y.png' })).toBe(bear);
    expect(resolveImageSrc(byRule, { Group: ' Lions ' })).toBe(lion); // values are trimmed
    expect(resolveImageSrc(byRule, { Group: 'Wolves' })).toBe(other);
    expect(resolveImageSrc({ ...byRule, imageRule: { ...rule, fallback: '' } }, { Group: 'Wolves' })).toBe(''); // no fallback → nothing
    expect(resolveImageSrc(byRule, {})).toBe(other);
  });

  test('buildImageRule keeps pictures already assigned when re-keyed to the same column', () => {
    const rows = [{ G: 'Bears' }, { G: 'Lions' }, { G: 'Bears' }];
    const fresh = buildImageRule(rows, 'G');
    expect(fresh).toEqual({ column: 'G', map: {}, fallback: '' });
    const withPics = { column: 'G', map: { Bears: bear, Gone: other }, fallback: lion };
    const rebuilt = buildImageRule(rows, 'G', withPics);
    expect(rebuilt.map).toEqual({ Bears: bear }); // "Gone" is no longer a value
    expect(rebuilt.fallback).toBe(lion);
    const switched = buildImageRule([{ H: 'x' }], 'H', withPics);
    expect(switched.map).toEqual({});
  });

  test('normalizeKey and fileStem make file names comparable to values', () => {
    expect(normalizeKey('Lakeside Lodge – Upper Floor')).toBe('lakesidelodgeupperfloor');
    expect(normalizeKey('Zoë & Co.')).toBe('zoeco');
    expect(fileStem('bears.png')).toBe('bears');
    expect(fileStem('Bears (2).PNG')).toBe('Bears');
    expect(fileStem('otters-400x400.jpg')).toBe('otters');
    expect(fileStem('lion.tiger.svg')).toBe('lion.tiger');
  });

  test('matchFilesToValues matches by normalised name and singular/plural', () => {
    const values = ['Bears', 'Lions', 'Lakeside Lodge', 'Staff', ''];
    const m = matchFilesToValues(['bears.png', 'Lion.jpg', 'lake-side_lodge.webp', 'STAFF (1).png', 'camp-logo.png', 'unknowns.png'], values);
    expect(m).toEqual([
      { fileName: 'bears.png', value: 'Bears' },
      { fileName: 'Lion.jpg', value: 'Lions' },
      { fileName: 'lake-side_lodge.webp', value: 'Lakeside Lodge' },
      { fileName: 'STAFF (1).png', value: 'Staff' },
      { fileName: 'camp-logo.png', value: null },
      { fileName: 'unknowns.png', value: null },
    ]);
  });

  test('matchFilesToValues never matches the empty value', () => {
    expect(matchFilesToValues(['.png', ' .png'], ['', 'A'])).toEqual([
      { fileName: '.png', value: null },
      { fileName: ' .png', value: null },
    ]);
  });
});
