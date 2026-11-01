# 35 Short Link — Design System

> 这是项目 UI 的全局 Source of Truth。页面级规则位于 `pages/`，冲突时页面规则优先。

## Product direction

- Product: public URL shortener + operational SaaS dashboard
- Audience: creators, operators, small teams and developers
- Principles: trustworthy, fast, direct, accessible, data-efficient
- Style: **Trust Blue Minimalism**，公共端采用 Minimal & Direct，后台采用 Data-Dense Dashboard
- Avoid: heavy glassmorphism, decorative animation, emoji icons, low-contrast gray, dark mode by default

## Color system

| Role | Value | Token |
| --- | --- | --- |
| Primary / Trust Blue | `#2563EB` | `--ui-primary` |
| Primary strong | `#1D4ED8` | `--ui-primary-strong` |
| Accent / Link Cyan | `#0891B2` | `--ui-accent` |
| Success | `#15803D` | `--ui-success` |
| Warning | `#B45309` | `--ui-warning` |
| Destructive | `#DC2626` | `--ui-danger` |
| Foreground | `#0F172A` | `--ui-ink` |
| Secondary text | `#475569` | `--ui-muted` |
| Subtle text | `#64748B` | `--ui-subtle` |
| Page background | `#F6F8FC` | `--ui-bg` |
| Surface | `#FFFFFF` | `--ui-surface` |
| Soft surface | `#F1F5F9` | `--ui-surface-soft` |
| Border | `#DCE3EE` | `--ui-line` |
| Focus ring | `rgba(37, 99, 235, .24)` | `--ui-focus` |

Dark mode is supported only where the product exposes a theme switch. Use tonal dark surfaces instead of color inversion.

## Typography

- Family: `Noto Sans SC`, `PingFang SC`, `Microsoft YaHei`, `Segoe UI`, system sans-serif
- Remote fonts are optional; the production UI must remain polished without Google Fonts
- Display: 40–56px / 700–800
- H1: 32–44px / 700–800
- H2: 24–32px / 700
- H3: 17–20px / 650–700
- Body: 16px / 1.65
- Labels and table text: 13–14px / 500–650
- Numbers and short codes: tabular figures; monospace only where it improves scanning

## Spacing and shape

- 4/8px rhythm: `4, 8, 12, 16, 24, 32, 48, 64`
- Control height: 44px minimum; primary controls 48–52px
- Radius: controls 10–12px, cards 16–20px, hero surfaces 24px
- Desktop content max width: 1120px public, 1280px admin
- Shadows are subtle and structural, never decorative

## Components

### Buttons

- One primary action per view
- Primary: trust blue surface, white text
- Secondary: white/transparent surface, visible border
- Destructive: semantic red and spatial separation
- Hover/press transitions: 160–220ms; never shift surrounding layout
- Disabled state uses the native `disabled` attribute and reduced emphasis

### Forms

- Visible labels, persistent helper text and field-level errors
- Validate on blur and on submit; focus the first invalid field
- Loading → success/error feedback is mandatory
- Inputs are at least 44px high and 16px on mobile

### Navigation

- Public: sticky compact top navigation with current-page state
- Admin desktop: persistent sidebar; mobile: explicit collapsible menu
- Navigation remains text-labelled even when icons are present

### Data and tables

- Compact but readable rows, sticky-feeling hierarchy, tabular numbers
- Wide tables are contained inside dedicated scroll regions
- Long URLs truncate with ellipsis and expose the complete value via title/accessible label

## Motion

- `--ui-fast: 160ms`, `--ui-normal: 220ms`, `--ui-slow: 320ms`
- Use opacity/transform only, maximum 1–2 animated elements per view
- All motion respects `prefers-reduced-motion`

## Accessibility requirements

- WCAG AA contrast: normal text ≥4.5:1
- Visible `:focus-visible` ring on all controls
- Keyboard navigation and logical focus order
- SVG icons with text labels or `aria-label`; no emoji structural icons
- Skip link on public/document/admin pages
- Live regions for result, error, copy and toast feedback
- Responsive checks: 375, 768, 1024 and 1440px

