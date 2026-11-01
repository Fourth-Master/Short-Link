import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';
import {
  ADMIN_CAPTCHA_MAX_OFFSET,
  validateAdminCaptchaAttempt
} from '../src/core/admin-captcha.js';

class FakeClassList {
  constructor() {
    this.values = new Set();
  }

  add(...names) { names.forEach(name => this.values.add(name)); }
  remove(...names) { names.forEach(name => this.values.delete(name)); }
  toggle(name, force) {
    if (force === true) this.values.add(name);
    else if (force === false) this.values.delete(name);
    else if (this.values.has(name)) this.values.delete(name);
    else this.values.add(name);
    return this.values.has(name);
  }
  contains(name) { return this.values.has(name); }
}

class FakeElement {
  constructor(id = '') {
    this.id = id;
    this.value = '';
    this.textContent = '';
    this.hidden = false;
    this.disabled = false;
    this.type = id === 'password' ? 'password' : 'text';
    this.style = {};
    this.attributes = new Map();
    this.classList = new FakeClassList();
    this.listeners = new Map();
  }

  addEventListener(type, listener) {
    const listeners = this.listeners.get(type) || [];
    listeners.push(listener);
    this.listeners.set(type, listeners);
  }

  setAttribute(name, value) { this.attributes.set(name, String(value)); }
  focus() {}

  async dispatch(type, event = {}) {
    for (const listener of this.listeners.get(type) || []) await listener(event);
  }
}

async function createLoginHarness(responses, { initialCaptchaRequired = false } = {}) {
  const html = await readFile(new URL('../src/admin/login.html', import.meta.url), 'utf8');
  const inlineScript = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].at(-1)?.[1];
  assert.ok(inlineScript, '登录页应包含内联交互脚本');

  const ids = [
    'loginForm', 'username', 'password', 'error', 'loginButton', 'loginButtonText',
    'loginButtonSpinner', 'passwordToggle', 'captchaPanel', 'openCaptchaBtn',
    'captchaTriggerTitle', 'captchaTriggerHint', 'captchaDialog', 'captchaBackdrop',
    'captchaWindow', 'captchaWidget', 'captchaImage', 'captchaLoading',
    'captchaLoadingText', 'captchaPiece', 'captchaResult', 'captchaTrackFill',
    'captchaTrackLabel', 'captchaSlider', 'refreshCaptchaBtn', 'closeCaptchaBtn'
  ];
  const elements = new Map(ids.map(id => [id, new FakeElement(id)]));
  elements.get('username').value = 'admin';
  elements.get('password').value = 'wrong-password';
  elements.get('captchaDialog').hidden = true;
  elements.get('captchaPanel').hidden = true;

  const windowListeners = new Map();
  const documentListeners = new Map();
  const requests = [];
  let currentHref = 'https://short.example/admin/login';
  let navigationCount = 0;
  let now = 0;

  const context = {
    console,
    performance: { now: () => (now += 120) },
    document: {
      activeElement: null,
      body: new FakeElement('body'),
      getElementById: id => elements.get(id) || null,
      addEventListener(type, listener) {
        const listeners = documentListeners.get(type) || [];
        listeners.push(listener);
        documentListeners.set(type, listeners);
      }
    },
    location: {
      get href() { return currentHref; },
      set href(value) { currentHref = value; navigationCount += 1; }
    },
    setTimeout(callback) { callback(); return 1; },
    clearTimeout() {},
    addEventListener(type, listener) {
      const listeners = windowListeners.get(type) || [];
      listeners.push(listener);
      windowListeners.set(type, listeners);
    },
    async fetch(url, options = {}) {
      const body = options.body ? JSON.parse(options.body) : null;
      requests.push({ url, options, body });
      const response = responses.shift() || { body: { status: 0, msg: '账号或密码错误' }, ok: false };
      return {
        ok: response.ok ?? response.body?.status === 1,
        json: async () => response.body ?? response
      };
    }
  };
  context.window = context;

  vm.runInNewContext(
    inlineScript.replaceAll('__CAPTCHA_REQUIRED__', String(initialCaptchaRequired)),
    context,
    { filename: 'src/admin/login.html' }
  );
  for (const listener of windowListeners.get('load') || []) await listener();

  return {
    elements,
    requests,
    navigationCount: () => navigationCount,
    async submit() {
      await elements.get('loginForm').dispatch('submit', { preventDefault() {} });
    }
  };
}

