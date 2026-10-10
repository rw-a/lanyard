import { expect, test } from '@playwright/test';
import {
  cloneSideDesign,
  createBlankSide,
  getDesignForSide,
  getPrintedSides,
  getStoredDesigns,
  getUsedDesigns,
  normalizeEditableSide,
  sideHasContent,
} from '../../src/lib/sides';
import { columnsUsedBy, columnsUsedByDesign, defaultTemplate, internAsset, newImageElement, newTextElement } from '../../src/lib/template';
import type { ImageElement, Sidedness, Template, TextElement } from '../../src/lib/types';

function withBack(mode: Sidedness): Template {
  const t = defaultTemplate(['Name', 'Accommodation', 'Group']);
  t.sides.back = { bg: '#000000', bgImage: null, elements: [newTextElement({ name: 'Back text', content: '{{Allergies}} {{Name}}' })] };
  t.sidedness = mode;
  return t;
}

test.describe('side resolvers', () => {
  test('truth table for every mode', () => {
    const single = withBack('single');
    const same = withBack('same');
    const different = withBack('different');

    expect(getPrintedSides(single)).toEqual(['front']);
    expect(getPrintedSides(same)).toEqual(['front', 'back']);
    expect(getPrintedSides(different)).toEqual(['front', 'back']);

    for (const t of [single, same, different]) expect(getDesignForSide(t, 'front')).toBe(t.sides.front);
    expect(getDesignForSide(single, 'back')).toBeNull(); // a saved back is not printed in single mode
    expect(getDesignForSide(same, 'back')).toBe(same.sides.front); // same mode reads the front, no copy
    expect(getDesignForSide(different, 'back')).toBe(different.sides.back);

    for (const t of [single, same, different]) expect(getStoredDesigns(t)).toEqual([t.sides.front, t.sides.back]);
    expect(getUsedDesigns(single)).toEqual([single.sides.front]);
    expect(getUsedDesigns(same)).toEqual([same.sides.front]); // not counted twice
    expect(getUsedDesigns(different)).toEqual([different.sides.front, different.sides.back]);
  });

  test('a template without a back stores and uses only the front', () => {
    const t = defaultTemplate();
    expect(t.sides.back).toBeNull();
    expect(getStoredDesigns(t)).toEqual([t.sides.front]);
    expect(getDesignForSide({ ...t, sidedness: 'same' }, 'back')).toBe(t.sides.front);
  });

  test('only different sides have an editable back', () => {
    expect(normalizeEditableSide(withBack('different'), 'back')).toBe('back');
    expect(normalizeEditableSide(withBack('same'), 'back')).toBe('front');
    expect(normalizeEditableSide(withBack('single'), 'back')).toBe('front');
    expect(normalizeEditableSide({ ...defaultTemplate(), sidedness: 'different' }, 'back')).toBe('front'); // no back stored
    expect(normalizeEditableSide(withBack('different'), 'front')).toBe('front');
  });
});

test.describe('cloning a side', () => {
  test('makes an independent deep copy with fresh ids that shares picture references', () => {
    const t = defaultTemplate(['Name', 'Group']);
    const pic = internAsset(t.assets, 'data:image/png;base64,AAAA');
    t.sides.front.bgImage = pic;
    t.sides.front.elements.push(newImageElement({ src: pic, imageRule: { column: 'Group', map: { Bears: pic }, fallback: pic } }));
    const name = t.sides.front.elements.find((e) => e.name === 'Name') as TextElement;
    name.colorRule = { column: 'Group', map: { Bears: '#111111' }, fallback: '#999999' };

    const copy = cloneSideDesign(t.sides.front);
    expect(copy.elements).toHaveLength(t.sides.front.elements.length);
    const frontIds = new Set(t.sides.front.elements.map((e) => e.id));
    for (const el of copy.elements) expect(frontIds.has(el.id)).toBe(false);
    expect(new Set(copy.elements.map((e) => e.id)).size).toBe(copy.elements.length);
    expect(copy.bgImage).toBe(pic);
    const img = copy.elements.find((e) => e.kind === 'image') as ImageElement;
    expect(img.src).toBe(pic);
    expect(img.imageRule!.map.Bears).toBe(pic);

    // Nested rule maps are not shared
    const copiedName = copy.elements.find((e) => e.name === 'Name') as TextElement;
    copiedName.colorRule!.map.Bears = '#ff0000';
    img.imageRule!.map.Lions = 'asset:other';
    copiedName.x = 99;
    expect(name.colorRule!.map.Bears).toBe('#111111');
    expect((t.sides.front.elements.find((e) => e.kind === 'image') as ImageElement).imageRule!.map).toEqual({ Bears: pic });
    expect(name.x).not.toBe(99);
  });

  test('a blank side is white, without picture or layers, and counts as empty', () => {
    expect(createBlankSide()).toEqual({ bg: '#ffffff', bgImage: null, elements: [] });
    expect(sideHasContent(createBlankSide())).toBe(false);
    expect(sideHasContent(null)).toBe(false);
    expect(sideHasContent({ ...createBlankSide(), bg: '#ff0000' })).toBe(true);
    expect(sideHasContent({ ...createBlankSide(), bgImage: 'asset:x' })).toBe(true);
    expect(sideHasContent({ ...createBlankSide(), elements: [newTextElement()] })).toBe(true);
  });
});

test.describe('columns across sides', () => {
  test('the union lists front columns first, then extra columns of an independent back', () => {
    const t = withBack('different');
    expect(columnsUsedByDesign(t.sides.back!)).toEqual(['Allergies', 'Name']);
    expect(columnsUsedBy(t)).toEqual(['Name', 'Accommodation', 'Group', 'Allergies']);
  });

  test('a saved back that is not in use contributes no columns', () => {
    expect(columnsUsedBy(withBack('single'))).toEqual(['Name', 'Accommodation', 'Group']);
    expect(columnsUsedBy(withBack('same'))).toEqual(['Name', 'Accommodation', 'Group']);
  });

  test('hidden layers still count, as before', () => {
    const t = withBack('different');
    t.sides.back!.elements[0].hidden = true;
    expect(columnsUsedBy(t)).toContain('Allergies');
  });
});
