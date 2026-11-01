// 版权所有 (C) Fourth Master
// License: AGPL
// Cloudflare Worker 主入口（Modules Worker）

import {
  createShortLink,
  normalizeExpire,
  normalizeTargetUrl,
  resolveShortLink,
  validateCode
} from './core/shortlink.js';
import {
  deleteVisitStats,
  getVisitStats,
  pruneVisitStats,
  recordVisit,
  renameVisitStats
} from './db/stats.js';
import {
  ADMIN_CAPTCHA_HEIGHT,
  ADMIN_CAPTCHA_MAX_OFFSET,
  ADMIN_CAPTCHA_PIECE_SIZE,
  ADMIN_CAPTCHA_WIDTH,
  validateAdminCaptchaAttempt
} from './core/admin-captcha.js';
import { getKV, initKV, isBlacklisted, isWhitelisted, listAllKeys } from './kv/kv.js';
import ADMIN_HTML from './admin/admin.html' with { type: 'text' };
import CAPTCHA_SOURCE_1 from '../dist/captcha-source-1.webp' with { type: 'bytes' };
import CAPTCHA_SOURCE_2 from '../dist/captcha-source-2.webp' with { type: 'bytes' };
import CAPTCHA_SOURCE_3 from '../dist/captcha-source-3.webp' with { type: 'bytes' };
import CAPTCHA_SOURCE_4 from '../dist/captcha-source-4.webp' with { type: 'bytes' };
import FAVICON from '../dist/favicon.ico' with { type: 'bytes' };
import LOGO from '../dist/logo.webp' with { type: 'bytes' };
import I18N from '../dist/i18n.js' with { type: 'text' };
import UI_CSS from '../dist/ui.css' with { type: 'text' };

const SESSION_TTL_SECONDS = 7 * 24 * 3600;
const CUSTOM_CODE_MAX_LENGTH = 20000;
const ADMIN_CAPTCHA_TTL_SECONDS = 180;
const ADMIN_CAPTCHA_TICKET_TTL_SECONDS = 120;
const ADMIN_CAPTCHA_SOURCES = [CAPTCHA_SOURCE_1, CAPTCHA_SOURCE_2, CAPTCHA_SOURCE_3, CAPTCHA_SOURCE_4];
const ADMIN_CAPTCHA_SHAPES = [
  { id: 'puzzle-a', rotations: [0, 90, 180, 270], path: 'M2 2H18C18 8 22 12 28 12C34 12 38 8 38 2H50V18C44 18 40 22 40 28C40 34 44 38 50 38V50H2V38C8 38 12 34 12 28C12 22 8 18 2 18Z' },
  { id: 'puzzle-b', rotations: [0, 90, 180, 270], path: 'M2 10H17C17 5 21 2 26 2C31 2 35 5 35 10H50V18C44 18 40 22 40 28C40 34 44 38 50 38V50H34C34 44 30 40 24 40C18 40 14 44 14 50H2V34C8 34 12 30 12 24C12 18 8 14 2 14Z' },
  { id: 'puzzle-c', rotations: [0, 90, 180, 270], path: 'M2 2H15C14 9 18 13 24 13C30 13 34 9 33 2H50V14C43 13 39 17 39 23C39 29 43 33 50 32V50H38C39 43 35 39 29 39C23 39 19 43 20 50H2V36C9 37 13 33 13 27C13 21 9 17 2 18Z' },
  { id: 'heart', rotations: [0], path: 'M26 48C22 43 6 33 6 19C6 9 18 4 26 14C34 4 46 9 46 19C46 33 30 43 26 48Z' },
  { id: 'circle', rotations: [0], path: 'M26 3A23 23 0 1 1 26 49A23 23 0 1 1 26 3Z' },
  { id: 'plane', rotations: [0, 90, 180, 270], path: 'M48 24L30 17V7C30 4 28 2 26 2C24 2 22 4 22 7V17L4 24V30L22 27V40L16 45V49L26 46L36 49V45L30 40V27L48 30Z' },
  { id: 'star', rotations: [0], path: 'M26 3L32 19L49 20L36 31L40 48L26 39L12 48L16 31L3 20L20 19Z' },
  { id: 'cat', rotations: [0], path: 'M8 18L6 4L18 11C23 8 29 8 34 11L46 4L44 19C48 24 48 34 43 41C38 48 14 48 9 41C4 34 4 24 8 18Z' },
  { id: 'rabbit', rotations: [0], path: 'M12 24C7 13 9 3 14 2C19 2 21 13 20 18C24 16 28 16 32 18C31 13 33 2 38 2C43 3 45 13 40 24C46 30 44 42 37 47C31 51 21 51 15 47C8 42 6 30 12 24Z' },
  { id: 'fish', rotations: [0, 180], path: 'M4 26C12 14 26 12 38 19L49 11V41L38 33C26 40 12 38 4 26Z' },
  { id: 'butterfly', rotations: [0], path: 'M26 24C20 10 10 6 5 12C0 18 8 26 18 28C8 30 0 38 5 44C10 50 20 42 26 29C32 42 42 50 47 44C52 38 44 30 34 28C44 26 52 18 47 12C42 6 32 10 26 24Z' }
];
const STATIC_ASSETS = new Map([
  ['/favicon.ico', { body: FAVICON, contentType: 'image/x-icon' }],
  ['/logo.webp', { body: LOGO, contentType: 'image/webp' }],
  ['/captcha-source-1.webp', { body: CAPTCHA_SOURCE_1, contentType: 'image/webp' }],
  ['/i18n.js', { body: I18N, contentType: 'application/javascript; charset=utf-8' }],
  ['/ui.css', { body: UI_CSS, contentType: 'text/css; charset=utf-8' }]
]);

const SECURITY_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
  'Content-Security-Policy': [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data:",
    "font-src 'self' data:",
    "frame-src 'self'",
    "connect-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'"
  ].join('; ')
};

export default {
  async fetch(request, env, ctx) {
    if (!env.LINKS) return json({ status: 0, msg: '缺少LINKS KV绑定' }, 500);
    initKV(env.LINKS);
    return handleRequest(request, env, ctx);
  },

  async scheduled(controller, env, ctx) {
    if (!env.LINKS) return;
    initKV(env.LINKS);
    ctx.waitUntil(handleScheduled(env));
  }
};