test('首次账号密码错误后显示滑块验证 v2，完成前不重复提交登录', async () => {
  const harness = await createLoginHarness([
    { body: { status: 0, msg: '账号或密码错误', captchaRequired: true }, ok: false },
    { body: { challengeId: 'challenge-1', backgroundImage: '/captcha/bg/1.webp', pieceImage: '/captcha/piece/1.webp', pieceTop: 48, maxOffset: 236 }, ok: true }
  ]);

  assert.equal(harness.elements.get('captchaPanel').hidden, true);
  await harness.submit();

  assert.equal(harness.requests.length, 1);
  assert.equal(harness.requests[0].body.captchaTicket, '');
  assert.equal(harness.elements.get('captchaPanel').hidden, false);
  assert.equal(harness.navigationCount(), 0);

  await harness.submit();
  assert.equal(harness.requests.length, 2, '第二次仅应加载验证码挑战，不应提交登录');
  assert.equal(harness.requests[1].url, '/admin/login?captcha=1');
  assert.equal(harness.elements.get('error').textContent, '请先完成人机验证');
});

test('服务端已标记需要验证时，登录页立即显示验证入口', async () => {
  const harness = await createLoginHarness([], { initialCaptchaRequired: true });
  assert.equal(harness.elements.get('captchaPanel').hidden, false);
  assert.equal(harness.elements.get('captchaTriggerTitle').textContent, '点击完成人机验证');

  await harness.submit();
  assert.equal(harness.requests[0].url, '/admin/login?captcha=1');
  assert.equal(harness.elements.get('error').textContent, '请先完成人机验证');
});

test('滑块 v2 校验位置、时长、轨迹与挑战有效期', () => {
  const now = 1_000_000;
  const challenge = { offset: 172, created: now - 2_000 };
  const valid = {
    position: 174,
    duration: 680,
    mode: 'pointer',
    track: [[0, 0, 0], [31, 2, 120], [88, -1, 280], [141, 1, 490], [174, 0, 680]]
  };

  assert.equal(validateAdminCaptchaAttempt(challenge, valid, now), true);
  assert.equal(validateAdminCaptchaAttempt(challenge, { ...valid, position: 150 }, now), false);
  assert.equal(validateAdminCaptchaAttempt(challenge, { ...valid, duration: 80 }, now), false);
  assert.equal(validateAdminCaptchaAttempt(challenge, { ...valid, track: [[0, 0, 0], [174, 0, 680]] }, now), false);
  assert.equal(validateAdminCaptchaAttempt({ ...challenge, created: now - 181_000 }, valid, now), false);
  assert.equal(ADMIN_CAPTCHA_MAX_OFFSET, 236);
});

test('Worker 使用即时验证码接口和一次性 captchaTicket 登录票据', async () => {
  const workerSource = await readFile(new URL('../src/index.js', import.meta.url), 'utf8');
  assert.match(workerSource, /request\.method === 'PUT' && url\.searchParams\.get\('captcha'\) === 'verify'/);
  assert.match(workerSource, /const ticket = await solveAdminCaptcha\(request, attempt\)/);
  assert.match(workerSource, /consumeAdminCaptchaTicket\(request, body\.captchaTicket\)/);
  assert.match(workerSource, /id: 'heart'/);
  assert.match(workerSource, /id: 'circle'/);
  assert.match(workerSource, /id: 'plane'/);
  assert.match(workerSource, /id: 'cat'/);
  assert.match(workerSource, /id: 'rabbit'/);
  assert.match(workerSource, /id: 'fish'/);
  assert.match(workerSource, /id: 'butterfly'/);
  assert.match(workerSource, /ADMIN_CAPTCHA_SHAPES\[randomInteger\(0, ADMIN_CAPTCHA_SHAPES\.length - 1\)\]/);
  assert.match(workerSource, /const desiredCount = randomInteger\(2, 3\)/);
  assert.match(workerSource, /createCaptchaDecoys\(offset, pieceTop\)/);
  assert.match(workerSource, /getKV\(\)\.delete\(key\)/);
  assert.doesNotMatch(workerSource, /verifyAdminCaptcha\(/);
});
