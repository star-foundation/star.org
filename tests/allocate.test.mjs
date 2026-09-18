import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { createSandbox, runScript, readJson } from './helpers.mjs';

test('TC-ALLOC-01 正常分配一颗可用恒星并写回 assigned', () => {
  const sandbox = createSandbox({ availableStars: 3, poolSize: 5 });
  try {
    const result = runScript('allocate.mjs', [], {
      sandbox,
      input: JSON.stringify({ display_name: 'For Anna', email: 'a@example.com' }),
    });
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.json.status, 'allocated');
    const pool = readJson(sandbox.poolFile);
    const star = pool.stars.find((item) => item.id === result.json.star_id);
    assert.equal(star.status, 'assigned');
    assert.equal(star.assigned_slug, result.json.slug);
    const record = readJson(path.join(sandbox.registrations, `${result.json.slug}.json`));
    assert.equal(record.star_id, star.id);
    assert.equal(record.owner_display_name, 'For Anna');
  } finally {
    sandbox.cleanup();
  }
});

test('TC-ALLOC-02 连续两笔独立订单分配到不同恒星', () => {
  const sandbox = createSandbox({ availableStars: 3, poolSize: 5 });
  try {
    const first = runScript('allocate.mjs', [], { sandbox, input: JSON.stringify({ display_name: 'A' }) });
    const second = runScript('allocate.mjs', [], { sandbox, input: JSON.stringify({ display_name: 'B' }) });
    assert.equal(first.json.status, 'allocated');
    assert.equal(second.json.status, 'allocated');
    assert.notEqual(first.json.star_id, second.json.star_id);
    assert.notEqual(first.json.slug, second.json.slug);
    const pool = readJson(sandbox.poolFile);
    assert.equal(pool.stars.filter((s) => s.status === 'assigned').length, 2 + 2); // 2 笔新登记 + 2 条预置
  } finally {
    sandbox.cleanup();
  }
});

test('TC-ALLOC-04 候选库售罄时进入异常处理，不生成分配记录', () => {
  const sandbox = createSandbox({ availableStars: 0, poolSize: 3 });
  try {
    const before = readdirSync(sandbox.registrations).length;
    const result = runScript('allocate.mjs', [], { sandbox, input: JSON.stringify({ display_name: 'Anna' }) });
    assert.equal(result.status, 3, '售罄应返回退出码 3');
    assert.equal(result.json.status, 'sold_out');
    assert.equal(readdirSync(sandbox.registrations).length, before, '不得新增登记记录');
  } finally {
    sandbox.cleanup();
  }
});

test('TC-ALLOC-05 slug 唯一性（含确定性 slug 与随机 slug）', () => {
  const sandbox = createSandbox({ availableStars: 20, poolSize: 22 });
  try {
    const slugs = new Set();
    for (let i = 0; i < 12; i += 1) {
      const result = runScript('allocate.mjs', [], {
        sandbox,
        input: JSON.stringify({ display_name: `user${i}` }),
      });
      assert.equal(result.json.status, 'allocated', result.stderr);
      slugs.add(result.json.slug);
    }
    assert.equal(slugs.size, 12, 'slug 不得重复');
    for (const slug of slugs) assert.match(slug, /^[0-9abcdefghjkmnpqrstvwxyz]{10}$/);
  } finally {
    sandbox.cleanup();
  }
});

test('TC-ERR-04 同一订单重复触发不会分配第二颗星（幂等）', () => {
  const sandbox = createSandbox({ availableStars: 3, poolSize: 5 });
  try {
    const payload = JSON.stringify({ order_id: 'LS-777', display_name: 'Anna', email: 'a@example.com' });
    const first = runScript('allocate.mjs', [], { sandbox, input: payload });
    const second = runScript('allocate.mjs', [], { sandbox, input: payload });
    assert.equal(first.json.status, 'allocated');
    assert.equal(second.json.status, 'replay');
    assert.equal(second.json.slug, first.json.slug);
    const pool = readJson(sandbox.poolFile);
    assert.equal(pool.stars.filter((s) => s.status === 'assigned' && s.assigned_slug === first.json.slug).length, 1);
  } finally {
    sandbox.cleanup();
  }
});

test('订单信息非法时拒绝执行', () => {
  const sandbox = createSandbox({ availableStars: 2, poolSize: 3 });
  try {
    const result = runScript('allocate.mjs', [], { sandbox, input: JSON.stringify({ email: 'a@example.com' }) });
    assert.equal(result.status, 4);
    assert.match(result.stderr, /缺少登记人姓名/);
  } finally {
    sandbox.cleanup();
  }
});