function applySecurityHeaders(headers) {
  for (const [name, value] of Object.entries(SECURITY_HEADERS)) headers.set(name, value);
  return headers;
}

function json(data, status = 200, extraHeaders = {}) {
  const headers = applySecurityHeaders(new Headers({
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Robots-Tag': 'noindex, nofollow, noarchive',
    ...extraHeaders
  }));
  return new Response(JSON.stringify(data), { status, headers });
}

function html(content, status = 200, { noindex = false, cacheControl = 'no-store' } = {}) {
  const headers = applySecurityHeaders(new Headers({
    'Content-Type': 'text/html; charset=utf-8',
    'Cache-Control': cacheControl
  }));
  if (noindex) headers.set('X-Robots-Tag', 'noindex, nofollow, noarchive');
  return new Response(content, { status, headers });
}

function redirect(location, status = 302, { noindex = false } = {}) {
  const headers = applySecurityHeaders(new Headers({ Location: location, 'Cache-Control': 'no-store' }));
  if (noindex) headers.set('X-Robots-Tag', 'noindex, nofollow, noarchive');
  return new Response(null, { status, headers });
}

function textResponse(content, contentType, cacheControl = 'public, max-age=3600') {
  const headers = applySecurityHeaders(new Headers({
    'Content-Type': contentType,
    'Cache-Control': cacheControl
  }));
  return new Response(content, { status: 200, headers });
}

function getSiteOrigin(env, requestUrl) {
  const fallback = new URL(requestUrl).origin;
  const configured = String(env.SITE_URL || '').trim();
  if (!configured) return fallback;
  try {
    const site = new URL(configured);
    if (!['http:', 'https:'].includes(site.protocol)) return fallback;
    return site.origin;
  } catch {
    return fallback;
  }
}

function getStatsTimeZone(env) {
  return String(env.STATS_TIME_ZONE || 'Asia/Shanghai').trim() || 'Asia/Shanghai';
}

function getStatsRetentionDays(env) {
  return Math.min(3650, Math.max(1, Number.parseInt(env.STATS_RETENTION_DAYS || '90', 10) || 90));
}

function statsUnavailable(error) {
  console.error('D1 stats error:', error);
  const wrapped = new Error('统计数据库暂时不可用');
  wrapped.statusCode = 503;
  return wrapped;
}

