import { expect, test } from '@playwright/test';
import {
  ASSET_PREFIX,
  assetBytes,
  defaultTemplate,
  hashString,
  imageRefsIn,
  imageUrl,
  internAllImages,
  internAsset,
  isAssetRef,
  newImageElement,
  pruneAssets,
  unusedAssetIds,
} from '../../src/lib/template';
import type { AssetStore, Template } from '../../src/lib/types';
import { dataUrlBytes } from '../../src/lib/images';

const A = 'data:image/png;base64,AAAA';
const B = 'data:image/png;base64,BBBB';

test('dataUrlBytes accounts for base64 padding', () => {
  expect(dataUrlBytes('data:image/png;base64,YQ==')).toBe(1);
  expect(dataUrlBytes('data:image/png;base64,YWI=')).toBe(2);
  expect(dataUrlBytes('data:image/png;base64,YWJj')).toBe(3);
});

test.describe('hashString', () => {
  test('is stable, fixed-width hex and content-sensitive', () => {
    expect(hashString('hello')).toBe(hashString('hello'));
    expect(hashString('hello')).toMatch(/^[0-9a-f]{14}$/);
    expect(hashString('hello')).not.toBe(hashString('hellp'));
    expect(hashString('')).toMatch(/^[0-9a-f]{14}$/);
  });

  test('does not collide on a few thousand near-identical inputs', () => {
    const seen = new Set<string>();
    for (let i = 0; i < 5000; i++) seen.add(hashString(`data:image/png;base64,${i.toString(36).padStart(8, '0')}`));
    expect(seen.size).toBe(5000);
  });
});

test.describe('internAsset / imageUrl', () => {
  test('stores a data URL once and hands back the same reference for identical content', () => {
    const assets: AssetStore = {};
    const r1 = internAsset(assets, A);
    const r2 = internAsset(assets, A);
    const r3 = internAsset(assets, B);
    expect(r1).toBe(r2);
    expect(r1).not.toBe(r3);
    expect(isAssetRef(r1)).toBe(true);
    expect(Object.keys(assets)).toHaveLength(2);
    expect(imageUrl(assets, r1)).toBe(A);
    expect(imageUrl(assets, r3)).toBe(B);
  });

  test('leaves http URLs and empty values alone', () => {
    const assets: AssetStore = {};
    expect(internAsset(assets, 'https://example.com/x.png')).toBe('https://example.com/x.png');
    expect(internAsset(assets, '')).toBe('');
    expect(Object.keys(assets)).toHaveLength(0);
    expect(imageUrl(assets, 'https://example.com/x.png')).toBe('https://example.com/x.png');
    expect(imageUrl(assets, '')).toBe('');
    expect(imageUrl(assets, null)).toBe('');
    expect(imageUrl(undefined, `${ASSET_PREFIX}missing`)).toBe('');
  });

  test('a reference to a picture that is gone resolves to nothing rather than throwing', () => {
    expect(imageUrl({}, `${ASSET_PREFIX}deadbeef`)).toBe('');
  });

  test('survives a hash collision by suffixing the id', () => {
    const assets: AssetStore = {};
    const id = hashString(A);
    assets[id] = 'data:image/png;base64,SOMETHING_ELSE_WITH_THE_SAME_HASH';
    const ref = internAsset(assets, A);
    expect(ref).toBe(`${ASSET_PREFIX}${id}-1`);
    expect(assets[`${id}-1`]).toBe(A);
    // and again → reuses the suffixed slot
    expect(internAsset(assets, A)).toBe(ref);
    expect(Object.keys(assets)).toHaveLength(2);
  });
});

test.describe('references and pruning', () => {
  function withImages(): Template {
    const t = defaultTemplate(['Name', 'Group']);
    const a = internAsset(t.assets, A);
    const b = internAsset(t.assets, B);
    t.card.bgImage = a;
    t.elements.push(newImageElement({ src: a }));
    t.elements.push(newImageElement({ imageRule: { column: 'Group', map: { Bears: b, Lions: a }, fallback: b } }));
    return t;
  }

  test('imageRefsIn lists every place a picture is used', () => {
    const t = withImages();
    const refs = imageRefsIn(t);
    expect(refs).toHaveLength(5); // bg, fixed, Bears, Lions, fallback
    expect(new Set(refs).size).toBe(2);
  });

  test('unusedAssetIds / pruneAssets drop what nothing refers to', () => {
    const t = withImages();
    expect(unusedAssetIds(t)).toEqual([]);
    expect(pruneAssets(t)).toBe(0);
    // stop using B everywhere
    t.elements = t.elements.filter((e) => e.kind !== 'image' || !e.imageRule);
    const [bId] = Object.entries(t.assets).find(([, v]) => v === B)!;
    expect(unusedAssetIds(t)).toEqual([bId]);
    expect(pruneAssets(t)).toBe(1);
    expect(Object.values(t.assets)).toEqual([A]);
    expect(assetBytes(t.assets)).toBe(A.length);
  });

  test('internAllImages migrates inline data URLs (v1 templates) into the store, deduplicated', () => {
    const t = defaultTemplate(['Group']);
    (t as unknown as { version: number }).version = 1;
    t.card.bgImage = A;
    t.elements.push(newImageElement({ src: A }));
    t.elements.push(newImageElement({ src: 'https://example.com/logo.png' }));
    t.elements.push(newImageElement({ imageRule: { column: 'Group', map: { Bears: B, Lions: A }, fallback: B } }));
    internAllImages(t);
    expect(t.version).toBe(2);
    expect(Object.keys(t.assets)).toHaveLength(2);
    expect(imageUrl(t.assets, t.card.bgImage)).toBe(A);
    const imgs = t.elements.filter((e) => e.kind === 'image') as Extract<Template['elements'][number], { kind: 'image' }>[];
    expect(isAssetRef(imgs[0].src)).toBe(true);
    expect(imgs[1].src).toBe('https://example.com/logo.png');
    expect(imageUrl(t.assets, imgs[2].imageRule!.map.Bears)).toBe(B);
    expect(imageUrl(t.assets, imgs[2].imageRule!.fallback)).toBe(B);
    // idempotent
    const before = JSON.stringify(t);
    internAllImages(t);
    expect(JSON.stringify(t)).toBe(before);
  });
});
