import assert from 'node:assert/strict';
import test from 'node:test';
import {
  deleteVisitStats,
  getVisitStats,
  pruneVisitStats,
  recordVisit,
  renameVisitStats
} from '../src/db/stats.js';

class FakeStatement {
  constructor(database, sql, bindings = []) {
    this.database = database;
    this.sql = sql;
    this.bindings = bindings;
  }

  bind(...bindings) {
    return new FakeStatement(this.database, this.sql, bindings);
  }

  async all() {
    return this.database.executeOne(this);
  }

  async run() {
    return this.database.executeOne(this);
  }
}

class FakeD1 {
  constructor() {
    this.totals = new Map();
    this.daily = new Map();
    this.queue = Promise.resolve();
    this.batchSizes = [];
  }

  prepare(sql) {
    return new FakeStatement(this, sql);
  }

  async batch(statements) {
    this.batchSizes.push(statements.length);
    return this.enqueue(statements);
  }

  async executeOne(statement) {
    const [result] = await this.enqueue([statement]);
    return result;
  }

  enqueue(statements) {
    const task = this.queue.then(() => statements.map(statement => this.execute(statement)));
    this.queue = task.then(() => undefined, () => undefined);
    return task;
  }

  dailyKey(code, visitDate) {
    return `${code}\u0000${visitDate}`;
  }

  execute(statement) {
    const { sql, bindings } = statement;
    if (sql.includes('stats:record-total')) {
      const [code, lastVisit] = bindings;
      const current = this.totals.get(code) || { code, total_visits: 0, last_visit: null };
      current.total_visits += 1;
      if (!current.last_visit || lastVisit > current.last_visit) current.last_visit = lastVisit;
      this.totals.set(code, current);
      return { success: true, meta: { changes: 1 } };
    }
    if (sql.includes('stats:record-daily')) {
      const [code, visitDate] = bindings;
      const key = this.dailyKey(code, visitDate);
      const current = this.daily.get(key) || { code, visit_date: visitDate, visits: 0 };
      current.visits += 1;
      this.daily.set(key, current);
      return { success: true, meta: { changes: 1 } };
    }
    if (sql.includes('stats:select-totals')) {
      const codes = new Set(bindings);
      return { success: true, results: [...this.totals.values()].filter(row => codes.has(row.code)).map(row => ({ ...row })) };
    }
    if (sql.includes('stats:select-daily-today')) {
      const [visitDate, ...codes] = bindings;
      const codeSet = new Set(codes);
      return {
        success: true,
        results: [...this.daily.values()]
          .filter(row => row.visit_date === visitDate && codeSet.has(row.code))
          .map(row => ({ ...row }))
      };
    }
    if (sql.includes('stats:select-daily-all')) {
      const codes = new Set(bindings);
      return {
        success: true,
        results: [...this.daily.values()]
          .filter(row => codes.has(row.code))
          .sort((left, right) => left.visit_date.localeCompare(right.visit_date))
          .map(row => ({ ...row }))
      };
    }
    if (sql.includes('stats:rename-total')) {
      const [targetCode, sourceCode] = bindings;
      const source = this.totals.get(sourceCode);
      if (source) {
        const target = this.totals.get(targetCode) || { code: targetCode, total_visits: 0, last_visit: null };
        target.total_visits += source.total_visits;
        if (!target.last_visit || (source.last_visit && source.last_visit > target.last_visit)) target.last_visit = source.last_visit;
        this.totals.set(targetCode, target);
      }
      return { success: true, meta: { changes: source ? 1 : 0 } };
    }
    if (sql.includes('stats:rename-daily')) {
      const [targetCode, sourceCode] = bindings;
      let changes = 0;
      for (const row of [...this.daily.values()]) {
        if (row.code !== sourceCode) continue;
        const key = this.dailyKey(targetCode, row.visit_date);
        const target = this.daily.get(key) || { code: targetCode, visit_date: row.visit_date, visits: 0 };
        target.visits += row.visits;
        this.daily.set(key, target);
        changes += 1;
      }
      return { success: true, meta: { changes } };
    }
    if (sql.includes('stats:delete-daily')) {
      const [code] = bindings;
      let changes = 0;
      for (const [key, row] of [...this.daily.entries()]) {
        if (row.code === code) {
          this.daily.delete(key);
          changes += 1;
        }
      }
      return { success: true, meta: { changes } };
    }
    if (sql.includes('stats:delete-total')) {
      const [code] = bindings;
      const changes = this.totals.delete(code) ? 1 : 0;
      return { success: true, meta: { changes } };
    }
    if (sql.includes('stats:prune-daily')) {
      const [cutoff] = bindings;
      let changes = 0;
      for (const [key, row] of [...this.daily.entries()]) {
        if (row.visit_date < cutoff) {
          this.daily.delete(key);
          changes += 1;
        }
      }
      return { success: true, meta: { changes } };
    }
    throw new Error(`FakeD1 cannot execute SQL: ${sql}`);
  }
}

