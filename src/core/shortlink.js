// 版权所有 (C) Fourth Master
// License: AGPL
// 作者: Fourth Master
// 博客: https://blog.soeg.cn
// 演示: https://883588.xyz
// 短链核心逻辑模块，负责生成、校验与解析
// 依赖src/kv/kv.js进行数据读写
import { putShortLink, getShortLink, isBlacklisted } from '../kv/kv.js';

// 敏感词、广告、恶意、垃圾词列表（可扩展）
const SENSITIVE_WORDS = ['admin', 'sex', 'spam', 'ad', 'malware'];

/**
 * 校验短链code是否合法
 * @param {string} code
 * @returns {string|null} 不合法返回错误信息，合法返回null
 */
export function validateCode(code) {
  if (!/^[a-zA-Z0-9]{6,12}$/.test(code)) return '短链仅支持6-12位字母数字';
  for (const word of SENSITIVE_WORDS) {
    if (code.toLowerCase().includes(word)) return '短链包含敏感/广告/恶意/垃圾内容';
  }
  return null;
}

/**
 * 生成随机短链code
 * @returns {string}
 */
export function generateCode(length = 8) {
  const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  for (;;) {
    const values = new Uint8Array(length);
    crypto.getRandomValues(values);
    const code = Array.from(values, value => chars[value % chars.length]).join('');
    if (!SENSITIVE_WORDS.some(word => code.toLowerCase().includes(word))) return code;
  }
}

/**
 * 校验并标准化目标URL。短链只允许跳转到HTTP(S)地址。
 */
export function normalizeTargetUrl(value) {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error('长链接不能为空');
  }
  if (value.length > 4096) throw new Error('长链接过长');
  const target = new URL(value.trim());
  if (!['http:', 'https:'].includes(target.protocol)) {
    throw new Error('仅支持http或https链接');
  }
  if (!target.hostname) throw new Error('长链接缺少有效域名');
  if (target.username || target.password) throw new Error('链接中不能包含账号或密码');
  return target.href;
}

export function normalizeExpire(expire) {
  if (expire === 'permanent' || expire === 0 || expire === '0') return 0;
  if (typeof expire === 'number' && expire > 1000000000000) {
    if (expire <= Date.now()) throw new Error('到期时间必须晚于当前时间');
    return expire;
  }
  if (typeof expire !== 'undefined' && expire !== null && expire !== '') {
    let expireDays = Number.parseInt(expire, 10);
    if (!Number.isFinite(expireDays) || expireDays < 1) expireDays = 30;
    expireDays = Math.min(expireDays, 365);
    return Date.now() + expireDays * 24 * 3600 * 1000;
  }
  return Date.now() + 30 * 24 * 3600 * 1000;
}

async function isBlockedHostname(hostname) {
  const domain = hostname.toLowerCase().replace(/\.$/, '');
  const candidates = new Set([domain]);
  if (domain.startsWith('www.')) candidates.add(domain.slice(4));
  else candidates.add(`www.${domain}`);
  for (const candidate of candidates) {
    if (await isBlacklisted(candidate)) return true;
  }
  return false;
}

/**
 * 创建短链
 * @param {string} longUrl
 * @param {string} customCode
 * @returns {object} { code, status, msg }
 */
export async function createShortLink(longUrl, customCode, expire, delay) {
  let normalizedUrl;
  try {
    normalizedUrl = normalizeTargetUrl(longUrl);
    if (await isBlockedHostname(new URL(normalizedUrl).hostname)) {
      return { status: 0, msg: '目标域名被列入黑名单' };
    }
  } catch (error) {
    return { status: 0, msg: error.message || '长链接格式不正确' };
  }

  let code;
  if (customCode) {
    code = customCode;
    const err = validateCode(code);
    if (err) return { status: 0, msg: err };
    if (await getShortLink(code)) return { status: 0, msg: '短链已存在，请更换' };
  } else {
    for (let attempt = 0; attempt < 10; attempt++) {
      const candidate = generateCode();
      if (!validateCode(candidate) && !(await getShortLink(candidate))) {
        code = candidate;
        break;
      }
    }
    if (!code) return { status: 0, msg: '短链生成冲突，请重试' };
  }

  let expireValue;
  try {
    expireValue = normalizeExpire(expire);
  } catch (error) {
    return { status: 0, msg: error.message };
  }

  const data = {
    longUrl: normalizedUrl,
    created: Date.now(),
    visits: 0,
    expire: expireValue,
    delay: delay !== false
  };
  await putShortLink(code, data);
  return { status: 1, code, expire: expireValue, delay: data.delay, msg: '创建成功' };
}

/**
 * 跳转短链
 * @param {string} code
 * @returns {object} { longUrl, status, msg }
 */
export async function resolveShortLink(code) {
  const data = await getShortLink(code);
  if (!data) return { status: 0, msg: '短链不存在' };
  if (data.expire && Date.now() >= Number(data.expire)) {
    return { status: 0, reason: 'expired', msg: '短链已过期' };
  }
  // 访问统计由 D1 统计模块负责，解析路径保持只读，避免 KV 并发写覆盖。
  return { status: 1, longUrl: data.longUrl, delay: !!data.delay };
}

// 统计、黑白名单等功能可继续扩展
