import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { ROOT } from './helpers.mjs';

const pool = JSON.parse(readFileSync(path.join(ROOT, 'data', 'stars_pool.json'), 'utf8'));

test('TC-ALLOC 候选库结构：800 颗肉眼可见恒星，字段完整', () => {
  assert.ok(pool.stars.length >= 500 && pool.stars.length <= 1000, `候选库规模应在 500-1000，实际 ${pool.stars.length}`);
  const ids = new Set();
  for (const star of pool.stars) {
    assert.match(star.id, /^HIP-\d+$/);
    assert.ok(!ids.has(star.id), `恒星编号重复：${star.id}`);
    ids.add(star.id);
    assert.ok(Number.isFinite(star.ra) && star.ra >= 0 && star.ra < 360, `${star.id} 赤经越界：${star.ra}`);
    assert.ok(Number.isFinite(star.dec) && star.dec >= -90 && star.dec <= 90, `${star.id} 赤纬越界：${star.dec}`);
    assert.ok(Number.isFinite(star.magnitude) && star.magnitude <= 6.5, `${star.id} 视星等超出 6.5：${star.magnitude}`);
    assert.ok(Number.isFinite(star.distance_ly) && star.distance_ly > 0, `${star.id} 距离无效`);
    assert.ok(['available', 'assigned'].includes(star.status), `${star.id} 状态非法：${star.status}`);
  }
});

test('分配优先级：候选库按视星等从亮到暗排序（PRD 5.2）', () => {
  for (let i = 1; i < pool.stars.length; i += 1) {
    assert.ok(pool.stars[i].magnitude >= pool.stars[i - 1].magnitude, '候选库未按亮度排序');
  }
  assert.equal(pool.stars[0].proper_name, 'Sirius', '最亮的星应为天狼星');
});

test('真实天文数据抽样校验（对照已知数值）', () => {
  const byName = Object.fromEntries(pool.stars.filter((s) => s.proper_name).map((s) => [s.proper_name, s]));
  assert.ok(Math.abs(byName.Sirius.ra - 101.287) < 0.01);
  assert.equal(byName.Sirius.magnitude, -1.44);
  assert.ok(Math.abs(byName.Sirius.distance_ly - 8.6) < 0.2);
  assert.ok(Math.abs(byName.Vega.ra - 279.235) < 0.01);
  assert.ok(Math.abs(byName.Vega.dec - 38.784) < 0.01);
  assert.ok(byName.Polaris.dec > 89, '北极星赤纬应接近 +90°');
  assert.equal(byName.Polaris.proper_name, 'Polaris');
});

test('已分配状态与 assigned_slug 一致', () => {
  for (const star of pool.stars) {
    if (star.status === 'assigned') {
      assert.ok(star.assigned_slug, `${star.id} 标记为已分配但缺少 slug`);
    } else {
      assert.equal(star.assigned_slug, null);
      assert.equal(star.assigned_at, null);
    }
  }
});
