import { expect, test } from '@playwright/test';
import { SAMPLE_CSV, parseCsv } from '../../src/lib/csv';

test.describe('parseCsv', () => {
  test('parses a simple comma-separated file', () => {
    const { dataset, warnings } = parseCsv('Name,Cabin\nAda,3\nBob,7\n', 'x.csv');
    expect(dataset.fileName).toBe('x.csv');
    expect(dataset.headers).toEqual(['Name', 'Cabin']);
    expect(dataset.rows).toEqual([
      { Name: 'Ada', Cabin: '3' },
      { Name: 'Bob', Cabin: '7' },
    ]);
    expect(warnings).toEqual([]);
  });

  test('auto-detects semicolon and tab delimiters', () => {
    expect(parseCsv('A;B\n1;2\n').dataset.rows).toEqual([{ A: '1', B: '2' }]);
    expect(parseCsv('A\tB\n1\t2\n').dataset.rows).toEqual([{ A: '1', B: '2' }]);
  });

  test('strips a UTF-8 BOM from the first header', () => {
    const { dataset } = parseCsv('﻿Name,Cabin\nAda,3\n');
    expect(dataset.headers[0]).toBe('Name');
  });

  test('keeps delimiters inside quoted fields', () => {
    const { dataset } = parseCsv('Name,Cabin\n"Lovelace, Ada","Lodge; Room 2"\n');
    expect(dataset.rows[0]).toEqual({ Name: 'Lovelace, Ada', Cabin: 'Lodge; Room 2' });
  });

  test('trims whitespace in headers and cells', () => {
    const { dataset } = parseCsv(' Name , Cabin \n  Ada  ,  3 \n');
    expect(dataset.headers).toEqual(['Name', 'Cabin']);
    expect(dataset.rows[0]).toEqual({ Name: 'Ada', Cabin: '3' });
  });

  test('makes blank and duplicate headers unique', () => {
    const { dataset } = parseCsv('Name,,Name,Name\n1,2,3,4\n');
    expect(dataset.headers).toEqual(['Name', 'Column 2', 'Name (2)', 'Name (3)']);
    expect(dataset.rows[0]).toEqual({ Name: '1', 'Column 2': '2', 'Name (2)': '3', 'Name (3)': '4' });
  });

  test('fills missing trailing cells with empty strings and skips blank lines', () => {
    const { dataset } = parseCsv('A,B,C\n1,2\n\n   \n4,5,6\n');
    expect(dataset.rows).toEqual([
      { A: '1', B: '2', C: '' },
      { A: '4', B: '5', C: '6' },
    ]);
  });

  test('warns about rows with more cells than headers', () => {
    const { dataset, warnings } = parseCsv('A,B\n1,2,3\n');
    expect(dataset.rows).toEqual([{ A: '1', B: '2' }]);
    expect(warnings.join(' ')).toMatch(/Row 2 has 3 cells/);
  });

  test('warns when there are headers but no data', () => {
    const { dataset, warnings } = parseCsv('A,B\n');
    expect(dataset.headers).toEqual(['A', 'B']);
    expect(dataset.rows).toEqual([]);
    expect(warnings.join(' ')).toMatch(/No data rows/);
  });

  test('handles an empty file', () => {
    const { dataset, warnings } = parseCsv('');
    expect(dataset.headers).toEqual([]);
    expect(dataset.rows).toEqual([]);
    expect(warnings.join(' ')).toMatch(/empty/i);
  });

  test('handles Windows line endings', () => {
    const { dataset } = parseCsv('A,B\r\n1,2\r\n3,4\r\n');
    expect(dataset.rows).toHaveLength(2);
    expect(dataset.rows[1]).toEqual({ A: '3', B: '4' });
  });

  test('the bundled sample roster parses to 25 people with varied name lengths', () => {
    const { dataset, warnings } = parseCsv(SAMPLE_CSV, 'sample.csv');
    expect(warnings).toEqual([]);
    expect(dataset.rows).toHaveLength(25);
    expect(dataset.headers).toEqual(['Name', 'Accommodation', 'Group', 'Role', 'Dietary', 'Emergency contact']);
    const lengths = dataset.rows.map((r) => r.Name.length);
    expect(Math.min(...lengths)).toBeLessThan(5);
    expect(Math.max(...lengths)).toBeGreaterThan(40);
  });
});