test('D1 原子批次在并发访问下保留全部计数，并合并旧 KV 基线', async () => {
  const db = new FakeD1();
  const at = Date.parse('2026-07-27T16:30:00.000Z');

  const results = await Promise.all(
    Array.from({ length: 120 }, () => recordVisit(db, 'abc123', { at, timeZone: 'Asia/Shanghai' }))
  );

  assert.equal(results[0].visitDate, '2026-07-28');
  assert.equal(db.batchSizes.length, 120);
  assert.equal(db.batchSizes.every(size => size === 2), true);

  const summary = await getVisitStats(db, [{
    code: 'abc123',
    visits: 7,
    dailyVisits: { '2026-07-28': 2 },
    lastVisit: '2026-07-20T00:00:00.000Z'
  }], { at, timeZone: 'Asia/Shanghai', includeDaily: true });

  assert.equal(summary.totalVisits, 127);
  assert.equal(summary.todayVisits, 122);
  assert.equal(summary.byCode.abc123.dailyVisits['2026-07-28'], 122);
  assert.equal(summary.byCode.abc123.lastVisit, '2026-07-27T16:30:00.000Z');
});

test('短码修改会合并统计，删除会清理全部统计', async () => {
  const db = new FakeD1();
  const at = Date.parse('2026-07-27T08:00:00.000Z');
  await recordVisit(db, 'old123', { at });
  await recordVisit(db, 'old123', { at });
  await recordVisit(db, 'new123', { at });

  await renameVisitStats(db, 'old123', 'new123');
  const renamed = await getVisitStats(db, [{ code: 'old123' }, { code: 'new123' }], { at, includeDaily: true });
  assert.equal(renamed.byCode.old123.visits, 0);
  assert.equal(renamed.byCode.new123.visits, 3);
  assert.equal(renamed.byCode.new123.todayVisits, 3);

  await deleteVisitStats(db, 'new123');
  const deleted = await getVisitStats(db, [{ code: 'new123' }], { at, includeDaily: true });
  assert.equal(deleted.byCode.new123.visits, 0);
  assert.deepEqual(deleted.byCode.new123.dailyVisits, {});
});

test('每日明细按保留期清理，但累计访问量不减少', async () => {
  const db = new FakeD1();
  await recordVisit(db, 'keep123', { at: Date.parse('2026-07-01T08:00:00.000Z') });
  await recordVisit(db, 'keep123', { at: Date.parse('2026-07-27T08:00:00.000Z') });

  const result = await pruneVisitStats(db, 7, { at: Date.parse('2026-07-27T08:00:00.000Z') });
  assert.equal(result.cutoff, '2026-07-21');
  assert.equal(result.deleted, 1);

  const summary = await getVisitStats(db, [{ code: 'keep123' }], {
    at: Date.parse('2026-07-27T08:00:00.000Z'),
    includeDaily: true
  });
  assert.equal(summary.totalVisits, 2);
  assert.deepEqual(summary.byCode.keep123.dailyVisits, { '2026-07-27': 1 });
});
