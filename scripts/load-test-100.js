/* eslint-disable no-console */
'use strict';

const BASE = process.env.BASE_URL || 'http://127.0.0.1:8787';
const TOKEN = process.env.ACCESS_TOKEN || '';
const CONCURRENCY = Number.parseInt(process.env.CONCURRENCY || '100', 10);
const DURATION_MS = Number.parseInt(process.env.DURATION_MS || '60000', 10);

async function worker(stopAt, id) {
  let ok = 0;
  let fail = 0;
  while (Date.now() < stopAt) {
    try {
      const res = await fetch(`${BASE}/api/routes`);
      if (res.ok) ok += 1;
      else fail += 1;
      if (TOKEN) {
        const c = await fetch(`${BASE}/api/checkins`, {
          method: 'GET',
          headers: { Authorization: `Bearer ${TOKEN}` },
        });
        if (c.ok) ok += 1;
        else fail += 1;
      }
    } catch (_e) {
      fail += 1;
    }
  }
  return { id, ok, fail };
}

async function main() {
  const stopAt = Date.now() + DURATION_MS;
  const tasks = [];
  for (let i = 0; i < CONCURRENCY; i += 1) tasks.push(worker(stopAt, i));
  const rows = await Promise.all(tasks);
  const ok = rows.reduce((s, r) => s + r.ok, 0);
  const fail = rows.reduce((s, r) => s + r.fail, 0);
  console.log(JSON.stringify({ concurrency: CONCURRENCY, durationMs: DURATION_MS, ok, fail }, null, 2));
  process.exit(fail > ok * 0.05 ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
