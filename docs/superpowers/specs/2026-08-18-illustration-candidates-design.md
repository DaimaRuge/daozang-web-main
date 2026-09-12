# Spec: 缺图候选识别与排版 Demo

> 日期：2026-08-18
> 状态：已确认，本轮 demo 切片已实现；候选已可导入 Postgres / 审核台清单
> 关联：`docs/BACKEND-CMS-ARCHITECTURE.md` §6.4 / §9 / 阶段 3；`daozangBookUI/demo/typography-demo.html`

## Objective

从当前 1504 部不可变底稿中识别「原文此处应有插图」的位置，为每条候选记录书目、卷次、稳定锚点与跳转链接，供后期 CMS 管理。同期提供一页排版 demo：视觉对齐已认可的 `typography-demo.html`，用真实《靈寶淨明新修九老神印伏魔秘法》等底稿展示占位框。

成功标准见文末。本轮不交付完整 CMS（上传审核、Payload、正式阅读页占位）。

## Tech Stack

- Next.js App Router + React + TypeScript + Tailwind CSS 4（不新增 UI / 状态库）
- 检测与扫描：纯 TypeScript，`tsx` 跑脚本（与 `build-index` 同类）
- 候选主存储：`data/illustration-candidates.json`（demo 读取）
- 后期 CMS 预留：`scripts/migrate-pg.ts` 增加 `illustration_candidates` 表；demo 不连库

## Commands

```
Dev:     npm run dev          → 打开 /demo/typography
Scan:    npm run scan:illustrations
Test:    npm test -- tests/illustration-candidates.test.ts
Lint:    npm run lint
Build:   npm run build
Migrate: npm run migrate      → 建表（demo 不依赖）
```

## Project Structure

```
lib/illustrations/detect-candidates.ts   纯函数：ParsedBook + 书目 → 候选[]
lib/illustrations/candidates.ts          类型、读 JSON、按书过滤
lib/illustrations/kinds.ts               线索 → kind（seal/talisman/palm/plate）
scripts/scan-illustration-candidates.ts  全库扫描，幂等写 JSON
data/illustration-candidates.json        扫描产物（可提交）
app/demo/typography/page.tsx             服务端：取书、解析、候选
app/demo/typography/TypographyDemo.tsx   客户端：横/竖排 + 占位 + 侧栏
tests/illustration-candidates.test.ts    检测 / 负例 / 锚点稳定
scripts/migrate-pg.ts                    追加 illustration_candidates
```

正式阅读页 `app/text/[id]/page.tsx`、`components/reader/*`、`public/data/content/*.json` 本轮不改。

## Detection Rules

检测独立于 `text-parser`：先 `parseText`，再在块序列上跑线索。不改原文，不改解析器规则。

### 收入（v1）

对过真实底稿《靈寶淨明新修九老神印伏魔秘法》（`daaed8b692da3daf`）后的形态：

```
伏魔神印          ← 章题
別本此印          ← OCR 留下的图题，独立短行（最强线索）
印釋 / 双行小注
右印用金銀玉石…   ← 图后的形制说明（同一槽，不重复占位）
法印式            ← 章题
右印不拘木植…     ← heading-slot
上元解穢黃庭真符  ← 章题
右符朱書…         ← heading-slot（符）
訣目掌圓          ← 章题；后接空白/卷终（图被 OCR 吃掉）
```

| signal | 规则 | 插入视觉位置 | confidence |
|---|---|---|---|
| `heading-slot` | 短标题，且下一块以 `右(印\|符\|圖\|式)` 起句，或下一块是短行 `別本此(印\|符\|圖)` | 标题之后 | 0.90 |
| `inline-ref` | 块文本匹配下列模式 | 见下方「插入侧」 | 0.85–0.95 |
| `title-tu` | 书名含「圖」或「图」 | **不进正文**，仅侧栏书级提示 | 0.70 |

`inline-ref` 模式（繁简都收）：

- 整块短行等于或含 `別本此(印|符|圖|图)`（优先）
- `(如)?[左右](圖|图)`、`圖曰`、`图曰`、`其圖如後`、`其图如后`
- 整块短行等于 `訣目掌圓` / `掌圓` / `掌圖`（及简体）；**禁止**用单独「訣目」——正文「只更訣目」不是图
- `(圖|图|印)(缺|佚|亡)`
- `【圖】`、`〔圖〕`、`［圖］` 及简体「图」对应形
- 正文段以 `右(印|符|圖|式)` 起句，且前面没有已合并的同槽 `heading-slot`

