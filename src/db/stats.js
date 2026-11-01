const DEFAULT_TIME_ZONE = 'Asia/Shanghai';
const DEFAULT_RETENTION_DAYS = 90;
const QUERY_CHUNK_SIZE = 80;
const CODE_PATTERN = /^[a-zA-Z0-9]{6,12}$/;
const dateFormatters = new Map();

const SQL = {
  recordTotal: `/* stats:record-total */
    INSERT INTO link_stats (code, total_visits, last_visit)
    VALUES (?, 1, ?)
    ON CONFLICT(code) DO UPDATE SET
      total_visits = link_stats.total_visits + 1,
      last_visit = CASE
        WHEN link_stats.last_visit IS NULL OR excluded.last_visit > link_stats.last_visit
          THEN excluded.last_visit
        ELSE link_stats.last_visit
      END`,
  recordDaily: `/* stats:record-daily */
    INSERT INTO daily_visits (code, visit_date, visits)
    VALUES (?, ?, 1)
    ON CONFLICT(code, visit_date) DO UPDATE SET
      visits = daily_visits.visits + 1`,
  selectTotals: `/* stats:select-totals */
    SELECT code, total_visits, last_visit
    FROM link_stats
    WHERE code IN (__PLACEHOLDERS__)`,
  selectDailyToday: `/* stats:select-daily-today */
    SELECT code, visit_date, visits
    FROM daily_visits
    WHERE visit_date = ? AND code IN (__PLACEHOLDERS__)`,
  selectDailyAll: `/* stats:select-daily-all */
    SELECT code, visit_date, visits
    FROM daily_visits
    WHERE code IN (__PLACEHOLDERS__)
    ORDER BY visit_date ASC`,
  renameTotal: `/* stats:rename-total */
    INSERT INTO link_stats (code, total_visits, last_visit)
    SELECT ?, total_visits, last_visit
    FROM link_stats
    WHERE code = ?
    ON CONFLICT(code) DO UPDATE SET
      total_visits = link_stats.total_visits + excluded.total_visits,
      last_visit = CASE
        WHEN link_stats.last_visit IS NULL OR excluded.last_visit > link_stats.last_visit
          THEN excluded.last_visit
        ELSE link_stats.last_visit
      END`,
  renameDaily: `/* stats:rename-daily */
    INSERT INTO daily_visits (code, visit_date, visits)
    SELECT ?, visit_date, visits
    FROM daily_visits
    WHERE code = ?
    ON CONFLICT(code, visit_date) DO UPDATE SET
      visits = daily_visits.visits + excluded.visits`,
  deleteDaily: `/* stats:delete-daily */ DELETE FROM daily_visits WHERE code = ?`,
  deleteTotal: `/* stats:delete-total */ DELETE FROM link_stats WHERE code = ?`,
  pruneDaily: `/* stats:prune-daily */ DELETE FROM daily_visits WHERE visit_date < ?`
};

function requireDatabase(db) {
  if (!db || typeof db.prepare !== 'function' || typeof db.batch !== 'function') {
    throw new Error('缺少 DB D1 绑定');
  }
  return db;
}

function normalizeCode(code) {
  const normalized = String(code || '').trim();
  if (!CODE_PATTERN.test(normalized)) throw new Error('短链码不正确');
  return normalized;
}

function normalizeDate(value) {
  const date = value instanceof Date ? new Date(value.getTime()) : new Date(value);
  if (!Number.isFinite(date.getTime())) throw new Error('统计时间不正确');
  return date;
}

function getDateFormatter(timeZone) {
  const zone = String(timeZone || DEFAULT_TIME_ZONE).trim() || DEFAULT_TIME_ZONE;
  if (dateFormatters.has(zone)) return dateFormatters.get(zone);
  let formatter;
  try {
    formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone: zone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    });
    formatter.format(new Date(0));
  } catch {
    throw new Error(`统计时区配置不正确：${zone}`);
  }
  dateFormatters.set(zone, formatter);
  return formatter;
}

