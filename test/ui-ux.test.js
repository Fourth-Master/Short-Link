import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const root = new URL('../', import.meta.url);
const read = path => readFile(new URL(path, root), 'utf8');

const [
  css,
  home,
  docs,
  login,
  admin,
  redirect,
  browserGuide,
  notFound,
  designSystem,
  i18n,
  worker
] = await Promise.all([
  read('dist/ui.css'),
  read('src/frontend/index.html'),
  read('src/frontend/doc.html'),
  read('src/admin/login.html'),
  read('src/admin/admin.html'),
  read('src/frontend/redirect.html'),
  read('src/frontend/fh.html'),
  read('src/frontend/404.html'),
  read('design-system/35-short-link/MASTER.md'),
  read('dist/i18n.js'),
  read('src/index.js')
]);

test('统一设计系统使用可信蓝、语义令牌和可访问交互状态', () => {
  assert.match(designSystem, /Trust Blue|可信蓝/i);
  assert.match(css, /--ui-primary\s*:\s*#2563eb/i);
  assert.match(css, /--ui-accent\s*:\s*#0891b2/i);
  assert.match(css, /:focus-visible/);
  assert.match(css, /min-(?:height|width)\s*:\s*44px/);
  assert.match(css, /prefers-reduced-motion/);
  assert.match(css, /\.docs-page \.doc-container\s*\{[^}]*min-width\s*:\s*0/);
});

test('首页表单支持键盘提交、字段级错误和无障碍状态通知', () => {
  assert.match(home, /class="skip-link"/);
  assert.match(home, /<nav[^>]+aria-label="主导航"/);
  assert.match(home, /id="home"[^>]+aria-current="page"/);
  assert.match(home, /id="longUrl"[^>]+type="url"/);
  assert.match(home, /id="generateBtn"[^>]+type="submit"/);
  assert.match(home, /id="longUrlError"[^>]+class="field-error"/);
  assert.match(home, /id="result"[^>]+role="status"[^>]+aria-live="polite"/);
  assert.match(home, /id="error"[^>]+role="alert"/);
});

test('公共页面主题控件使用 SVG 图标而非 Emoji', () => {
  for (const page of [home, docs]) {
    assert.match(page, /id="themeToggleBtn"[^>]+aria-label=/);
    assert.match(page, /class="theme-icon theme-icon-moon"/);
    assert.match(page, /class="theme-icon theme-icon-sun"/);
    assert.doesNotMatch(page, /🌙|☀️/);
  }
  assert.match(docs, /id="apiDoc"[^>]+aria-current="page"/);
});

test('管理员登录提供密码可见性和单独刷新验证的恢复路径', () => {
  assert.match(login, /class="login-shell"/);
  assert.match(login, /id="passwordToggle"[^>]+aria-label=/);
  assert.match(login, /id="captchaPanel"[^>]+hidden/);
  assert.match(login, /id="openCaptchaBtn"[^>]+aria-haspopup="dialog"/);
  assert.match(login, /id="captchaDialog"[^>]+role="dialog"[^>]+aria-modal="true"/);
  assert.match(login, /id="refreshCaptchaBtn"/);
  assert.match(login, /role="slider"/);
  assert.match(login, /id="captchaResult"[^>]+role="status"/);
  assert.match(login, /id="error"[^>]+role="alert"/);
});

test('管理后台具备自适应导航、退出入口和非阻塞反馈区', () => {
  assert.match(admin, /id="adminNavToggle"[^>]+aria-controls="adminNav"/);
  assert.match(admin, /id="adminNav"[^>]+aria-label="后台导航"/);
  assert.match(admin, /href="#shortlink"/);
  assert.match(admin, /id="logoutButton"/);
  assert.match(admin, /id="toastRegion"[^>]+aria-live="polite"/);
});

test('跳转、浏览器提示和 404 页面不依赖不必要的第三方 UI 脚本', () => {
  assert.match(redirect, /class="redirect-progress"/);
  assert.doesNotMatch(browserGuide, /jquery|clipboard(?:\.min)?\.js|layer\.min\.js|user-scalable=no/i);
  assert.match(browserGuide, /id="copy-btn"[^>]+type="button"/);
  assert.doesNotMatch(notFound, /bootstrap|gsap|cdnjs|fonts\.loli/i);
  assert.match(notFound, /class="error-actions"/);
});

test('公共页面与界面文案不出现 Cloudflare 相关内容', () => {
  for (const page of [home, docs, login, admin, redirect, browserGuide, notFound, i18n]) {
    assert.doesNotMatch(page, /cloudflare|\bD1\b|workers?\s+(kv|边缘)|边缘网络/i);
  }
});

test('后台提供页头/页脚代码设置并注入公开页面', () => {
  assert.match(admin, /id="headerCodeInput"/);
  assert.match(admin, /id="footerCodeInput"/);
  assert.match(admin, /setting\/headercode/);
  assert.match(admin, /setting\/footercode/);
  assert.match(worker, /setting\/headercode/);
  assert.match(worker, /setting\/footercode/);
  assert.match(worker, /function injectCustomCode/);
  assert.match(worker, /setting:headercode/);
  assert.match(worker, /setting:footercode/);
});
