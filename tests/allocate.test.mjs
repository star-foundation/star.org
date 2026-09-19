import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { createSandbox, runScript, readJson } from './helpers.mjs';
import { pickRandomAvailable } from '../scripts/lib/pool.mjs';
import { deterministicDigest } from '../scripts/lib/slug.mjs';

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
    assert.equal(pool.stars.filter((s) => s.status === 'assigned').length, 2 + 2); // 2 笔新认领 + 2 条预置
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
    assert.equal(readdirSync(sandbox.registrations).length, before, '不得新增认领记录');
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

test('TC-ALLOC-06 分配为均匀随机，不再按亮度优先', () => {
  const sandbox = createSandbox({ availableStars: 8, poolSize: 8 });
  try {
    // 候选库按亮度排列，因此"按亮度优先"会让抽取顺序与候选库顺序完全一致
    const catalogOrder = readJson(sandbox.poolFile).stars.map((star) => star.id);
    const picks = [];
    for (let index = 0; index < catalogOrder.length; index += 1) {
      const result = runScript('allocate.mjs', [], {
        sandbox,
        input: JSON.stringify({ order_id: `LS-RANDOM-${index}`, display_name: `User ${index}` }),
      });
      assert.equal(result.json.status, 'allocated', result.stderr);
      picks.push(result.json.star_id);
    }
    assert.equal(new Set(picks).size, picks.length, `出现重复分配：${picks.join(', ')}`);
    assert.notDeepEqual(picks, catalogOrder, '抽取顺序与候选库亮度顺序一致，疑似仍在按亮度分配');
  } finally {
    sandbox.cleanup();
  }
});

test('TC-ALLOC-07 同一订单号在相同候选库状态下抽到同一颗星（派生种子确定性）', () => {
  const first = createSandbox({ availableStars: 4, poolSize: 6 });
  const second = createSandbox({ availableStars: 4, poolSize: 6 });
  try {
    const payload = JSON.stringify({ order_id: 'LS-DETERMINISTIC-1', display_name: 'Anna' });
    const a = runScript('allocate.mjs', [], { sandbox: first, input: payload });
    const b = runScript('allocate.mjs', [], { sandbox: second, input: payload });
    assert.equal(a.json.status, 'allocated', a.stderr);
    assert.equal(b.json.status, 'allocated', b.stderr);
    assert.equal(a.json.slug, b.json.slug);
    assert.equal(a.json.star_id, b.json.star_id, '同一订单号在相同候选库状态下抽到了不同的星');
  } finally {
    first.cleanup();
    second.cleanup();
  }
});

test('TC-ALLOC-08 抽取在候选库上分布均匀（派生种子不引入可见偏差）', () => {
  const stars = Array.from({ length: 800 }, (_, index) => ({ id: `S-${index}` }));
  const indexById = new Map(stars.map((star, index) => [star.id, index]));
  const counts = new Array(stars.length).fill(0);
  const rounds = 80_000;
  for (let index = 0; index < rounds; index += 1) {
    const digest = deterministicDigest(`LS-UNIFORM-${index}`, 'test-secret');
    counts[indexById.get(pickRandomAvailable(stars, { digest }).id)] += 1;
  }
  // 分十档核对：48 bit 取模的偏差量级约 1e-12，正常应落在期望值 ±3% 内，
  // 这里放宽到 ±15%，只用来抓住"取模写错/低位截断"这类明显偏差。
  const perDecile = rounds / 10;
  for (let decile = 0; decile < 10; decile += 1) {
    const bucket = counts.slice(decile * 80, (decile + 1) * 80).reduce((sum, n) => sum + n, 0);
    assert.ok(
      Math.abs(bucket - perDecile) < perDecile * 0.15,
      `第 ${decile} 档计数 ${bucket}，偏离期望 ${perDecile} 过多`,
    );
  }
});

test('订单信息非法时拒绝执行', () => {
  const sandbox = createSandbox({ availableStars: 2, poolSize: 3 });
  try {
    const result = runScript('allocate.mjs', [], { sandbox, input: JSON.stringify({ email: 'a@example.com' }) });
    assert.equal(result.status, 4);
    assert.match(result.stderr, /缺少认领人姓名/);
  } finally {
    sandbox.cleanup();
  }
});