async function runStats(env, operation) {
  if (!env.DB) throw statsUnavailable(new Error('缺少 DB D1 绑定'));
  try {
    return await operation(env.DB);
  } catch (error) {
    throw statsUnavailable(error);
  }
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function getClientIp(request) {
  return (request.headers.get('CF-Connecting-IP') || request.headers.get('x-forwarded-for') || '')
    .split(',')[0]
    .trim();
}

function getCookie(request, name) {
  const cookie = request.headers.get('Cookie') || '';
  const escaped = name.replace(/([.$?*|{}()\[\]\\/+^])/g, '\\$1');
  const match = cookie.match(new RegExp(`(?:^|; )${escaped}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : '';
}

async function readJson(request, maxBytes = 64 * 1024) {
  const contentLength = Number(request.headers.get('content-length') || 0);
  if (contentLength > maxBytes) throw new Error('请求内容过大');
  try {
    return await request.json();
  } catch {
    throw new Error('JSON格式不正确');
  }
}

function isLocalRequest(url) {
  return ['localhost', '127.0.0.1', '::1'].includes(url.hostname);
}

async function sha256Hex(value) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
}

function randomToken(byteLength = 32) {
  const bytes = new Uint8Array(byteLength);
  crypto.getRandomValues(bytes);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
}

async function getAdminSession(request) {
  const token = getCookie(request, 'admin_session');
  if (!token) return null;
  const key = `admin:session:${await sha256Hex(token)}`;
  const raw = await getKV().get(key);
  if (!raw) return null;
  try {
    const session = JSON.parse(raw);
    if (!session.expires || session.expires <= Date.now()) {
      await getKV().delete(key);
      return null;
    }
    return { ...session, key };
  } catch {
    await getKV().delete(key);
    return null;
  }
}

async function getAdminCaptchaKey(request) {
  const ip = getClientIp(request) || 'unknown';
  return `admin:login:captcha:${await sha256Hex(ip)}`;
}

async function getAdminCaptchaChallengeKey(challengeId) {
  return `admin:login:challenge:${await sha256Hex(challengeId)}`;
}

async function getAdminCaptchaTicketKey(ticket) {
  return `admin:login:captcha-ticket:${await sha256Hex(ticket)}`;
}

function randomInteger(min, max) {
  const range = max - min + 1;
  const values = new Uint32Array(1);
  crypto.getRandomValues(values);
  return min + (values[0] % range);
}

function bytesToDataUrl(bytes, mimeType = 'image/webp') {
  let binary = '';
  const view = new Uint8Array(bytes);
  for (let index = 0; index < view.length; index += 0x8000) {
    binary += String.fromCharCode(...view.subarray(index, index + 0x8000));
  }
  return `data:${mimeType};base64,${btoa(binary)}`;
}

function randomCaptchaShape() {
  const shape = ADMIN_CAPTCHA_SHAPES[randomInteger(0, ADMIN_CAPTCHA_SHAPES.length - 1)];
  const rotation = shape.rotations[randomInteger(0, shape.rotations.length - 1)];
  return {
    path: shape.path,
    transform: `rotate(${rotation} 26 26)`
  };
}

function createCaptchaDecoys(offset, pieceTop) {
  const positions = [{ x: offset, y: pieceTop }];
  const decoys = [];
  const desiredCount = randomInteger(2, 3);
  for (let attempt = 0; attempt < 60 && decoys.length < desiredCount; attempt += 1) {
    const candidate = { x: randomInteger(12, 236), y: randomInteger(12, 116) };
    const separated = positions.every(position =>
      Math.abs(candidate.x - position.x) > 58 || Math.abs(candidate.y - position.y) > 58
    );
    if (!separated) continue;
    positions.push(candidate);
    decoys.push(candidate);
  }
  return decoys;
}

function createCaptchaImages(sourceBytes, offset, pieceTop, shape, decoys) {
  const backgroundDataUrl = bytesToDataUrl(sourceBytes);
  const decoySvg = decoys.map(position => `<g transform="translate(${position.x} ${position.y})">
    <path d="${shape.path}" transform="${shape.transform}" fill="none" stroke="rgba(15,23,42,.48)" stroke-width="3"/>
    <path d="${shape.path}" transform="${shape.transform}" fill="none" stroke="rgba(255,255,255,.82)" stroke-width="1.2"/>
  </g>`).join('');
  const backgroundSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="300" height="180" viewBox="0 0 300 180">
  <image href="${backgroundDataUrl}" width="300" height="180" preserveAspectRatio="xMidYMid slice"/>
  ${decoySvg}
  <g transform="translate(${offset} ${pieceTop})"><path d="${shape.path}" transform="${shape.transform}" fill="rgba(5,12,24,.62)" stroke="rgba(255,255,255,.9)" stroke-width="1.5"/></g>
</svg>`;
  const pieceSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="52" height="52" viewBox="0 0 52 52">
  <defs><clipPath id="piece"><path d="${shape.path}" transform="${shape.transform}"/></clipPath></defs>
  <g clip-path="url(#piece)"><image href="${backgroundDataUrl}" x="${-offset}" y="${-pieceTop}" width="300" height="180"/></g>
  <path d="${shape.path}" transform="${shape.transform}" fill="none" stroke="rgba(255,255,255,.95)" stroke-width="1.4"/>
</svg>`;
  return {
    backgroundImage: `data:image/svg+xml,${encodeURIComponent(backgroundSvg)}`,
    pieceImage: `data:image/svg+xml,${encodeURIComponent(pieceSvg)}`
  };
}

async function createAdminCaptcha(request) {
  const challengeId = randomToken(18);
  const source = ADMIN_CAPTCHA_SOURCES[randomInteger(0, ADMIN_CAPTCHA_SOURCES.length - 1)];
  const offset = randomInteger(92, 228);
  const pieceTop = randomInteger(30, 116);
  const shape = randomCaptchaShape();
  const images = createCaptchaImages(source, offset, pieceTop, shape, createCaptchaDecoys(offset, pieceTop));
  const ip = getClientIp(request) || 'unknown';
  const key = await getAdminCaptchaChallengeKey(challengeId);
  await getKV().put(key, JSON.stringify({ offset, ip, created: Date.now() }), {
    expirationTtl: ADMIN_CAPTCHA_TTL_SECONDS
  });
  return {
    challengeId,
    width: ADMIN_CAPTCHA_WIDTH,
    height: ADMIN_CAPTCHA_HEIGHT,
    pieceSize: ADMIN_CAPTCHA_PIECE_SIZE,
    maxOffset: ADMIN_CAPTCHA_MAX_OFFSET,
    pieceTop,
    backgroundImage: images.backgroundImage,
    pieceImage: images.pieceImage
  };
}

async function solveAdminCaptcha(request, attempt) {
  if (!attempt?.challengeId) return null;
  const challengeId = String(attempt.challengeId);
  const key = await getAdminCaptchaChallengeKey(String(challengeId));
  const challenge = await getKV().get(key, { type: 'json' });
  await getKV().delete(key);
  const ip = getClientIp(request) || 'unknown';
  if (!challenge || challenge.ip !== ip || !validateAdminCaptchaAttempt(challenge, attempt)) return null;

  const ticket = randomToken(24);
  const ticketKey = await getAdminCaptchaTicketKey(ticket);
  await getKV().put(ticketKey, JSON.stringify({ ip, created: Date.now() }), {
    expirationTtl: ADMIN_CAPTCHA_TICKET_TTL_SECONDS
  });
  return ticket;
}

async function consumeAdminCaptchaTicket(request, ticket) {
  if (!ticket) return false;
  const key = await getAdminCaptchaTicketKey(String(ticket));
  const record = await getKV().get(key, { type: 'json' });
  await getKV().delete(key);
  return Boolean(record && record.ip === (getClientIp(request) || 'unknown'));
}

async function enforceRateLimit(request, pathname) {
  const ip = getClientIp(request) || 'unknown';
  let maxRequests = 20;
  if (pathname === '/admin/login') maxRequests = 20;
  else if (pathname.startsWith('/admin/api/')) maxRequests = 120;

  const key = `ratelimit:${ip}:${pathname}`;
  const now = Date.now();
  let info = await getKV().get(key, { type: 'json' });
  if (!info || now - info.ts >= 60_000) info = { count: 0, ts: now };
  info.count += 1;
  await getKV().put(key, JSON.stringify(info), { expirationTtl: 120 });
  return info.count <= maxRequests;
}

async function handleRequest(request, env, ctx) {
  const url = new URL(request.url);
  if (url.hostname === 'www.883588.xyz') {
    url.hostname = '883588.xyz';
    return redirect(url.toString(), 301);
  }

  if (STATIC_ASSETS.has(url.pathname)) {
    const asset = STATIC_ASSETS.get(url.pathname);
    const headers = applySecurityHeaders(new Headers({
      'Content-Type': asset.contentType,
      'Cache-Control': 'public, max-age=86400'
    }));
    return new Response(asset.body, { status: 200, headers });
  }

  if (url.pathname === '/robots.txt') {
    if (request.method !== 'GET' && request.method !== 'HEAD') return json({ status: 0, msg: '方法不允许' }, 405);
    const siteOrigin = getSiteOrigin(env, url);
    const body = [
      'User-agent: *',
      'Allow: /',
      'Disallow: /admin',
      'Disallow: /api/',
      'Disallow: /s/',
      `Sitemap: ${siteOrigin}/sitemap.xml`,
      ''
    ].join('\n');
    return textResponse(request.method === 'HEAD' ? '' : body, 'text/plain; charset=utf-8');
  }

  if (url.pathname === '/sitemap.xml') {
    if (request.method !== 'GET' && request.method !== 'HEAD') return json({ status: 0, msg: '方法不允许' }, 405);
    const siteOrigin = getSiteOrigin(env, url);
    const body = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>${siteOrigin}/</loc><changefreq>weekly</changefreq><priority>1.0</priority></url>
  <url><loc>${siteOrigin}/doc</loc><changefreq>monthly</changefreq><priority>0.7</priority></url>
</urlset>`;
    return textResponse(request.method === 'HEAD' ? '' : body, 'application/xml; charset=utf-8');
  }

  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/admin/api/') || url.pathname === '/admin/login') {
    if (!(await enforceRateLimit(request, url.pathname))) {
      return json({ status: 0, msg: '请求过于频繁，请稍后再试' }, 429);
    }
  }

  if (url.pathname === '/doc.html') {
    if (request.method !== 'GET' && request.method !== 'HEAD') return json({ status: 0, msg: '方法不允许' }, 405);
    return redirect('/doc', 301);
  }

  if (url.pathname === '/doc') {
    if (request.method !== 'GET') return json({ status: 0, msg: '方法不允许' }, 405);
    const page = await import('./frontend/doc.html', { with: { type: 'text' } });
    const output = await renderPublicPage(page.default || page, getSiteOrigin(env, url));
    return html(injectCustomCode(output, await getCustomCodeSettings()), 200, {
      cacheControl: 'public, max-age=300, s-maxage=600'
    });
  }

  if (url.pathname === '/api/create') {
    if (request.method !== 'POST') return json({ status: 0, msg: '仅支持POST' }, 405);
    let body;
    try { body = await readJson(request); }
    catch (error) { return json({ status: 0, msg: error.message }, 400); }
    if (!body.longUrl) return json({ status: 0, msg: '缺少longUrl参数' }, 400);
    const result = await createShortLink(
      body.longUrl,
      body.customCode,
      body.expireDays,
      body.delay !== undefined ? body.delay : true
    );
    if (result.status === 1) result.shortUrl = `${url.origin}/s/${result.code}`;
    return json(result, result.status === 1 ? 200 : 400);
  }

  if (url.pathname.startsWith('/s/')) {
    if (request.method !== 'GET' && request.method !== 'HEAD') return json({ status: 0, msg: '方法不允许' }, 405);
    const code = decodeURIComponent(url.pathname.slice(3).replace(/\/$/, ''));
    if (validateCode(code)) return html('短链参数不正确', 400, { noindex: true });
    const result = await resolveShortLink(code);
    if (result.status !== 1) return html(escapeHtml(result.msg), result.reason === 'expired' ? 410 : 404, { noindex: true });
    if (request.method === 'GET') {
      try {
        await recordVisit(env.DB, code, { timeZone: getStatsTimeZone(env) });
      } catch (error) {
        console.error(`Failed to record visit for ${code}:`, error);
      }
    }
    return handleShortLinkRedirect(request, result);
  }

  if (url.pathname === '/admin/login') {
    if (request.method === 'GET') {
      if (url.searchParams.get('captcha') === '1') {
        const captchaRequired = Boolean(await getKV().get(await getAdminCaptchaKey(request)));
        if (!captchaRequired) return json({ status: 0, msg: '当前登录无需人机验证' }, 403);
        return json(await createAdminCaptcha(request));
      }
      const page = await import('./admin/login.html', { with: { type: 'text' } });
      const captchaRequired = Boolean(await getKV().get(await getAdminCaptchaKey(request)));
      return html((page.default || page)
        .replace('__CAPTCHA_REQUIRED__', captchaRequired ? 'true' : 'false'), 200, { noindex: true });
    }
    if (request.method === 'PUT' && url.searchParams.get('captcha') === 'verify') {
      const captchaRequired = Boolean(await getKV().get(await getAdminCaptchaKey(request)));
      if (!captchaRequired) return json({ status: 0, msg: '当前登录无需人机验证' }, 403);
      let attempt;
      try { attempt = await readJson(request, 16 * 1024); }
      catch (error) { return json({ status: 0, msg: error.message }, 400); }
      const ticket = await solveAdminCaptcha(request, attempt);
      if (!ticket) return json({ status: 0, msg: '验证失败，请重试' }, 400);
      return json({ status: 1, msg: '验证成功', captchaTicket: ticket });
    }
    if (request.method === 'POST') return handleAdminLogin(request, env, url);
    return json({ status: 0, msg: '方法不允许' }, 405);
  }

  if (url.pathname === '/admin/logout') {
    if (request.method !== 'POST') return json({ status: 0, msg: '方法不允许' }, 405);
    const session = await getAdminSession(request);
    if (session) await getKV().delete(session.key);
    return json({ status: 1, msg: '已退出' }, 200, {
      'Set-Cookie': 'admin_session=; Path=/admin; HttpOnly; SameSite=Strict; Max-Age=0'
    });
  }

  if (url.pathname.startsWith('/admin/api/')) {
    const session = await getAdminSession(request);
    if (!session) return json({ status: 0, msg: '未授权' }, 401);
    if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method)) {
      const origin = request.headers.get('Origin');
      if (origin && origin !== url.origin) return json({ status: 0, msg: '跨站请求被拒绝' }, 403);
    }
    return handleAdminApi(request, url, session, env);
  }

  if (url.pathname === '/admin' || url.pathname === '/admin/') {
    const session = await getAdminSession(request);
    if (!session) return redirect('/admin/login', 302, { noindex: true });
    return html(ADMIN_HTML, 200, { noindex: true });
  }

  if (url.pathname === '/') {
    const page = await import('./frontend/index.html', { with: { type: 'text' } });
    const output = await renderPublicPage(page.default || page, getSiteOrigin(env, url));
    return html(injectCustomCode(output, await getCustomCodeSettings()), 200, {
      cacheControl: 'public, max-age=300, s-maxage=600'
    });
  }

  const page = await import('./frontend/404.html', { with: { type: 'text' } });
  return html(injectCustomCode(page.default || page, await getCustomCodeSettings()), 404, { noindex: true });
}

