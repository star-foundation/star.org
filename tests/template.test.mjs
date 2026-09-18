import test from 'node:test';
import assert from 'node:assert/strict';
import { render, escapeHtml } from '../scripts/lib/template.mjs';

test('变量替换默认转义 HTML', () => {
  assert.equal(render('你好 {{name}}', { name: '<b>Anna</b>' }), '你好 &lt;b&gt;Anna&lt;/b&gt;');
  assert.equal(render('{{html!}}', { html: '<b>ok</b>' }), '<b>ok</b>');
  assert.equal(escapeHtml('a & b "c"'), 'a &amp; b &quot;c&quot;');
});

test('条件区块与循环（含父级作用域回退）', () => {
  const tpl = '{{#if on}}开{{/if}}{{#unless on}}关{{/unless}}{{#each list}}[{{name}}:{{suffix}}]{{/each}}';
  assert.equal(render(tpl, { on: true, suffix: 'x', list: [{ name: 'a' }, { name: 'b' }] }), '开[a:x][b:x]');
  assert.equal(render(tpl, { on: false, list: [] }), '关');
});

test('嵌套条件区块正确闭合', () => {
  const tpl = '{{#if a}}A{{#if b}}B{{/if}}{{/if}}';
  assert.equal(render(tpl, { a: true, b: true }), 'AB');
  assert.equal(render(tpl, { a: true, b: false }), 'A');
  assert.equal(render(tpl, { a: false, b: true }), '');
});

test('缺失变量渲染为空，不产生 {{ 残留', () => {
  assert.equal(render('x{{missing}}y', {}), 'xy');
});
