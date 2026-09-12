# 缺图候选识别与排版 Demo Implementation Plan

> **For agentic workers:** 本计划按 TDD 实现 `docs/superpowers/specs/2026-08-18-illustration-candidates-design.md`。用户已指示直接开工。

**Goal:** 从 1504 部底稿扫出缺图候选（书目/卷次/稳定锚点/链接），并提供 `/demo/typography` 排版页（真实伏魔秘法占位）。

**Architecture:** 检测是 `parseText` 之后的纯函数 sidecar；不改原文、不改解析器、不改正式阅读页。候选写入 JSON。Demo 对当前书现场检测，JSON 只用于书目下拉。Postgres 表预留、demo 不连库。

**Tech Stack:** Next.js App Router + TypeScript + Tailwind 4 + `tsx --test`。视觉对齐 `daozangBookUI/demo/typography-demo.html`。

## Global Constraints

- 原文 `public/data/content/*.json` 只读
- 正式 `/text/[id]`、`components/reader/*` 不改
- 不引入 UI 库 / CMS 框架
- 同槽合并按「最近前序 heading-slot（同 kind）」吸附，不用 40 行窗口（伏魔全书仅 ~98 行，窗口会把多枚印合成一条）

---

### Task 1: 类型、kind、检测、拼接（TDD）

**Files:**
- Create: `lib/illustrations/candidates.ts`
- Create: `lib/illustrations/kinds.ts`
- Create: `lib/illustrations/detect-candidates.ts`
- Create: `lib/illustrations/place.ts`
- Test: `tests/illustration-candidates.test.ts`

**Interfaces:**
- `detectIllustrationCandidates(parsed, meta) → IllustrationCandidate[]`
- `placeCandidates(blocks, candidates) → Placement[]`（`afterBlockId` / `beforeBlockId` / `hideBlockIds`）
- `kindFromClue(clue)`：印 > 符 > 掌 > 圖

**Merge:** heading-slot 为槽起点；`別本此印` 短行与段首 `右印/右符` 吸附到最近前序同 kind 的 heading-slot。`訣目掌圓` 整块短行单独成槽。

**Verify:** `npx tsx --test tests/illustration-candidates.test.ts`

---

### Task 2: 全库扫描脚本

**Files:**
- Create: `scripts/scan-illustration-candidates.ts`
- Modify: `package.json`（`scan:illustrations`）

写出 `data/illustration-candidates.json`。单本失败计入 skipped，不中断。

**Verify:** `npm run scan:illustrations` 跑完；伏魔书有多条非 title-tu 候选。

---

### Task 3: Postgres 预留表

**Files:** Modify `scripts/migrate-pg.ts`（`illustration_candidates` + unique + index）

**Verify:** SQL 为 `IF NOT EXISTS` 幂等。无数据库时不强制跑通。

---

### Task 4: `/demo/typography` 排版页

**Files:**
- Create: `app/demo/typography/page.tsx`
- Create: `app/demo/typography/TypographyDemo.tsx`
- Create: `app/demo/typography/typography-demo.css`
- Modify: `.env.example`（`DZ_ENABLE_DEMO`）

开发默认可开；生产需 `DZ_ENABLE_DEMO=1`。全屏覆盖站点 Nav（`fixed inset-0`），避免被 `max-w-4xl` 夹住。默认书 `daaed8b692da3daf`。上传/AI 先 toast，AI 可 POST `/api/illustrations`。

**Verify:** `npm run lint`、`npm run build`；手动打开横/竖排看占位与侧栏。
