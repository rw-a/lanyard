import { expect, test } from '@playwright/test';
import { columnStats, extremeRows, textLength } from '../../src/lib/stats';
import type { Row } from '../../src/lib/types';

const rows: Row[] = [
  { Name: 'Li Wu', Cabin: 'Cabin 3', Note: '' },
  { Name: 'Amara Okafor-Blackwood', Cabin: 'Lakeside Lodge – Upper Floor', Note: 'Vegetarian' },
  { Name: 'Sam Hill', Cabin: 'Tent 12', Note: '' },
  { Name: 'Kai', Cabin: 'Cabin 7', Note: 'Vegan' },
  { Name: 'Priya Raman', Cabin: 'Cabin 3', Note: '' },
];

test.describe('textLength', () => {
  test('counts code points, not UTF-16 units', () => {
    expect(textLength('abc')).toBe(3);
    expect(textLength('Zoë')).toBe(3);
    expect(textLength('👩‍🚒')).toBeGreaterThanOrEqual(1);
    expect(textLength('𝔘𝔫𝔦')).toBe(3); // astral-plane letters are 2 UTF-16 units each
    expect(textLength('')).toBe(0);
  });
});

test.describe('columnStats', () => {
  test('finds shortest, median and longest by character count', () => {
    const s = columnStats(rows, 'Name');
    expect(s.shortest).toBe('Kai');
    expect(s.longest).toBe('Amara Okafor-Blackwood');
    // lengths sorted: Kai(3) Li Wu(5) Sam Hill(8) Priya Raman(11) Amara…(22) → upper median = Sam Hill
    expect(s.median).toBe('Sam Hill');
    expect(s.minLen).toBe(3);
    expect(s.medianLen).toBe(8);
    expect(s.maxLen).toBe(22);
    expect(s.count).toBe(5);
    expect(s.empty).toBe(0);
  });

  test('upper median is used for an even number of values', () => {
    const s = columnStats(rows.slice(0, 4), 'Name');
    // Kai(3) Li Wu(5) | Sam Hill(8) Amara(22) → index 2 → Sam Hill
    expect(s.median).toBe('Sam Hill');
  });

  test('ties are broken alphabetically so results are deterministic', () => {
    const tie: Row[] = [{ A: 'bb' }, { A: 'aa' }, { A: 'cc' }];
    const s = columnStats(tie, 'A');
    expect(s.shortest).toBe('aa');
    expect(s.longest).toBe('cc');
  });

  test('ignores empty cells by default but counts them', () => {
    const s = columnStats(rows, 'Note');
    expect(s.empty).toBe(3);
    expect(s.count).toBe(2);
    expect(s.shortest).toBe('Vegan');
    expect(s.longest).toBe('Vegetarian');
  });

  test('includes empty cells as the shortest value when asked', () => {
    const s = columnStats(rows, 'Note', false);
    expect(s.shortest).toBe('');
    expect(s.minLen).toBe(0);
    expect(s.count).toBe(5);
    expect(s.longest).toBe('Vegetarian');
  });

  test('falls back to empty strings when every cell is empty', () => {
    const s = columnStats([{ A: '' }, { A: '  ' }], 'A');
    expect(s.shortest).toBe('');
    expect(s.median).toBe('');
    expect(s.longest).toBe('');
    expect(s.empty).toBe(2);
  });

  test('handles a column that does not exist', () => {
    const s = columnStats(rows, 'Nope');
    expect(s.count).toBe(0);
    expect(s.shortest).toBe('');
  });

  test('handles no rows at all', () => {
    const s = columnStats([], 'Name');
    expect(s).toMatchObject({ count: 0, empty: 0, shortest: '', median: '', longest: '', minLen: 0, maxLen: 0 });
  });
});

test.describe('extremeRows', () => {
  test('builds three synthetic rows, each column chosen independently', () => {
    const r = extremeRows(rows, ['Name', 'Cabin']);
    expect(r.shortest).toEqual({ Name: 'Kai', Cabin: 'Cabin 3' });
    expect(r.longest).toEqual({ Name: 'Amara Okafor-Blackwood', Cabin: 'Lakeside Lodge – Upper Floor' });
    expect(r.median.Name).toBe('Sam Hill');
    expect(r.stats.map((s) => s.column)).toEqual(['Name', 'Cabin']);
  });

  test('the longest row may combine values from different people', () => {
    const r = extremeRows(rows, ['Name', 'Note']);
    // Longest name is Amara's, longest note is also Amara's — but shortest name (Kai) has note "Vegan"
    expect(r.longest).toEqual({ Name: 'Amara Okafor-Blackwood', Note: 'Vegetarian' });
    expect(r.shortest).toEqual({ Name: 'Kai', Note: 'Vegan' });
  });

  test('is empty for no columns', () => {
    const r = extremeRows(rows, []);
    expect(r.shortest).toEqual({});
    expect(r.stats).toEqual([]);
  });
});
