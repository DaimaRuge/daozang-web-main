# 原书插图正文落点 + 高清 PNG 复原 Implementation Plan

> **For agentic workers:** 按 `docs/superpowers/specs/2026-09-11-daozang-image-restore-display.md` 实现。两段可分开验收：先 UI/API（原图可对照），再复原管线（朱砂+墨线）。

**Goal:** 阅读页正文展示高清透明 PNG；悬停/长按对照原扫描；符类另出朱砂与墨线两份，几何一致。

**Architecture:** 原扫描只读。注入层给每个 image 块带上 `originalSrc`（及可选 ink/cinnabar URL）。API 按文件名精确取文件，禁止「有复原就顶替原图」。复原：libtv 去糊 → 抠透明墨线 → 本地染朱砂。

**Tech Stack:** 现有 Next.js App Router + React + TypeScript + Tailwind 4 + sharp + libtv CLI；`tsx --test`。无新框架。

## Global Constraints

- 原文 `public/data/content/*.json` 只读
- 原扫描 `data/images-daozang/data/images/` 只读
- AI 复原必须标注；不得与原文混称
- 不引入 UI 组件库
- 朱砂色 `#a83f39`（`--cinnabar`）
- 试点书 `45bee8697b49563d`《太上秘法鎮宅靈符》

## File map

| 文件 | 职责 |
|---|---|
| `lib/content-schema.ts` | 可选 `originalSrc` / `inkSrc` / `cinnabarSrc` |
| `lib/daozang-images.ts` | 注入双 URL；默认展示图 |
| `app/api/daozang-images/[...path]/route.ts` | 按扩展名精确取 scan / ink / cinnabar |
| `components/reader/DaozangFigure.tsx` | 悬停/长按对照；朱墨切换 |
| `components/reader/BlockRenderer.tsx` | 原书插图走 DaozangFigure |
| `lib/daozang-restore-image.ts` | 墨线抠图 + 朱砂染色（同像素） |
| `scripts/restore-daozang-images.ts` | libtv + 无变化检测 + 双份写出 |
| `tests/daozang-images.test.ts` | 注入与 API 语义 |
| `tests/daozang-restore-image.test.ts` | 红/黑同尺寸、alpha |

---

### Task 1: API 不再用复原顶替原图

**Files:**
- Modify: `app/api/daozang-images/[...path]/route.ts`
- Test: `tests/daozang-images.test.ts`（抽 `resolveDaozangImageFile(part, file)` 到 `lib/daozang-images.ts` 以便单测）

**Produces:**
- `resolveDaozangImageFile(part, file): { absPath, kind: 'scan' | 'ink' | 'cinnabar' | 'restored' } | null`
- `.jpg/.jpeg` → 仅原扫描
- `stem.ink.png` / `stem.cinnabar.png` / `stem.png` → restored 目录对应文件
- 缺文件 404，绝不交叉顶替

- [ ] 把解析逻辑从 route 抽到 `resolveDaozangImageFile`
- [ ] 测试：请求 jpg 在 restored 已存在时仍指向 `data/images/...jpg`
- [ ] 测试：请求 `.ink.png` 不存在则 null，不回落到 jpg
- [ ] route 设 `X-Daozang-Image` 为 kind
- [ ] `npx tsx --test tests/daozang-images.test.ts`

---

### Task 2: 注入层同时给出展示 URL 与原图 URL

**Files:**
- Modify: `lib/content-schema.ts`（ContentBlock 增加可选 `originalSrc?`, `inkSrc?`, `cinnabarSrc?`）
- Modify: `lib/daozang-images.ts`（`injectDaozangImages`）
- Test: `tests/daozang-images.test.ts`

**规则：**
- 无复原：`content` = 原图 URL，`originalSrc` 同值，parser `daozang-scan`
- 有 `stem.png` 或 ink/cinnabar：`content` = 默认复原 URL，`originalSrc` = 原 jpg URL，parser `daozang-restored`
- 符类且有 cinnabar → 默认 `content` 用 cinnabar；否则 ink
- 图注含「悬停或长按对照原扫描」；无复原时不写 AI