async function handleAdminLogin(request, env, url) {
  if (!env.ADMIN_USER || !env.ADMIN_PASS) {
    return json({ status: 0, msg: '管理员账号尚未配置' }, 503);
  }

  let body;
  try { body = await readJson(request, 16 * 1024); }
  catch (error) { return json({ status: 0, msg: error.message }, 400); }
  const username = String(body.username || '').trim();
  const password = String(body.password || '');
  if (!username || !password) return json({ status: 0, msg: '请输入账号和密码' }, 400);

  const ip = getClientIp(request) || 'unknown';
  const attemptId = await sha256Hex(`${ip}:${username.toLowerCase()}`);
  const failKey = `admin:login:fail:${attemptId}`;
  const lockKey = `admin:login:lock:${attemptId}`;
  const captchaKey = await getAdminCaptchaKey(request);
  const now = Date.now();
  const lock = await getKV().get(lockKey, { type: 'json' });
  if (lock?.unlock > now) {
    return json({ status: 0, msg: `登录已临时锁定，请${Math.ceil((lock.unlock - now) / 60000)}分钟后重试` }, 403);
  }

  const captchaRequired = Boolean(await getKV().get(captchaKey));
  if (captchaRequired) {
    const captchaOk = await consumeAdminCaptchaTicket(request, body.captchaTicket);
    if (!captchaOk) return json({ status: 0, msg: '人机验证失败，请重试', captchaRequired: true }, 400);
  }

  if (username !== env.ADMIN_USER || password !== env.ADMIN_PASS) {
    const failures = (await getKV().get(failKey, { type: 'json' })) || { count: 0 };
    failures.count += 1;
    failures.last = now;
    let lockSeconds = 0;
    if (failures.count >= 6) lockSeconds = 24 * 3600;
    else if (failures.count >= 4) lockSeconds = 30 * 60;
    else if (failures.count >= 3) lockSeconds = 15 * 60;
    if (lockSeconds) {
      await getKV().put(lockKey, JSON.stringify({ unlock: now + lockSeconds * 1000 }), { expirationTtl: lockSeconds });
      failures.count = 0;
    }
    await Promise.all([
      getKV().put(failKey, JSON.stringify(failures), { expirationTtl: 86400 }),
      getKV().put(captchaKey, JSON.stringify({ required: true, last: now }), { expirationTtl: 86400 })
    ]);
    return json({ status: 0, msg: '账号或密码错误', captchaRequired: true }, 401);
  }

  await Promise.all([getKV().delete(failKey), getKV().delete(lockKey), getKV().delete(captchaKey)]);
  const token = randomToken();
  const sessionKey = `admin:session:${await sha256Hex(token)}`;
  await getKV().put(sessionKey, JSON.stringify({
    user: env.ADMIN_USER,
    created: now,
    expires: now + SESSION_TTL_SECONDS * 1000
  }), { expirationTtl: SESSION_TTL_SECONDS });

  const cookie = [
    `admin_session=${encodeURIComponent(token)}`,
    'Path=/admin',
    'HttpOnly',
    'SameSite=Strict',
    `Max-Age=${SESSION_TTL_SECONDS}`
  ];
  if (url.protocol === 'https:') cookie.push('Secure');
  return json({ status: 1, msg: '登录成功' }, 200, { 'Set-Cookie': cookie.join('; ') });
}

