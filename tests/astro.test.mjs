import test from 'node:test';
import assert from 'node:assert/strict';
import {
  formatRa, formatDec, formatDistance, formatMagnitude, starTitle, starSubtitle,
  bayerLabel, constellationZh, spectralLabel, skyChartSvg, starFieldSvg,
} from '../scripts/lib/astro.mjs';

test('赤经 / 赤纬格式化（天狼星实测值）', () => {
  assert.equal(formatRa(101.287155), '06h 45m 09s');
  assert.equal(formatDec(-16.716116), '−16° 42′ 58″');
  assert.equal(formatRa(279.234735), '18h 36m 56s');
  assert.equal(formatDec(38.783692), '+38° 47′ 01″');
});

test('星等 / 距离格式化', () => {
  assert.equal(formatMagnitude(-1.44), '-1.44 等');
  assert.equal(formatDistance(8.6), '8.6 光年');
  assert.equal(formatDistance(309.2), '309 光年');
  assert.equal(formatDistance(1200), '1,200 光年');
});

test('恒星名称与命名展示', () => {
  assert.equal(starTitle({ id: 'HIP-32349', proper_name: 'Sirius' }), '天狼星');
  assert.equal(starTitle({ id: 'HIP-1', proper_name: null }), 'HIP-1');
  assert.equal(bayerLabel('Alp'), 'α');
  assert.equal(bayerLabel('Alp-1'), 'Alp-1');
  assert.equal(constellationZh('CMa'), '大犬座');
  assert.equal(spectralLabel('G2V'), '黄色星（类太阳）');
  const subtitle = starSubtitle({ id: 'HIP-32349', proper_name: 'Sirius', constellation: 'CMa', bayer: 'Alp', hd: 48915 });
  assert.ok(subtitle.includes('大犬座 α'));
  assert.ok(subtitle.includes('天狼星'));
  assert.ok(subtitle.includes('HD 48915'));
});

test('星图 SVG 包含坐标网格与恒星标记', () => {
  const svg = skyChartSvg({ id: 'HIP-91262', proper_name: 'Vega', ra: 279.234735, dec: 38.783692 });
  assert.ok(svg.startsWith('<svg'));
  assert.ok(svg.includes('18h'));
  assert.ok(svg.includes('织女星'));
  assert.ok(svg.includes('circle'));
});

test('星空背景由 slug 决定，渲染可复现', () => {
  assert.equal(starFieldSvg('abc'), starFieldSvg('abc'));
  assert.notEqual(starFieldSvg('abc'), starFieldSvg('abd'));
});