- [ ] 扩展 ContentBlock，其它块类型不受影响
- [ ] `hasRestoredImage` 改为检查 `.png` / `.ink.png` / `.cinnabar.png` 任一
- [ ] 注入测试：mock 复原存在时 `originalSrc` 仍是 `.jpg`
- [ ] `npx tsx --test tests/daozang-images.test.ts`

---

### Task 3: 阅读页悬停/长按对照原图

**Files:**
- Create: `components/reader/DaozangFigure.tsx`
- Modify: `components/reader/BlockRenderer.tsx`
- Test: 无独立组件测试框架则用注入测试 + 浏览器核对该页

**行为：**
- 两张图叠放：底为展示 PNG，顶为原扫描 `opacity-0`；hover / `:focus-within` / `data-compare` 时原图 `opacity-100`
- `onPointerDown` + 400ms → 对照；`onPointerUp/Cancel` 取消（触屏）
- 预载 `originalSrc`
- 有 ink+cinnabar 时，图下「朱砂 / 墨线」按钮，只改展示层，对照目标永远是原扫描
- 图注：有复原为 `原书插图 · AI 复原`

- [ ] DaozangFigure 实现上述交互
- [ ] BlockRenderer 仅 `daozang-scan` / `daozang-restored` 使用它
- [ ] 浏览器：`http://localhost:4173/text/45bee8697b49563d?page=5` 悬停 image086 必须看到低清原扫描白底/纸色，松手回到透明 PNG

---

### Checkpoint A — 落点可对照

无复原的书也能插图；有复原的书能对照原图；原磁盘文件未改。此阶段即可视为「工作一」完成。

---

### Task 4: 墨线抠图 + 朱砂同像素染色

**Files:**
- Modify: `lib/daozang-restore-image.ts`
- Test: `tests/daozang-restore-image.test.ts`

**Produces:**
- `toTransparentPng(...)` 保持现有墨线逻辑
- `tintCinnabarPng(inkPngPath | Buffer, dest, color = '#a83f39')`：RGB 换成朱砂，**alpha 通道原样复制**
- `writeRestoreVariants` 写出 ink + cinnabar + 默认 `stem.png`

- [ ] 测试：ink 与 cinnabar 宽高相等；cinnabar 不透明像素 R/G 接近 168/63；同一像素 alpha 相等
- [ ] 测试：JPG 仍无 alpha
- [ ] `npx tsx --test tests/daozang-restore-image.test.ts`

---

### Task 5: libtv 复原脚本（失败回退 + 双份落地）

**Files:**
- Modify: `scripts/restore-daozang-images.ts`

**规则：**
- 默认 `--engine=libtv`；`--local` 跳过生图
- 下载后若 `buffer.equals(original)` 或长边增幅 &lt; 1.2× → 记 fail，改走本地放大
- 产出 `stem.ink.png` + `stem.cinnabar.png`（符类）+ `stem.png` 默认
- `--bookId` / `--limit` / `--force` 保持
- 提示词只要求修线放大，不要第二次生红版

- [ ] 试点：`--bookId 45bee8697b49563d --limit=1 --force`
- [ ] 确认原扫描文件哈希不变
- [ ] 阅读页默认朱砂；切「墨线」几何重合；悬停仍是原扫描

---

### Task 6: 小批量（神符類试点书，非全库）

**Files:** 脚本参数即可，不新开模块

- [ ] 列出 `data/daozang-image-map.json` 中神符類、图量 ≤ 200 的书
- [ ] 对试点列表跑 restore（可 `--local` 先铺透明 PNG，libtv 另开限额）
- [ ] 全库 4 万张 **不**在本计划执行；需单独确认配额与费用

---

### Checkpoint B — 复原可展示

image086：朱砂正文 + 墨线可切 + 悬停原图。图注标明 AI。原图只读。

## Risks

| 风险 | 处理 |
|---|---|
| libtv 再次原样返回扫描 | 字节/尺寸检测后回退本地放大 |
| 生图改笔画 | 对照原图交互；提示词禁止增删；不把红版交给第二次生图 |
| 触屏无 hover | 长按 + 开关 |
| 48k 张费用/时间 | 本计划只试点，全库须另批 |

## Execution

确认 spec 后两种做法：

1. **按任务开子代理**（推荐）— 一任务一代理，中间验收
2. **本会话顺序做** — Task 1→3 先交付工作一，再 4→5