async function handleShortLinkRedirect(request, result) {
  const targetUrl = normalizeTargetUrl(result.longUrl);
  const userAgent = request.headers.get('user-agent') || '';
  if (/MicroMessenger|QQ\//i.test(userAgent)) {
    const page = await import('./frontend/fh.html', { with: { type: 'text' } });
    return html(injectCustomCode(page.default || page, await getCustomCodeSettings()), 200, { noindex: true });
  }

  const hostname = new URL(targetUrl).hostname.toLowerCase();
  const candidates = hostname.startsWith('www.') ? [hostname, hostname.slice(4)] : [hostname, `www.${hostname}`];
  for (const candidate of candidates) {
    if (await isWhitelisted(candidate)) return redirect(targetUrl, 302, { noindex: true });
  }
  if (!result.delay) return redirect(targetUrl, 302, { noindex: true });

  const page = await import('./frontend/redirect.html', { with: { type: 'text' } });
  const script = `<script>
var targetUrl = ${JSON.stringify(targetUrl)};
var sec = 3;
window.addEventListener('DOMContentLoaded', function() {
  var target = document.getElementById('target');
  var count = document.getElementById('count');
  var btn = document.getElementById('jumpBtn');
  var copyBtn = document.getElementById('copyBtn');
  var toast = document.getElementById('toast');
  target.href = targetUrl;
  target.textContent = targetUrl;
  target.title = targetUrl;
  count.textContent = sec;
  btn.onclick = function() { window.location.href = targetUrl; };
  function notify(message) {
    if (!toast) return;
    toast.textContent = message;
    toast.style.display = 'block';
    setTimeout(function(){ toast.style.display = 'none'; }, 1800);
  }
  function copyTargetUrl() {
    if (navigator.clipboard && window.isSecureContext) {
      return navigator.clipboard.writeText(targetUrl);
    }
    return new Promise(function(resolve, reject) {
      var textarea = document.createElement('textarea');
      textarea.value = targetUrl;
      textarea.setAttribute('readonly', '');
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.select();
      try {
        if (!document.execCommand('copy')) throw new Error('copy failed');
        resolve();
      } catch (error) {
        reject(error);
      } finally {
        document.body.removeChild(textarea);
      }
    });
  }
  if (copyBtn) copyBtn.onclick = function() {
    copyTargetUrl().then(function() {
      notify('已复制到剪贴板');
    }, function() {
      notify('复制失败，请手动复制');
    });
  };
  var timer = setInterval(function() {
    sec--;
    if (sec <= 0) { clearInterval(timer); window.location.href = targetUrl; }
    else count.textContent = sec;
  }, 1000);
});
<\/script>`;
  const output = (page.default || page)
    .replace(/<title>.*<\/title>/, '<title>35短链接 - 跳转中...</title>')
    .replace(/<script>[\s\S]*?<\/script>/, script);
  return html(injectCustomCode(output, await getCustomCodeSettings()), 200, { noindex: true });
}