**插入侧：** 命中块是 heading/subheading，或整块就是线索短行（`別本此印`、`訣目掌圓`）→ 画在该块**之后**（短行线索在 demo 里用占位框代替展示，原文仍可在结构检查器看到）。其它正文命中 → 画在该块**之前**。

**同槽合并：** heading-slot 为槽起点；`別本此印` 短行与段首 `右印/右符` 吸附到**最近前序同 kind 的槽**，不按固定行距窗口合并（伏魔全书仅约 98 行，窗口会把多枚印合成一条）。优先级：`別本此印` 短行 > `heading-slot` > 段首 `右印/右符`。伏魔「伏魔神印 / 別本此印 / 右印用金銀」只产生 **一个** 占位。占位标题用章名（`slotLabel`，如「伏魔神印」）。

### 明确排除

- `右奉`、`右關`、`右关`、`右牒`、`右上`、`右下`（公文套话，见 `docs/parse-report.md`）
- 仅因短行以「印/符/圖」结尾、没有「右印」等后续指示
- 低置信度块聚集（OCR 空白）—— 留给后期 CMS 阶段 3 加宽

### kind 词表

命中词含「印」→ `seal`；「符」→ `talisman`；「掌」→ `palm`；「圖/图」→ `plate`；否则 `unknown`。多关键词时按 印 > 符 > 掌 > 圖 优先。

## Data Model

稳定键与 `overrideKey` 相同：`${sourceStart}:${content.slice(0, 10)}`。解析器升级后 `blockId` 可变，锚点不变。

```ts
export type IllustrationSignal = 'heading-slot' | 'inline-ref' | 'title-tu';
export type IllustrationKind = 'seal' | 'talisman' | 'palm' | 'plate' | 'unknown';

export interface IllustrationCandidate {
  id: string;                    // `${bookId}:${anchorKey}:${signal}`
  bookId: string;
  title: string;
  collection: string;
  category: string;
  subcategory: string;
  author?: string;
  volumeTitle?: string;          // 最近一条 toc level 2
  volumeBlockId?: string;
  anchorKey: string;
  blockId?: string;              // 扫描时的冗余缓存，可过期
  sourceStart: number;
  sourceEnd: number;
  signal: IllustrationSignal;
  kind: IllustrationKind;
  confidence: number;
  clue: string;                  // 命中的原文片段
  excerpt: string;               // 前后文截断，供人工判断
  slotLabel: string;             // 占位标题：章名优先（如「伏魔神印」）
  readerHref: string;            // /text/{bookId}#{blockId}
  state: 'open';
}
```

`title-tu` 的 `anchorKey` 固定为 `book:title`，`sourceStart/sourceEnd` 为 0，无 `blockId`，无 `readerHref` 哈希。

JSON 文件：

```json
{
  "version": 1,
  "scannedAt": "ISO-8601",
  "parser": "rule-v3",
  "stats": { "booksScanned": 1504, "candidates": 0, "skipped": 0 },
  "candidates": []
}
```

同一 `(bookId, anchorKey, signal)` 只留一条。扫描可重复跑，整文件覆盖写入。

### Postgres（预留，demo 不读）

与 CMS 方案对齐并补本轮字段：

```sql
CREATE TABLE IF NOT EXISTS illustration_candidates (
  id TEXT PRIMARY KEY,
  book_id TEXT NOT NULL,
  anchor_key TEXT NOT NULL,
  block_id TEXT,
  signal TEXT NOT NULL,
  confidence REAL NOT NULL,
  excerpt TEXT,
  kind TEXT,
  clue TEXT,
  volume_title TEXT,
  volume_block_id TEXT,
  source_start INTEGER,
  source_end INTEGER,
  state TEXT NOT NULL DEFAULT 'open',
  resolved_anchor_id TEXT,
  created_at BIGINT NOT NULL,
  UNIQUE (book_id, anchor_key, signal)
);
CREATE INDEX IF NOT EXISTS idx_illust_cand_book
  ON illustration_candidates(book_id, state);
```

本轮不写 `illustration_anchors` / `media_assets`，不把 JSON 导入 Postgres。

## Demo UI

路由：`/demo/typography?book={id}&slot={candidateId}`

- 开发环境默认可开；生产 404，除非 `DZ_ENABLE_DEMO=1`（与 `/review` 相同策略）。
- 无 `book` 时默认 `daaed8b692da3daf`（《靈寶淨明新修九老神印伏魔秘法》）。
- 顶栏书目选择：**仅列出至少一条非 `title-tu` 候选的书**，并显示书名、部类。

视觉对齐 `typography-demo.html`（宣纸底、朱砂虚线、宋体、横排 / 竖排卷轴、主题、字号）。不套正式阅读页的松绿色令牌；demo 页内 CSS 变量自洽，不污染 `globals.css` 的正式主题。

