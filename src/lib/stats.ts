import type { Row } from './types';

export interface ColumnStats {
  column: string;
  /** Number of non-empty values considered. */
  count: number;
  empty: number;
  shortest: string;
  median: string;
  longest: string;
  minLen: number;
  medianLen: number;
  maxLen: number;
}

/** Visible character count (code points, so emoji / accented letters count once). */
export function textLength(s: string): number {
  return [...s].length;
}

/**
 * For one column, find the shortest, median and longest value by character count.
 * Median is the middle value of all values sorted by length (upper median for even counts).
 */
export function columnStats(rows: Row[], column: string, ignoreEmpty = true): ColumnStats {
  const all = rows.map((r) => (r[column] ?? '').trim());
  const nonEmpty = all.filter((v) => v.length > 0);
  const empty = all.length - nonEmpty.length;
  let values = ignoreEmpty ? nonEmpty : all;
  // `count` = how many real values were considered (0 when the column is entirely empty).
  const count = values.length === 0 ? 0 : values.length;
  if (values.length === 0) values = all; // every cell empty → fall back to the empties
  if (values.length === 0) {
    return { column, count: 0, empty, shortest: '', median: '', longest: '', minLen: 0, medianLen: 0, maxLen: 0 };
  }
  const sorted = [...values].sort((a, b) => textLength(a) - textLength(b) || a.localeCompare(b));
  const shortest = sorted[0];
  const longest = sorted[sorted.length - 1];
  const median = sorted[Math.floor(sorted.length / 2)];
  return {
    column,
    count,
    empty,
    shortest,
    median,
    longest,
    minLen: textLength(shortest),
    medianLen: textLength(median),
    maxLen: textLength(longest),
  };
}

export interface ExtremeRows {
  shortest: Row;
  median: Row;
  longest: Row;
  stats: ColumnStats[];
}

/**
 * Build three synthetic rows: each column independently takes its shortest /
 * median / longest value. Columns not in `columns` are left as empty strings.
 */
export function extremeRows(rows: Row[], columns: string[], ignoreEmpty = true): ExtremeRows {
  const shortest: Row = {};
  const median: Row = {};
  const longest: Row = {};
  const stats: ColumnStats[] = [];
  for (const col of columns) {
    const s = columnStats(rows, col, ignoreEmpty);
    stats.push(s);
    shortest[col] = s.shortest;
    median[col] = s.median;
    longest[col] = s.longest;
  }
  return { shortest, median, longest, stats };
}
