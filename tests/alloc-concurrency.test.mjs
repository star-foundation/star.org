import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { readdirSync } from 'node:fs';
import path from 'node:path';
import { createSandbox, sandboxEnv, readJson, ROOT } from './helpers.mjs';

/**
 * TC-ALLOC-03（P0 核心用例）：并发下单防超卖。
 * 候选库只剩 1 条 available 时，同时发起 N 笔订单：
 * 必须恰好 1 笔成功，其余全部判定售罄，绝不允许两颗订单拿到同一颗星。
 * 按测试说明书要求跑 3 轮独立测试。
 */
function spawnAllocate(sandbox, payload) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [path.join(ROOT, 'scripts', 'allocate.mjs')], {
      cwd: ROOT,
      env: sandboxEnv(sandbox),
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.on('close', (code) => resolve({ code, stdout, stderr }));
    child.stdin.end(payload);
  });
}

for (const round of [1, 2, 3]) {
  test(`TC-ALLOC-03 第 ${round} 轮：仅剩 1 颗星时 6 笔并发订单只能成功 1 笔`, async () => {
    const sandbox = createSandbox({ availableStars: 1, poolSize: 4 });
    try {
      const payloads = Array.from({ length: 6 }, (_, i) =>
        JSON.stringify({ display_name: `并发用户${i}`, email: `u${i}@example.com` }),
      );
      const results = await Promise.all(payloads.map((payload) => spawnAllocate(sandbox, payload)));
      const parsed = results.map((result) => {
        const start = result.stdout.indexOf('{');
        return start === -1 ? { status: 'error', stderr: result.stderr } : JSON.parse(result.stdout.slice(start));
      });

      const allocated = parsed.filter((item) => item.status === 'allocated');
      const soldOut = parsed.filter((item) => item.status === 'sold_out');
      assert.equal(allocated.length, 1, `应恰好 1 笔成功，实际 ${allocated.length}：${JSON.stringify(parsed)}`);
      assert.equal(soldOut.length, 5, '其余订单应判定售罄并进入异常处理');

      const slugs = new Set(allocated.map((item) => item.slug));
      assert.equal(slugs.size, allocated.length, '不得出现重复 slug');

      const pool = readJson(sandbox.poolFile);
      const assigned = pool.stars.filter((star) => star.status === 'assigned');
      assert.equal(assigned.length, 4, '预置 3 颗 + 新分配 1 颗');
      const newSlug = allocated[0].slug;
      const claimed = pool.stars.filter((star) => star.assigned_slug === newSlug);
      assert.equal(claimed.length, 1, '同一 slug 只能占用一颗恒星');

      const records = readdirSync(sandbox.registrations).filter((name) => name.startsWith(newSlug));
      assert.equal(records.length, 1, '只允许生成一条登记记录');

      // 无可用恒星时不得产生任何孤立登记
      const allRecords = readdirSync(sandbox.registrations);
      assert.equal(allRecords.length, 4, `登记记录总数应为 4（3 条预置 + 1 条新登记），实际 ${allRecords.length}`);
    } finally {
      sandbox.cleanup();
    }
  });
}