function normalizeDomain(value) {
  const input = String(value || '').trim();
  if (!input || input.length > 253) throw new Error('域名不正确');
  const parsed = new URL(input.includes('://') ? input : `http://${input}`);
  if (!parsed.hostname || (parsed.pathname !== '/' && parsed.pathname !== '')) throw new Error('请输入纯域名');
  return parsed.hostname.toLowerCase().replace(/\.$/, '');
}

function normalizeFriendName(value) {
  const name = String(value || '').trim();
  if (!name || name.length > 80 || /[<>"']/.test(name)) throw new Error('友情链接名称不正确');
  return name;
}

async function hostnameIsBlacklisted(urlValue) {
  const hostname = new URL(urlValue).hostname.toLowerCase();
  const candidates = hostname.startsWith('www.') ? [hostname, hostname.slice(4)] : [hostname, `www.${hostname}`];
  for (const candidate of candidates) if (await isBlacklisted(candidate)) return true;
  return false;
}

async function listJsonRecords(prefix) {
  const keys = await listAllKeys(prefix);
  const records = [];
  for (let offset = 0; offset < keys.length; offset += 50) {
    const chunk = keys.slice(offset, offset + 50);
    const values = await Promise.all(chunk.map(key => getKV().get(key.name)));
    for (let index = 0; index < chunk.length; index++) {
      if (!values[index]) continue;
      try { records.push({ key: chunk[index], value: JSON.parse(values[index]) }); }
      catch { /* 忽略损坏数据 */ }
    }
  }
  return records;
}

async function handleAdminApi(request, url, session, env) {
  const apiPath = url.pathname.slice('/admin/api/'.length).replace(/\/$/, '');
  const ip = getClientIp(request);
  const user = session.user;

  try {
    if (apiPath === 'links' && request.method === 'GET') {
      const keyword = (url.searchParams.get('kw') || '').toLowerCase();
      const records = await listJsonRecords('shortlink:');
      let data = records
        .map(record => ({ code: record.key.name.slice('shortlink:'.length), ...record.value }))
        .filter(item => !keyword || item.code.toLowerCase().includes(keyword) || item.longUrl?.toLowerCase().includes(keyword));
      let statsAccurate = true;
      try {
        const summary = await runStats(env, db => getVisitStats(db, data, { timeZone: getStatsTimeZone(env) }));
        data = data.map(item => ({ ...item, ...summary.byCode[item.code] }));
      } catch (error) {
        statsAccurate = false;
        console.error('Falling back to legacy KV stats for link list:', error);
      }
      return json({ status: 1, data, total: data.length, statsAccurate });
    }

    if (apiPath === 'links' && request.method === 'POST') {
      const body = await readJson(request);
      if (!body.url) return json({ status: 0, msg: '缺少url参数' }, 400);
      const result = await createShortLink(body.url, body.custom, body.expire, body.delay);
      if (result.status === 1) {
        result.shortUrl = `${url.origin}/s/${result.code}`;
        await writeAdminLog('新增短链', `code:${result.code}, url:${normalizeTargetUrl(body.url)}`, user, ip);
      }
      return json(result, result.status === 1 ? 200 : 400);
    }

    if (apiPath.startsWith('links/') && request.method === 'PUT') {
      const code = decodeURIComponent(apiPath.slice('links/'.length));
      if (validateCode(code)) return json({ status: 0, msg: '短链码不正确' }, 400);
      const raw = await getKV().get(`shortlink:${code}`);
      if (!raw) return json({ status: 0, msg: '短链不存在' }, 404);
      const body = await readJson(request);
      const data = JSON.parse(raw);
      let newCode = code;
      if (body.newCode && body.newCode !== code) {
        const codeError = validateCode(body.newCode);
        if (codeError) return json({ status: 0, msg: codeError }, 400);
        if (await getKV().get(`shortlink:${body.newCode}`)) return json({ status: 0, msg: '新短链码已存在' }, 409);
        newCode = body.newCode;
      }
      if (typeof body.longUrl !== 'undefined') {
        const normalized = normalizeTargetUrl(body.longUrl);
        if (await hostnameIsBlacklisted(normalized)) return json({ status: 0, msg: '目标域名被列入黑名单' }, 400);
        data.longUrl = normalized;
      }
      if (typeof body.expire !== 'undefined') data.expire = normalizeExpire(body.expire);
      if (typeof body.delay !== 'undefined') data.delay = Boolean(body.delay);
      await getKV().put(`shortlink:${newCode}`, JSON.stringify(data));
      if (newCode !== code) {
        try {
          await runStats(env, db => renameVisitStats(db, code, newCode));
        } catch (error) {
          await getKV().delete(`shortlink:${newCode}`);
          throw error;
        }
        await getKV().delete(`shortlink:${code}`);
      }
      await writeAdminLog('修改短链', `code:${code}, newCode:${newCode}`, user, ip);
      let responseData = { code: newCode, ...data };
      try {
        const summary = await runStats(env, db => getVisitStats(db, [responseData], { timeZone: getStatsTimeZone(env) }));
        responseData = { ...responseData, ...summary.byCode[newCode] };
      } catch (error) {
        console.error('Failed to merge stats into updated link response:', error);
      }
      return json({ status: 1, msg: '修改成功', data: responseData });
    }

    if (apiPath.startsWith('links/') && request.method === 'DELETE') {
      const code = decodeURIComponent(apiPath.slice('links/'.length));
      if (validateCode(code)) return json({ status: 0, msg: '短链码不正确' }, 400);
      const key = `shortlink:${code}`;
      const previous = await getKV().get(key);
      await getKV().delete(key);
      try {
        await runStats(env, db => deleteVisitStats(db, code));
      } catch (error) {
        if (previous) await getKV().put(key, previous);
        throw error;
      }
      await writeAdminLog('删除短链', `code:${code}`, user, ip);
      return json({ status: 1, msg: '删除成功' });
    }

    if (apiPath === 'stats' && request.method === 'GET') {
      const records = await listJsonRecords('shortlink:');
      const links = records.map(record => ({ code: record.key.name.slice('shortlink:'.length), ...record.value }));
      const summary = await runStats(env, db => getVisitStats(db, links, {
        includeDaily: true,
        timeZone: getStatsTimeZone(env)
      }));
      const stats = summary.stats
        .map(item => ({
          code: item.code,
          visits: item.visits,
          dailyVisits: item.dailyVisits,
          lastVisit: item.lastVisit
        }))
        .sort((left, right) => right.visits - left.visits || left.code.localeCompare(right.code));
      return json({
        status: 1,
        totalLinks: links.length,
        today: summary.today,
        todayVisits: summary.todayVisits,
        totalVisits: summary.totalVisits,
        stats
      });
    }

    if (apiPath === 'blacklist' && request.method === 'GET') return listDomainEntries('blacklist:');
    if (apiPath === 'whitelist' && request.method === 'GET') return listDomainEntries('whitelist:');

    if ((apiPath === 'blacklist' || apiPath === 'whitelist') && request.method === 'POST') {
      const body = await readJson(request);
      const domain = normalizeDomain(body.item);
      const prefix = `${apiPath}:`;
      await getKV().put(`${prefix}${domain}`, '1', { metadata: { created: Date.now() } });
      await writeAdminLog(`添加${apiPath === 'blacklist' ? '黑' : '白'}名单`, `domain:${domain}`, user, ip);
      return json({ status: 1, msg: '添加成功' });
    }

    if ((apiPath === 'blacklist/batch' || apiPath === 'whitelist/batch') && request.method === 'POST') {
      const body = await readJson(request, 256 * 1024);
      if (!Array.isArray(body.items) || body.items.length > 1000) return json({ status: 0, msg: '批量数据不正确或超过1000条' }, 400);
      const prefix = apiPath.startsWith('blacklist') ? 'blacklist:' : 'whitelist:';
      const domains = [...new Set(body.items.map(normalizeDomain))];
      await Promise.all(domains.map(domain => getKV().put(`${prefix}${domain}`, '1', { metadata: { created: Date.now() } })));
      await writeAdminLog('批量导入名单', `${prefix}${domains.length}条`, user, ip);
      return json({ status: 1, msg: '批量导入成功', count: domains.length });
    }

    const listMatch = apiPath.match(/^(blacklist|whitelist)\/(.+)$/);
    if (listMatch && request.method === 'PUT') {
      const oldDomain = normalizeDomain(decodeURIComponent(listMatch[2]));
      const body = await readJson(request);
      const newDomain = normalizeDomain(body.item);
      const prefix = `${listMatch[1]}:`;
      await getKV().put(`${prefix}${newDomain}`, '1', { metadata: { created: Date.now() } });
      if (newDomain !== oldDomain) await getKV().delete(`${prefix}${oldDomain}`);
      await writeAdminLog('修改名单', `${oldDomain} -> ${newDomain}`, user, ip);
      return json({ status: 1, msg: '修改成功' });
    }
    if (listMatch && request.method === 'DELETE') {
      const domain = normalizeDomain(decodeURIComponent(listMatch[2]));
      await getKV().delete(`${listMatch[1]}:${domain}`);
      await writeAdminLog('移除名单', `domain:${domain}`, user, ip);
      return json({ status: 1, msg: '移除成功' });
    }

    if (apiPath === 'friendlink' && request.method === 'GET') {
      const keys = await listAllKeys('friendlink:');
      const data = keys.map(key => ({
        name: key.name.slice('friendlink:'.length),
        url: key.metadata?.url || '',
        created: key.metadata?.created
      }));
      return json({ status: 1, data });
    }
    if (apiPath === 'friendlink' && request.method === 'POST') {
      const body = await readJson(request);
      const name = normalizeFriendName(body.name);
      const friendUrl = normalizeTargetUrl(body.url);
      await getKV().put(`friendlink:${name}`, '1', { metadata: { url: friendUrl, created: Date.now() } });
      await writeAdminLog('添加友情链接', `name:${name}, url:${friendUrl}`, user, ip);
      return json({ status: 1, msg: '添加成功' });
    }
    if (apiPath === 'friendlink' && request.method === 'PUT') {
      const body = await readJson(request);
      const oldName = normalizeFriendName(body.oldName);
      const newName = normalizeFriendName(body.newName);
      const newUrl = normalizeTargetUrl(body.newUrl);
      await getKV().put(`friendlink:${newName}`, '1', { metadata: { url: newUrl, created: Date.now() } });
      if (newName !== oldName) await getKV().delete(`friendlink:${oldName}`);
      await writeAdminLog('修改友情链接', `${oldName} -> ${newName}`, user, ip);
      return json({ status: 1, msg: '修改成功' });
    }
    if (apiPath.startsWith('friendlink/') && request.method === 'DELETE') {
      const name = normalizeFriendName(decodeURIComponent(apiPath.slice('friendlink/'.length)));
      await getKV().delete(`friendlink:${name}`);
      await writeAdminLog('删除友情链接', `name:${name}`, user, ip);
      return json({ status: 1, msg: '删除成功' });
    }

    if (apiPath === 'setting/copyright' && request.method === 'GET') {
      return json({ status: 1, data: (await getKV().get('setting:copyright')) || '' });
    }
    if (apiPath === 'setting/copyright' && request.method === 'POST') {
      const body = await readJson(request);
      const copyright = String(body.copyright || '').trim();
      if (copyright.length > 500) return json({ status: 0, msg: '版权信息过长' }, 400);
      await getKV().put('setting:copyright', copyright);
      await writeAdminLog('保存版权信息', copyright, user, ip);
      return json({ status: 1, msg: '保存成功' });
    }

    if ((apiPath === 'setting/headercode' || apiPath === 'setting/footercode') && request.method === 'GET') {
      return json({ status: 1, data: (await getKV().get(`setting:${apiPath.slice('setting/'.length)}`)) || '' });
    }
    if ((apiPath === 'setting/headercode' || apiPath === 'setting/footercode') && request.method === 'POST') {
      const body = await readJson(request, 128 * 1024);
      const code = String(body.code ?? '').trim();
      if (code.length > CUSTOM_CODE_MAX_LENGTH) return json({ status: 0, msg: `代码内容过长（上限 ${CUSTOM_CODE_MAX_LENGTH} 字符）` }, 400);
      const settingKey = apiPath.slice('setting/'.length);
      await getKV().put(`setting:${settingKey}`, code);
      await writeAdminLog(settingKey === 'headercode' ? '设置页头代码' : '设置页脚代码', `${code.length} 字符`, user, ip);
      return json({ status: 1, msg: '保存成功' });
    }

    if (apiPath === 'logs' && request.method === 'GET') {
      const date = url.searchParams.get('date');
      const startDate = url.searchParams.get('startDate');
      const endDate = url.searchParams.get('endDate');
      const type = url.searchParams.get('type') || '';
      const page = Math.max(1, Number.parseInt(url.searchParams.get('page') || '1', 10));
      const pageSize = Math.min(100, Math.max(1, Number.parseInt(url.searchParams.get('pageSize') || '20', 10)));
      let logs = [];
      if (date) {
        logs = await readLogDay(date);
      } else if (startDate && endDate) {
        const dates = getDateRange(startDate, endDate, 366);
        for (const item of dates) logs.push(...await readLogDay(item));
      } else {
        const keys = await listAllKeys('adminlog:');
        for (const key of keys) logs.push(...await readLogDay(key.name.slice('adminlog:'.length)));
      }
      if (type) logs = logs.filter(log => String(log.action || '').includes(type));
      logs.sort((a, b) => b.time - a.time);
      const start = (page - 1) * pageSize;
      return json({ status: 1, data: logs.slice(start, start + pageSize), total: logs.length, page, pageSize });
    }
    if (apiPath === 'logs/clear' && request.method === 'POST') {
      const keys = await listAllKeys('adminlog:');
      await Promise.all(keys.map(key => getKV().delete(key.name)));
      await writeAdminLog('清除全部操作日志', '', user, ip);
      return json({ status: 1, msg: '清除成功' });
    }

    return json({ status: 0, msg: '未知API' }, 404);
  } catch (error) {
    console.error('Admin API error:', error);
    return json({ status: 0, msg: error.message || '服务器错误' }, error.statusCode || 400);
  }
}

async function listDomainEntries(prefix) {
  const keys = await listAllKeys(prefix);
  return json({ status: 1, data: keys.map(key => ({
    value: key.name.slice(prefix.length),
    created: key.metadata?.created
  })) });
}

function getDateRange(start, end, maxDays) {
  const startDate = new Date(`${start}T00:00:00Z`);
  const endDate = new Date(`${end}T00:00:00Z`);
  if (!Number.isFinite(startDate.getTime()) || !Number.isFinite(endDate.getTime()) || startDate > endDate) {
    throw new Error('日期范围不正确');
  }
  const result = [];
  for (let current = startDate; current <= endDate; current = new Date(current.getTime() + 86400000)) {
    if (result.length >= maxDays) throw new Error(`日期范围不能超过${maxDays}天`);
    result.push(current.toISOString().slice(0, 10));
  }
  return result;
}

async function readLogDay(date) {
  const raw = await getKV().get(`adminlog:${date}`);
  if (!raw) return [];
  try { return JSON.parse(raw); }
  catch { return []; }
}

async function getCustomCodeSettings() {
  const [headerCode, footerCode] = await Promise.all([
    getKV().get('setting:headercode'),
    getKV().get('setting:footercode')
  ]);
  return { headerCode: headerCode || '', footerCode: footerCode || '' };
}

function injectCustomCode(pageHtml, customCode) {
  let output = pageHtml;
  if (customCode.headerCode) output = output.replace(/<\/head>/i, `${customCode.headerCode}\n</head>`);
  if (customCode.footerCode) output = output.replace(/<\/body>/i, `${customCode.footerCode}\n</body>`);
  return output;
}

async function renderPublicPage(template, siteOrigin) {
  const keys = await listAllKeys('friendlink:');
  const links = [];
  for (const key of keys.slice(0, 200)) {
    try {
      const friendUrl = normalizeTargetUrl(key.metadata?.url || '');
      const name = key.name.slice('friendlink:'.length);
      links.push(`<a href="${escapeHtml(friendUrl)}" target="_blank" rel="noopener noreferrer">${escapeHtml(name)}</a>`);
    } catch { /* 忽略无效旧数据 */ }
  }
  if (!links.length) links.push('<a href="https://blog.soeg.cn/" target="_blank" rel="noopener noreferrer">四爷手扎</a>');
  const copyright = (await getKV().get('setting:copyright')) || '2026 35短链 By：四爷';
  return template
    .replaceAll('__SITE_URL__', siteOrigin)
    .replace(/<span id="friend-links">[\s\S]*?<\/span>/, `<span id="friend-links">${links.join(' ')}</span>`)
    .replace(/<span id="copyright-info">[\s\S]*?<\/span>/, `<span id="copyright-info">${escapeHtml(copyright)}</span>`);
}

async function handleScheduled(env) {
  const now = Date.now();
  const keys = await listAllKeys('shortlink:');
  for (const key of keys) {
    const raw = await getKV().get(key.name);
    if (!raw) continue;
    let data;
    try { data = JSON.parse(raw); }
    catch { continue; }
    if (!data.expire || Number(data.expire) === 0) continue;
    if (now >= Number(data.expire) && !data.expiredRemind) {
      data.expiredRemind = true;
      await getKV().put(key.name, JSON.stringify(data));
    }
    if (now >= Number(data.expire) + 30 * 24 * 3600 * 1000) {
      const code = key.name.slice('shortlink:'.length);
      try {
        await runStats(env, db => deleteVisitStats(db, code));
        await getKV().delete(key.name);
      } catch (error) {
        console.error(`Failed to remove expired stats for ${code}:`, error);
      }
    }
  }
  try {
    await runStats(env, db => pruneVisitStats(db, getStatsRetentionDays(env), {
      at: now,
      timeZone: getStatsTimeZone(env)
    }));
  } catch (error) {
    console.error('Failed to prune D1 daily stats:', error);
  }
}

async function writeAdminLog(action, detail, user, ip) {
  const day = new Date().toISOString().slice(0, 10);
  const key = `adminlog:${day}`;
  const logs = await readLogDay(day);
  logs.push({ time: Date.now(), action, detail, user, ip: ip || '' });
  await getKV().put(key, JSON.stringify(logs.slice(-5000)));
}
