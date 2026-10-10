import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { parseTemplate } from '../../src/lib/template-migrations';
import { defaultTemplate, imageUrl, isAssetRef, newTextElement } from '../../src/lib/template';
import { planPrint } from '../../src/lib/print-plan';
import type { ImageElement, Template } from '../../src/lib/types';

/** Templates exactly as earlier versions of the app saved them. */
const fixture = (version: 1 | 2) => JSON.parse(readFileSync(new URL(`../fixtures/template-v${version}.json`, import.meta.url), 'utf8'));

function parsed(raw: unknown): Template {
  const r = parseTemplate(raw);
  if (!r.ok) throw new Error(r.error);
  return r.template;
}

test.describe('legacy templates', () => {
  for (const version of [1, 2] as const) {
    test(`a real version ${version} file becomes a one-sided version 3 template with the same front`, () => {
      const legacy = fixture(version);
      const r = parseTemplate(legacy);
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      expect(r.changed).toBe(true);
      const t = r.template;
      expect(t.version).toBe(3);
      expect(t.sidedness).toBe('single');
      expect(t.sides.back).toBeNull();
      expect(t).not.toHaveProperty('name');
      expect(t).not.toHaveProperty('elements');
      expect(t.card).toEqual({ width: legacy.card.width, height: legacy.card.height, borderRadius: legacy.card.borderRadius });
      expect(t.sides.front.bg).toBe(legacy.card.bg);
      expect(t.page).toEqual({ ...legacy.page, printMethod: 'cutouts' });
      // Every element and property survives (pictures become asset references)
      expect(t.sides.front.elements.map((e) => e.id)).toEqual(legacy.elements.map((e: { id: string }) => e.id));
      for (const [i, el] of t.sides.front.elements.entries()) {
        const before = legacy.elements[i];
        if (el.kind !== 'image') {
          expect(el).toEqual(before);
          continue;
        }
        // Pictures are compared by content below; everything else is untouched.
        const { src: _src, imageRule: _rule, ...rest } = el;
        const { src: _beforeSrc, imageRule: _beforeRule, ...beforeRest } = before;
        expect(rest).toEqual({ srcColumn: null, ...beforeRest });
      }
      expect(isAssetRef(t.sides.front.bgImage)).toBe(true);
      expect(imageUrl(t.assets, t.sides.front.bgImage)).toBe(version === 2 ? legacy.assets[Object.keys(legacy.assets)[0]] : legacy.card.bgImage);
      expect(Object.keys(t.assets)).toHaveLength(1); // the same picture used three times is stored once
      for (const el of t.sides.front.elements.filter((e): e is ImageElement => e.kind === 'image')) {
        if (el.src) expect(isAssetRef(el.src)).toBe(true);
      }
    });

    test(`version ${version} migration is idempotent and survives an export/import round trip`, () => {
      const once = parsed(fixture(version));
      const again = parseTemplate(JSON.parse(JSON.stringify(once)));
      expect(again.ok).toBe(true);
      if (!again.ok) return;
      expect(again.changed).toBe(false);
      expect(again.template).toEqual(once);
    });
  }

  test('copies of 1, 2 and more are kept and never mean double-sided', () => {
    for (const copies of [1, 2, 5]) {
      const legacy = { ...fixture(2), page: { ...fixture(2).page, copies } };
      const t = parsed(legacy);
      expect(t.page.copies).toBe(copies);
      expect(t.sidedness).toBe('single');
    }
  });

  test('a migrated template prints the same number of cards on the same sheets as before', () => {
    const legacy = fixture(2); // 95 × 140 card, 6 mm margin, 2 copies
    const t = parsed(legacy);
    const rows = Array.from({ length: 25 }, (_, i) => i);
    const plan = planPrint(t, rows);
    expect(plan.mode).toBe('single');
    expect(plan.badgeCount).toBe(50);
    expect(plan.printedFaceCount).toBe(50);
    expect(plan.physicalSheetCount).toBe(13); // ceil(50 / 4), exactly what the old Row[][] chunking gave
    expect(plan.pages.every((p) => p.placements.every((f) => f.side === 'front'))).toBe(true);
  });

  test('missing optional image fields get their documented defaults', () => {
    const legacy = fixture(2);
    const logo = legacy.elements.find((e: { kind: string }) => e.kind === 'image');
    delete logo.imageRule;
    delete logo.srcColumn;
    const t = parsed(legacy);
    const img = t.sides.front.elements.find((e) => e.kind === 'image') as ImageElement;
    expect(img.imageRule).toBeNull();
    expect(img.srcColumn).toBeNull();
  });
});

