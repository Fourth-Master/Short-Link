// 版权所有 (C) Fourth Master
// License: AGPL
// 作者: Fourth Master
// 博客: https://blog.soeg.cn
// 演示: https://883588.xyz
// Cloudflare KV 操作封装模块
// 统一管理与KV的数据交互，提升代码复用性和可维护性

/**
 * KV命名空间实例（需在Worker环境中注入）
 * @type {KVNamespace}
 */
let KV = null;

/**
 * 初始化KV命名空间
 * @param {KVNamespace} kvInstance 
 */
export function initKV(kvInstance) {
  if (!kvInstance) throw new Error('缺少KV绑定');
  KV = kvInstance;
}

/**
 * 获取当前KV实例，仅供需要使用KV原生能力的服务层使用。
 */
export function getKV() {
  if (!KV) throw new Error('KV未初始化');
  return KV;
}

/**
 * 遍历指定前缀的全部键，避免KV.list默认最多返回1000条造成漏数据。
 */
export async function listAllKeys(prefix) {
  if (!KV) throw new Error('KV未初始化');
  const keys = [];
  let cursor;
  do {
    const page = await KV.list({ prefix, cursor, limit: 1000 });
    keys.push(...page.keys);
    cursor = page.list_complete ? undefined : page.cursor;
  } while (cursor);
  return keys;
}

/**
 * 存储短链数据
 * @param {string} code 短链code
 * @param {object} data 需存储的数据对象
 */
export async function putShortLink(code, data) {
  if (!KV) throw new Error('KV未初始化');
  await KV.put(`shortlink:${code}`, JSON.stringify(data));
}

/**
 * 获取短链数据
 * @param {string} code 短链code
 * @returns {object|null}
 */
export async function getShortLink(code) {
  if (!KV) throw new Error('KV未初始化');
  const val = await KV.get(`shortlink:${code}`);
  return val ? JSON.parse(val) : null;
}

/**
 * 删除短链数据
 * @param {string} code 短链code
 */
export async function deleteShortLink(code) {
  if (!KV) throw new Error('KV未初始化');
  await KV.delete(`shortlink:${code}`);
}

/**
 * 存储/获取/删除黑白名单、统计等可扩展...
 */
// 示例：黑名单操作
export async function addToBlacklist(domain) {
  if (!KV) throw new Error('KV未初始化');
  await KV.put(`blacklist:${domain}`, '1');
}
export async function isBlacklisted(domain) {
  if (!KV) throw new Error('KV未初始化');
  return !!(await KV.get(`blacklist:${domain}`));
}
export async function removeFromBlacklist(domain) {
  if (!KV) throw new Error('KV未初始化');
  await KV.delete(`blacklist:${domain}`);
}
export async function addToWhitelist(domain) {
  if (!KV) throw new Error('KV未初始化');
  await KV.put(`whitelist:${domain}`, '1');
}
export async function isWhitelisted(domain) {
  if (!KV) throw new Error('KV未初始化');
  return !!(await KV.get(`whitelist:${domain}`));
}
export async function removeFromWhitelist(domain) {
  if (!KV) throw new Error('KV未初始化');
  await KV.delete(`whitelist:${domain}`);
}
export async function addFriendLink(name, url) {
  if (!KV) throw new Error('KV未初始化');
  await KV.put(`friendlink:${name}`, '', { metadata: { url } });
}
export async function setCopyrightInfo(html) {
  if (!KV) throw new Error('KV未初始化');
  await KV.put('setting:copyright', html);
}
export async function addToWhitelistWithTime(domain, time) {
  if (!KV) throw new Error('KV未初始化');
  await KV.put(`whitelist:${domain}`, time ? time : '');
}