布局：

- 顶栏：品牌「道藏·缺图试验」、书目、横/竖、主题、字号、目录、结构
- 左栏：本章目录 + **本书缺图清单**（卷次、线索、置信度）。点条目滚动到占位；`title-tu` 显示为书级芯片，不滚动正文
- 中栏：解析后的正文；在锚点块旁画占位框
- 右栏：结构检查器（块类型 + 置信度圆点）
- 底栏：扫描命中数；未扫描时提示运行 `npm run scan:illustrations`

占位框文案：

- 标题：〔插图〕{章节名或 kind 中文}
- 说明：原文此处有插图（扫描由「{clue}」识别，置信度 xx%）
- 按钮：上传原图 / AI 配图 → toast 演示；可调用现有 `POST /api/illustrations`，结果不写入原文、不进入正式阅读页

本轮不做简繁切换（底稿已是繁体）。竖排强制繁体展示（即原文）。

不单独做全库总表；换书即换清单。

## Injection（视图层拼接，不改 ParsedBook）

Demo 渲染时按 `anchorKey` 把候选对齐到当前解析块。插入侧见 Detection Rules。`title-tu` 不画框。

不向 `ParsedBook.blocks` 插入 `image` 块。原因：正式 `BlockRenderer` 把 `image.content` 当图片 URL；假块会误伤正式阅读页，也违反「解析结果随时可由原文重建」。候选是 sidecar，与 `parser-overrides` / `ritual-illustrations` 一样用稳定键对齐。

锚点对不上：侧栏该条标黄「待重绑」，正文不插框。

## Error Handling

| 情况 | 行为 |
|---|---|
| JSON 不存在 | 正文仍解析；底栏提示扫描；侧栏空 |
| 本书 0 条正文候选 | 正文照常；侧栏「本书未检出插图线索」 |
| 单本扫描失败 | 记入 stdout / stats.skipped，继续下一本 |
| 上传 / AI API 失败 | toast，不写盘 |
| 生产未开开关 | `notFound()` |

## Testing Strategy

文件：`tests/illustration-candidates.test.ts`（现有 `tsx --test`）。

必须覆盖：

1. 伏魔秘法原文（或等价夹具）：`別本此印` / `伏魔神印` / 随后 `右印用金銀` 合并为 **1** 个占位；`法印式`+`右印`、`真符`+`右符`、`訣目掌圓` 各至少 1 条
2. 负例：「右奉」「右關」「右牒」以及正文「只更訣目」不得产生候选
3. 同一 `(bookId, anchorKey, signal)` 去重
4. `overrideKey` 与候选 `anchorKey` 一致；改 blockId 仍能对齐
5. `title-tu` 不产生正文插入点（无 `blockId`）
6. 视图拼接：占位在「伏魔神印」之后、第一次「右印用…」之前，且该槽只有一框

不要求 E2E 截图测试。手动：`npm run scan:illustrations` 后打开 demo，横/竖排各看一次占位与侧栏滚动。

## Boundaries

- Always：原文 JSON 只读；AI 产物显式标注；低把握线索宁缺毋滥；检测可单测
- Ask first：加宽线索（低置信度聚集、凡「圖」结尾标题）；把占位打进正式 `/text/[id]`；把 JSON 导入 Postgres
- Never：改写 `public/data/content/*.json`；把未审核图当史料；引入 CMS 框架；本轮做上传审核流

## Success Criteria

- [x] `npm run scan:illustrations` 对 1504 部跑完，写出带书目/卷次/锚点/`readerHref` 的 JSON
- [x] 伏魔秘法在 demo 中可见「伏魔神印」类占位，位于章题之后、首次「右印用…」之前；`訣目掌圓` 处有掌诀占位
- [x] 侧栏列出本书候选，点击滚动到占位；可跳转正式阅读页锚点
- [x] 正式 `/text/daaed8b692da3daf` 无占位框
- [x] 「右奉」类负例测试通过
- [x] `npm run migrate` 可创建 `illustration_candidates`（空表即可；本地 Docker 已实测，并支持 `npm run import:illustrations`）
- [x] `npm test` 与 `npm run build` 通过

## Out of Scope

- Payload / `/studio/illustrations` 工作台
- 正式阅读页占位与竖排
- 简繁转换、双行夹注、角注（demo 可省略；正文按现有 parser 块渲染即可）
- 影印底本抓图、对象存储
- 将扫描结果导入 Postgres

## Open Questions

无。实现前若扫描命中量过大（例如 > 5000 且明显误检），先收紧 `inline-ref`，不改正式阅读页。