test.describe('version 3', () => {
  function v3(): Template {
    const t = defaultTemplate(['Name']);
    t.sidedness = 'different';
    t.sides.back = { bg: '#123456', bgImage: null, elements: [newTextElement({ name: 'Back' })] };
    t.page.printMethod = 'duplex';
    return t;
  }

  test('a valid template reads back unchanged', () => {
    const t = v3();
    const r = parseTemplate(structuredClone(t));
    expect(r).toEqual({ ok: true, template: t, changed: false });
  });

  test('a retained back is kept in every mode', () => {
    for (const mode of ['single', 'same', 'different'] as const) {
      const t = { ...v3(), sidedness: mode };
      expect(parsed(t).sides.back).toEqual(t.sides.back);
    }
  });

  test('invalid modes, missing required sides and broken geometry are rejected', () => {
    const cases: [string, (t: Record<string, any>) => void][] = [
      ['unknown sidedness', (t) => (t.sidedness = 'triple')],
      ['different without a back', (t) => (t.sides.back = null)],
      ['missing front', (t) => delete t.sides.front],
      ['front without layers', (t) => delete t.sides.front.elements],
      ['malformed back', (t) => (t.sides.back = 'nope')],
      ['non-finite width', (t) => (t.card.width = 'wide')],
      ['zero height', (t) => (t.card.height = 0)],
      ['element without id', (t) => delete t.sides.front.elements[0].id],
      ['element with unknown kind', (t) => (t.sides.back.elements[0].kind = 'video')],
      ['element with NaN position', (t) => (t.sides.front.elements[0].x = null)],
      ['no page settings', (t) => delete t.page],
    ];
    for (const [what, breakIt] of cases) {
      const t = structuredClone(v3()) as unknown as Record<string, any>;
      breakIt(t);
      const r = parseTemplate(t);
      expect(r.ok, what).toBe(false);
      if (!r.ok) expect(r.reason, what).toBe('invalid');
    }
  });

  test('an unknown print method falls back to the default', () => {
    const t = structuredClone(v3()) as unknown as Record<string, any>;
    t.page.printMethod = 'telepathy';
    const r = parseTemplate(t);
    expect(r.ok && r.template.page.printMethod).toBe('cutouts');
    expect(r.ok && r.changed).toBe(true);
  });

  test('duplicate element ids across sides are repaired so ids stay unique', () => {
    const t = v3();
    t.sides.back!.elements[0].id = t.sides.front.elements[0].id;
    const r = parseTemplate(t);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.changed).toBe(true);
    const ids = [...r.template.sides.front.elements, ...r.template.sides.back!.elements].map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(r.template.sides.front.elements[0].id).toBe(t.sides.front.elements[0].id); // the front keeps its id
  });

  test('pictures used only by a retained back are not pruned', () => {
    const t = v3();
    t.sidedness = 'single';
    t.assets = { keep: 'data:image/png;base64,KEEP', drop: 'data:image/png;base64,DROP' };
    t.sides.back!.bgImage = 'asset:keep';
    const out = parsed(t);
    expect(Object.keys(out.assets)).toEqual(['keep']);
  });
});

test.describe('unreadable input', () => {
  test('non-templates are invalid', () => {
    for (const raw of [null, 42, 'x', [], {}, { version: 2 }, { version: 2, card: {}, page: {}, elements: [] }, { version: '3' }]) {
      const r = parseTemplate(raw);
      expect(r.ok, JSON.stringify(raw)).toBe(false);
      if (!r.ok) expect(r.reason).toBe('invalid');
    }
  });

  test('a newer format is reported as such, never downgraded', () => {
    const r = parseTemplate({ ...defaultTemplate(), version: 4 });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.reason).toBe('future');
      expect(r.error).toMatch(/newer version/);
    }
  });

  test('parsing never mutates its input', () => {
    const legacy = fixture(1);
    const before = JSON.stringify(legacy);
    parseTemplate(legacy);
    expect(JSON.stringify(legacy)).toBe(before);
  });
});
