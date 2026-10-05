import Papa from 'papaparse';
import type { Dataset, Row } from './types';

export interface ParseResult {
  dataset: Dataset;
  warnings: string[];
}

/** Parse CSV text (comma, semicolon or tab separated – auto-detected). First row = headers. */
export function parseCsv(text: string, fileName = 'data.csv'): ParseResult {
  // Strip a UTF-8 BOM that Excel likes to add.
  const clean = text.replace(/^﻿/, '');
  const res = Papa.parse<string[]>(clean, {
    skipEmptyLines: 'greedy',
    delimitersToGuess: [',', ';', '\t', '|'],
  });
  const warnings: string[] = [];
  for (const e of res.errors.slice(0, 5)) {
    warnings.push(`Row ${e.row ?? '?'}: ${e.message}`);
  }
  const data = res.data;
  if (data.length === 0) {
    return { dataset: { fileName, headers: [], rows: [] }, warnings: ['The file is empty.'] };
  }

  // Header row — make names unique and non-empty.
  const seen = new Map<string, number>();
  const headers = data[0].map((raw, i) => {
    let h = (raw ?? '').trim() || `Column ${i + 1}`;
    const n = seen.get(h) ?? 0;
    seen.set(h, n + 1);
    if (n > 0) h = `${h} (${n + 1})`;
    return h;
  });

  const rows: Row[] = [];
  for (let i = 1; i < data.length; i++) {
    const cells = data[i];
    if (cells.every((c) => (c ?? '').trim() === '')) continue;
    const row: Row = {};
    headers.forEach((h, j) => {
      row[h] = (cells[j] ?? '').trim();
    });
    if (cells.length > headers.length) {
      warnings.push(`Row ${i + 1} has ${cells.length} cells but there are ${headers.length} headers; extra cells ignored.`);
    }
    rows.push(row);
  }
  if (rows.length === 0) warnings.push('No data rows found below the header.');
  return { dataset: { fileName, headers, rows }, warnings: dedupe(warnings).slice(0, 8) };
}

function dedupe<T>(xs: T[]): T[] {
  return [...new Set(xs)];
}

export function readFileAsText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result ?? ''));
    r.onerror = () => reject(r.error ?? new Error('Could not read file'));
    r.readAsText(file);
  });
}

export function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result ?? ''));
    r.onerror = () => reject(r.error ?? new Error('Could not read file'));
    r.readAsDataURL(file);
  });
}

/** A roster with deliberately varied value lengths so the min/median/max previews are meaningful. */
export const SAMPLE_CSV = `Name,Accommodation,Group,Role,Dietary,Emergency contact
Li Wu,Cabin 3,Otters,Camper,,Mei Wu 555-0101
Amara Okafor-Blackwood,Lakeside Lodge – Upper Floor,Falcons,Camper,Vegetarian,Chidi Okafor 555-0102
Sam Hill,Tent 12,Bears,Camper,Nut allergy,Jo Hill 555-0103
Maximilian Alexander von Habsburg-Lothringen,Cabin 7,Eagles,Camper,Gluten free,Anna von Habsburg 555-0104
Priya Raman,Cabin 3,Otters,Junior Leader,,Ravi Raman 555-0105
Jo Park,Tent 4,Wolves,Camper,Vegan,Min Park 555-0106
Isabella Fernández García,Lakeside Lodge – Ground Floor,Falcons,Camper,,Carlos Fernández 555-0107
Tom Reed,Cabin 1,Bears,Leader,Lactose intolerant,Sue Reed 555-0108
Oluwaseun Adebayo,Tent 12,Eagles,Camper,Halal,Funmi Adebayo 555-0109
Eve Lee,Cabin 7,Wolves,Camper,,Dan Lee 555-0110
Christopher Montgomery-Richardson,Hilltop Bunkhouse,Otters,Camper,Vegetarian,Patricia Richardson 555-0111
Ana Cruz,Cabin 1,Bears,Camper,,Luis Cruz 555-0112
Nguyen Thi Minh Khai,Tent 4,Falcons,Camper,Shellfish allergy,Nguyen Van An 555-0113
Zoë Byrne,Hilltop Bunkhouse,Eagles,Camper,,Sean Byrne 555-0114
Kai,Cabin 3,Wolves,Camper,Vegan,Ren 555-0115
Benjamin Oyelaran-Whitfield,Lakeside Lodge – Upper Floor,Otters,Junior Leader,,Grace Whitfield 555-0116
Mia Chen,Tent 12,Bears,Camper,Egg allergy,Wei Chen 555-0117
Alexander Papadopoulos,Cabin 7,Falcons,Camper,,Eleni Papadopoulou 555-0118
Rosa Díaz,Hilltop Bunkhouse,Eagles,Leader,Vegetarian,Marco Díaz 555-0119
Finn O'Sullivan,Tent 4,Wolves,Camper,,Niamh O'Sullivan 555-0120
Harriet Featherstonehaugh,Lakeside Lodge – Ground Floor,Otters,Camper,Kosher,George Featherstonehaugh 555-0121
Dev Patel,Cabin 1,Bears,Camper,,Asha Patel 555-0122
Sofia Rossi,Tent 12,Falcons,Camper,Nut allergy,Giulia Rossi 555-0123
Noah Smith,Cabin 3,Eagles,Camper,,Emma Smith 555-0124
Camp Director,Main Office,Staff,Director,,Site Manager 555-0100
`;
