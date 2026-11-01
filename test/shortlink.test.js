import test from 'node:test';
import assert from 'node:assert/strict';
import { initKV } from '../src/kv/kv.js';
import {
  createShortLink,
  generateCode,
  normalizeTargetUrl,
  resolveShortLink,
  validateCode
} from '../src/core/shortlink.js';

function createMockKV() {
  const store = new Map();
  return {
    store,
    async put(key, value, options = {}) {
      store.set(key, { value: String(value), metadata: options.metadata });
    },
    async get(key, options = {}) {
      const item = store.get(key);
      if (!item) return null;
      return options.type === 'json' ? JSON.parse(item.value) : item.value;
    },
    async delete(key) {
      store.delete(key);
    },
    async list({ prefix = '' } = {}) {
      return {
        keys: [...store.entries()]
          .filter(([key]) => key.startsWith(prefix))
          .map(([name, item]) => ({ name, metadata: item.metadata })),
        list_complete: true
      };
    }
  };
}

test.beforeEach(() => initKV(createMockKV()));

test('只允许HTTP和HTTPS目标地址', async () => {
  assert.throws(() => normalizeTargetUrl('javascript:alert(1)'), /http或https/);
  const result = await createShortLink('javascript:alert(1)', 'abc123', 30, true);
  assert.equal(result.status, 0);
});

test('创建并解析有效短链', async () => {
  const kv = createMockKV();
  initKV(kv);
  const created = await createShortLink('https://example.com/path', 'abc123', 30, true);
  assert.equal(created.status, 1);
  const resolved = await resolveShortLink('abc123');
  assert.equal(resolved.status, 1);
  assert.equal(resolved.longUrl, 'https://example.com/path');
  const stored = JSON.parse(kv.store.get('shortlink:abc123').value);
  assert.equal(stored.visits, 0, '解析短链不再通过 KV 读改写统计');
});

test('过期短链返回失效状态且不跳转', async () => {
  const kv = createMockKV();
  initKV(kv);
  await kv.put('shortlink:abc123', JSON.stringify({
    longUrl: 'https://example.com/',
    expire: Date.now() - 1000,
    delay: false,
    visits: 0
  }));
  const resolved = await resolveShortLink('abc123');
  assert.equal(resolved.status, 0);
  assert.equal(resolved.reason, 'expired');
});

test('随机短码使用合法格式', () => {
  for (let index = 0; index < 100; index++) {
    const code = generateCode();
    assert.equal(code.length, 8);
    assert.equal(validateCode(code), null);
  }
});
