import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';

function getCssRule(css, selector) {
  const escapedSelector = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = css.match(new RegExp(`${escapedSelector}\\s*\\{([^}]*)\\}`));
  assert.ok(match, `应定义 ${selector} 样式`);
  return match[1];
}

const [adminHtml, uiCss] = await Promise.all([
  readFile(new URL('../src/admin/admin.html', import.meta.url), 'utf8'),
  readFile(new URL('../dist/ui.css', import.meta.url), 'utf8')
]);

test('短链表格由独立滚动容器约束，不会撑宽整个页面', () => {
  const hasScrollContainer = /<div class="shortlink-table-scroll">\s*<table class="table shortlink-table" id="shortlinkTable">/.test(adminHtml);
  assert.equal(hasScrollContainer, true);
});

test('所有短链渲染路径都约束原始链接单元格', () => {
  const urlCellCount = (adminHtml.match(/class=['"]shortlink-url-cell['"]/g) || []).length;
  const urlTextCount = (adminHtml.match(/class=['"]shortlink-url['"]/g) || []).length;
  assert.ok(urlCellCount >= 3, '列表、搜索和新增行都应使用受约束的原始链接单元格');
  assert.ok(urlTextCount >= 3, '列表、搜索和新增行都应对原始链接文本应用截断样式');
});

test('短链表格采用固定列宽，超长原始链接显示省略号', () => {
  const scrollRule = getCssRule(uiCss, '.admin-page .shortlink-table-scroll');
  assert.match(scrollRule, /max-width\s*:\s*100%/);
  assert.match(scrollRule, /overflow-x\s*:\s*auto/);

  const tableRule = getCssRule(uiCss, '.admin-page .shortlink-table');
  assert.match(tableRule, /table-layout\s*:\s*fixed/);

  const cellRule = getCssRule(uiCss, '.admin-page .shortlink-url-cell');
  assert.match(cellRule, /max-width\s*:\s*0/);

  const urlRule = getCssRule(uiCss, '.admin-page .shortlink-url');
  assert.match(urlRule, /overflow\s*:\s*hidden/);
  assert.match(urlRule, /text-overflow\s*:\s*ellipsis/);
  assert.match(urlRule, /white-space\s*:\s*nowrap/);
});

test('管理后台内联脚本保持语法有效', () => {
  const inlineScript = [...adminHtml.matchAll(/<script>([\s\S]*?)<\/script>/g)].at(-1)?.[1];
  assert.ok(inlineScript);
  assert.doesNotThrow(() => new vm.Script(inlineScript, { filename: 'src/admin/admin.html' }));
});