function getVisitDate(value, timeZone) {
  const parts = getDateFormatter(timeZone).formatToParts(normalizeDate(value));
  const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function safeCount(value) {
  const count = Number(value);
  return Number.isFinite(count) && count > 0 ? Math.floor(count) : 0;
}

function latestVisit(...values) {
  let latest = '';
  let latestTime = -Infinity;
  for (const value of values) {
    if (!value) continue;
    const time = Date.parse(value);
    if (Number.isFinite(time) && time > latestTime) {
      latest = String(value);
      latestTime = time;
    }
  }
  return latest;
}

function chunks(values, size = QUERY_CHUNK_SIZE) {
  const result = [];
  for (let offset = 0; offset < values.length; offset += size) result.push(values.slice(offset, offset + size));
  return result;
}

function queryFor(template, valueCount) {
  return template.replace('__PLACEHOLDERS__', new Array(valueCount).fill('?').join(', '));
}

function normalizeLinks(links) {
  if (!Array.isArray(links)) throw new Error('统计短链列表不正确');
  const unique = new Map();
  for (const link of links) {
    const code = normalizeCode(typeof link === 'string' ? link : link?.code);
    if (!unique.has(code)) unique.set(code, typeof link === 'string' ? { code } : { ...link, code });
  }
  return [...unique.values()];
}

/**
 * 原子记录一次有效短链访问。总量和当天访问量在同一个 D1 batch 中提交。
 */
export async function recordVisit(db, code, { at = Date.now(), timeZone = DEFAULT_TIME_ZONE } = {}) {
  const database = requireDatabase(db);
  const normalizedCode = normalizeCode(code);
  const date = normalizeDate(at);
  const visitDate = getVisitDate(date, timeZone);
  const lastVisit = date.toISOString();
  await database.batch([
    database.prepare(SQL.recordTotal).bind(normalizedCode, lastVisit),
    database.prepare(SQL.recordDaily).bind(normalizedCode, visitDate)
  ]);
  return { code: normalizedCode, visitDate, lastVisit };
}

/**
 * 读取短链统计。旧 KV 统计被视为只读基线，D1 统计作为精确增量合并，避免升级后历史数据归零。
 */
export async function getVisitStats(
  db,
  links,
  { at = Date.now(), timeZone = DEFAULT_TIME_ZONE, includeDaily = false } = {}
) {
  const database = requireDatabase(db);
  const normalizedLinks = normalizeLinks(links);
  const today = getVisitDate(at, timeZone);
  const byCode = Object.create(null);

  for (const link of normalizedLinks) {
    const legacyDaily = link.dailyVisits && typeof link.dailyVisits === 'object' ? link.dailyVisits : {};
    byCode[link.code] = {
      code: link.code,
      visits: safeCount(link.visits),
      todayVisits: safeCount(legacyDaily[today]),
      lastVisit: latestVisit(link.lastVisit),
      ...(includeDaily ? {
        dailyVisits: Object.fromEntries(
          Object.entries(legacyDaily)
            .filter(([date]) => /^\d{4}-\d{2}-\d{2}$/.test(date))
            .map(([date, visits]) => [date, safeCount(visits)])
        )
      } : {})
    };
  }

  if (normalizedLinks.length) {
    const statements = [];
    const plans = [];
    for (const codeChunk of chunks(normalizedLinks.map(link => link.code))) {
      statements.push(database.prepare(queryFor(SQL.selectTotals, codeChunk.length)).bind(...codeChunk));
      plans.push({ kind: 'totals' });
      const dailySql = includeDaily ? SQL.selectDailyAll : SQL.selectDailyToday;
      const dailyBindings = includeDaily ? codeChunk : [today, ...codeChunk];
      statements.push(database.prepare(queryFor(dailySql, codeChunk.length)).bind(...dailyBindings));
      plans.push({ kind: 'daily' });
    }

    const results = await database.batch(statements);
    for (let index = 0; index < results.length; index++) {
      const rows = Array.isArray(results[index]?.results) ? results[index].results : [];
      if (plans[index].kind === 'totals') {
        for (const row of rows) {
          const current = byCode[row.code];
          if (!current) continue;
          current.visits += safeCount(row.total_visits);
          current.lastVisit = latestVisit(current.lastVisit, row.last_visit);
        }
      } else {
        for (const row of rows) {
          const current = byCode[row.code];
          if (!current) continue;
          const visits = safeCount(row.visits);
          if (row.visit_date === today) current.todayVisits += visits;
          if (includeDaily) current.dailyVisits[row.visit_date] = safeCount(current.dailyVisits[row.visit_date]) + visits;
        }
      }
    }
  }

  const stats = normalizedLinks.map(link => byCode[link.code]);
  return {
    today,
    totalVisits: stats.reduce((sum, item) => sum + item.visits, 0),
    todayVisits: stats.reduce((sum, item) => sum + item.todayVisits, 0),
    byCode,
    stats
  };
}

/** 将短链改码时的 D1 统计迁移到新短码；若新码存在孤立统计则合并。 */
export async function renameVisitStats(db, oldCode, newCode) {
  const database = requireDatabase(db);
  const source = normalizeCode(oldCode);
  const target = normalizeCode(newCode);
  if (source === target) return;
  await database.batch([
    database.prepare(SQL.renameTotal).bind(target, source),
    database.prepare(SQL.renameDaily).bind(target, source),
    database.prepare(SQL.deleteDaily).bind(source),
    database.prepare(SQL.deleteTotal).bind(source)
  ]);
}

/** 删除某个短链的全部 D1 统计。 */
export async function deleteVisitStats(db, code) {
  const database = requireDatabase(db);
  const normalizedCode = normalizeCode(code);
  await database.batch([
    database.prepare(SQL.deleteDaily).bind(normalizedCode),
    database.prepare(SQL.deleteTotal).bind(normalizedCode)
  ]);
}

/** 清理超出保留期的每日明细；累计访问量永久保留。 */
export async function pruneVisitStats(
  db,
  retentionDays = DEFAULT_RETENTION_DAYS,
  { at = Date.now(), timeZone = DEFAULT_TIME_ZONE } = {}
) {
  const database = requireDatabase(db);
  const days = Math.min(3650, Math.max(1, Number.parseInt(retentionDays, 10) || DEFAULT_RETENTION_DAYS));
  const date = normalizeDate(at);
  const cutoffDate = new Date(date.getTime() - (days - 1) * 24 * 3600 * 1000);
  const cutoff = getVisitDate(cutoffDate, timeZone);
  const result = await database.prepare(SQL.pruneDaily).bind(cutoff).run();
  return { cutoff, deleted: safeCount(result?.meta?.changes) };
}
