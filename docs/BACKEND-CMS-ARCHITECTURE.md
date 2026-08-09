# 道可道 · 后台（CMS + 运营中台）架构方案

> 状态：**方案待确认**（未开工）
> 版本：v1 · 2026-08-09
> 关联文档：`docs/ARCHITECTURE.md`（前台架构）、`docs/PRD-v2.1-GAP-STATUS.md`（功能对照）

---

## 一、背景与结论

### 触发这份方案的四类需求

1. **插图管理**：道藏中的符箓、画像、示意图是典籍的组成部分而非配图。需要上传/更新/下架，
   更关键的是**对照古籍确定插入位置**，并希望自动识别「此处可能有图」。
2. **道乐扩展**：真实道乐录音（非 AI 生成）将持续入库，涉及演奏者、宫观、录制年代、授权方式。
3. **UGC 管理**：评论、笔记、收藏、标注，以及用户上传的配图、图书、音视频。
4. **栏目扩展**：新增视频类文献（仪式、步法）频道、论坛等。

### 结论

| 判断 | 结论 |
|---|---|
| 是否需要后台 | **需要**，且已超出「轻量运营台」范围 |
| 是否用 WordPress | **不用**（理由见 §4.3） |
| 是否全部自研 | **不全自研**：通用能力用 headless CMS，定位类能力必须自研 |
| 典籍原文是否进 CMS | **不进**。三层内容边界不变，CMS 只管「原文之外的一切」 |

核心判断依据：**你的需求里「内容管理」与「内容定位」是两件事。**
通用 CMS 能解决媒体库、元数据、栏目配置；但「这张符箓插在《洞真八景玉箓晨圖隱符》的哪一行」
依赖 `ContentBlock` 与行号锚点，任何现成 CMS 都没有这种能力，只能自研。

---

## 二、全局约束（不可违反）

以下约束来自项目定位规则与现有架构，所有任务隐含包含本节：

1. **原始文本不可变**：`public/data/content/*.json` 与上游 txt 是底稿，后台不得提供正文编辑入口。
2. **三层内容边界**：原始文本 / 结构化文本 / AI 增强内容不得混排；AI 生成物必须显式标注。
3. **来源审核前置**：媒体资产未通过来源审核（`is_verified = false`）不得作为正式文化资料展示。
4. **技术基线不扩张**：继续 Next.js App Router + React + TypeScript + Tailwind 4，不引入状态管理库、UI 组件库。
5. **移动端兼容**：后台产出的数据经 API 供给前台与未来 App，接口契约以 `lib/content-schema.ts` 为单一来源。
6. **模型不直连数据**：AI 能力一律经 `lib/agent/tools.ts` 的权限检查与日志，审核用 AI 同样如此。
7. **公益属性**：优先低成本、可自托管方案，避免按席位计费的重型 SaaS。

---

## 三、现状盘点（方案的出发点）

### 已有能力

| 层 | 现状 | 文件 |
|---|---|---|
| 账号 | Auth.js v5 凭证登录 + JWT，**无角色字段** | `auth.ts` |
| 数据库 | better-sqlite3 单文件，8 张表 | `lib/db.ts` |
| UGC | 旁注 + 评论，举报数达 3 自动隐藏，**无审核台** | `lib/db.ts`、`lib/ugc.ts`、`lib/community.ts` |
| 插图锚定 | 手写 JSON，键为「行号:内容前缀」 | `data/ritual-illustrations.json` |
| AI 插图任务 | SQLite 异步任务表 | `article_illustrations` |
| 道乐目录 | **硬编码 TypeScript 数组**，加一首要改代码发版 | `lib/music-catalog.ts` |
| 解析校正 | `/review` 页，产出 `data/parser-overrides.json` | `app/review/` |

### 三个必须先解决的阻塞项

**1. 媒体资产还在 Git 里（最紧急）**

| 项 | 实测值 |
|---|---|
| Git 打包体积 | **404 MiB** |
| `public/audio` | 53 个文件 / **273.1 MB** |
| `public/images` | 72 个文件 / 14.8 MB |

真实道乐录音 + 用户上传音视频一旦开闸，仓库与 Vercel 部署包会迅速失控。
**媒体必须迁出 Git，进对象存储。** CMS 的媒体库本质就是「对象存储 + 元数据表」，没有前者无处落地。

**2. SQLite 在 Vercel 上不持久**

`lib/db.ts` 写本地文件 `data/daozang.db`，serverless 无持久盘。账号、进度、UGC、配额目前在生产环境不可靠。

**3. 无角色体系**

`auth.ts` 的 session 只有 `id / email / name`，没有 role。审核台无法建立。

---

## 四、选型决策

### 4.1 已验证：Payload CMS 与 Next.js 16

| 项 | 结论 |
|---|---|
| Payload 支持 Next 16 | **是**，自 Payload 3.73.0 起支持 Next 16.2.x |
| Payload 最低要求 | **Next.js ≥ 16.2.6**（该版本同时修复已知 CVE） |
| 本项目当前版本 | Next **16.2.2** → 需升到 ≥ 16.2.6 |
| 不支持区间 | Next 15.5 – 16.1.x（官方明确不会支持） |

结论：**升一个小版本即可**，不构成阻塞。升级本身还顺带修 CVE，独立价值为正。

### 4.2 候选方案对比

| 方案 | 媒体库 | 权限/草稿 | 与现有栈契合 | 部署复杂度 | 自研锚定工具难度 | 结论 |
|---|---|---|---|---|---|---|
| **Payload CMS 3** | 内置 + S3 适配 | 内置 RBAC / 版本 | 同一 Next 应用，TS 原生 | 低（同一部署） | 低（可做自定义视图） | **推荐** |
| Directus | 成熟 | 内置 | 独立服务，非 TS 原生 | 中（多一个服务） | 中（需另起前端） | 备选 |
| Sanity | 好 | 好 | 内容托管在外 | 低 | 中 | 不推荐（内容外置 + 计费） |
| 全自研 | 需自造 | 需自造 | 完美 | 低 | 低 | 时间成本高，不划算 |
| WordPress | 成熟 | 成熟 | **冲突** | 中（PHP 双栈） | **高** | 否决 |

### 4.3 为什么否决 WordPress

WordPress 恰好强在你这轮提到的三点：媒体库、评论审核、栏目分类。所以需要正面回应，而非一句「不主流」。

| 维度 | 问题 |
|---|---|
| 内容模型 | WP 的世界是 post + HTML；本项目是 `ContentBlock` + 行号溯源 + 置信度 + 稳定锚点。插图定位在 WP 里没有任何现成能力，照样自研，且要塞进 PHP 生态 |
| 内容边界 | WP 天然鼓励「内容进 posts 表编辑」。1500 部典籍进了可编辑表，「原文不可改写」就只剩口头约束 |
| 双栈成本 | Agent（SSE、工具注册表、配额）、阅读器、简繁检索全在 Node/TS，加 PHP 意味着两套部署、两套鉴权、两套用户体系 |
| 移动端 | 目标含 React Native / Flutter，现有 `/api/entry`、`/api/articles/*` 契约为此设计，WP REST 数据形状需再加适配层 |

Payload 提供 WP 那些强项，同时留在 TypeScript 与同一个 Next 应用内，共用同一个 Postgres。

### 4.4 账号体系边界（重要决策）

Payload 自带 users 集合，与现有 Auth.js users 表冲突。

**决策：两套账号分离，不打通。**

- **前台读者**：继续 Auth.js + `users` 表（现有进度、UGC、配额外键全部不动）。
- **后台运营者**：Payload 自己的 `payload_users` 集合，仅用于登录 CMS。
- **审核台**（自研）读取业务库，鉴权走 Auth.js + `users.role`，不依赖 Payload 登录。

理由：打通两套鉴权的复杂度远高于收益；运营者数量少，多登录一次可接受。

---

## 五、目标架构

```text
┌───────────────────────────────────────────────────────────┐
│ 前台 Next.js（阅读器 / 道乐 / 栏目 / Agent）                │
└───────────────────────────────────────────────────────────┘
        │ 读                          │ 读
        ▼                             ▼
┌──────────────────┐        ┌────────────────────────────┐
│ 静态典籍层        │        │ Postgres（运营 + 用户数据） │
│ public/data/*.json│        │ media / channels / ugc ... │
│ 不可变，Git 版本化 │        └────────────────────────────┘
└──────────────────┘             ▲            ▲
                                 │写          │写
                    ┌────────────┴───┐  ┌─────┴──────────────┐
                    │ Payload /admin │  │ 自研工作台          │
                    │ 媒体库/栏目/元数据│ │ /studio/*          │
                    └────────────────┘  │ 审核台 + 配图锚定台 │
                                        └────────────────────┘
                                 │
                                 ▼
                    ┌────────────────────────┐
                    │ 对象存储 R2 / Vercel Blob│
                    │ + Cloudflare Stream(视频)│
                    └────────────────────────┘
```

**分工原则**：Payload 管「结构化的内容与配置」，自研工作台管「需要业务上下文的判断」。

---

## 六、数据模型

目标数据库：**PostgreSQL**（Neon 或 Supabase）。以下为逻辑表结构，迁移时保留 `lib/db.ts` 的函数式接口，仅换实现。

### 6.1 用户与角色

```sql
-- 在现有 users 表上增量
ALTER TABLE users ADD COLUMN role TEXT NOT NULL DEFAULT 'reader';
-- reader      普通读者
-- contributor 可投稿（图书/媒体）
-- moderator   可处理 UGC 审核队列
-- editor      可编辑媒体元数据、栏目、配图锚点
-- admin       全部权限 + 角色管理
ALTER TABLE users ADD COLUMN status TEXT NOT NULL DEFAULT 'active'; -- active | muted | banned
ALTER TABLE users ADD COLUMN region  TEXT NOT NULL DEFAULT 'global'; -- cn | global
```

`auth.ts` 的 session 回调需带出 `role`，供后台路由与 API 鉴权使用。

### 6.2 媒体资产（统一图 / 音 / 视频）

沿用 `lib/content-schema.ts` 中 `ImageAsset` 的学术严谨性字段，推广到全部媒体类型。

```sql
CREATE TABLE media_assets (
  id            TEXT PRIMARY KEY,
  kind          TEXT NOT NULL,              -- image | audio | video
  title         TEXT NOT NULL,
  description   TEXT,

  -- 存储
  storage_key   TEXT NOT NULL,              -- 对象存储 key
  url           TEXT NOT NULL,              -- CDN 地址
  stream_id     TEXT,                       -- Cloudflare Stream / Mux 播放 ID（视频）
  mime          TEXT NOT NULL,
  bytes         BIGINT,
  duration_ms   INTEGER,                    -- 音视频
  width         INTEGER,
  height        INTEGER,
  checksum      TEXT,                       -- 去重与完整性校验

  -- 学术严谨性（承自 ImageAsset，硬性要求）
  source        TEXT NOT NULL,              -- 馆藏 / 出版物 / 录制者，必填
  copyright     TEXT NOT NULL,              -- public-domain | licensed | unknown
  license_note  TEXT,
  author        TEXT,                       -- 作者 / 演奏者
  era           TEXT,                       -- 年代
  alt           TEXT,                       -- 无障碍替代文本
  ai_generated  BOOLEAN NOT NULL DEFAULT false,  -- AI 生成必须标注
  is_verified   BOOLEAN NOT NULL DEFAULT false,  -- 未通过来源审核不得正式展示

  -- 运营
  status        TEXT NOT NULL DEFAULT 'draft',   -- draft | pending | published | unlisted | removed
  region_scope  TEXT NOT NULL DEFAULT 'all',     -- all | cn | global
  uploader_user_id TEXT REFERENCES users(id),
  created_at    BIGINT NOT NULL,
  updated_at    BIGINT NOT NULL
);
CREATE INDEX idx_media_kind_status ON media_assets(kind, status);
```

**约束**：前台渲染时 `is_verified = false` 或 `status <> 'published'` 的资产一律不展示；
`ai_generated = true` 的资产渲染时必须带 AI 标注（现有 `data/ritual-illustrations.json` 的 caption 已是此做法）。

### 6.3 插图锚定

替代 `data/ritual-illustrations.json`，键设计保持一致。

```sql
CREATE TABLE illustration_anchors (
  id          TEXT PRIMARY KEY,
  book_id     TEXT NOT NULL,
  -- 稳定键：「原文行号:内容前缀」，与 parser-overrides.json 同款设计。
  -- 解析器版本升级后 block_id 会变，anchor_key 不会，因此以它为准。
  anchor_key  TEXT NOT NULL,
  block_id    TEXT,                       -- 冗余缓存，重建索引时刷新
  media_id    TEXT NOT NULL REFERENCES media_assets(id),
  position    TEXT NOT NULL DEFAULT 'after',  -- before | after | replace
  caption     TEXT,
  status      TEXT NOT NULL DEFAULT 'published',
  created_by  TEXT REFERENCES users(id),
  created_at  BIGINT NOT NULL,
  updated_at  BIGINT NOT NULL,
  UNIQUE (book_id, anchor_key, media_id)
);
CREATE INDEX idx_anchors_book ON illustration_anchors(book_id, status);
```

### 6.4 插图候选（自动识别产出）

```sql
CREATE TABLE illustration_candidates (
  id          TEXT PRIMARY KEY,
  book_id     TEXT NOT NULL,
  anchor_key  TEXT NOT NULL,
  block_id    TEXT,
  signal      TEXT NOT NULL,   -- title-tu | inline-ref | glyph-suffix | low-confidence
  confidence  REAL NOT NULL,
  excerpt     TEXT,            -- 命中处原文片段，供人工判断
  state       TEXT NOT NULL DEFAULT 'open',  -- open | resolved | dismissed
  resolved_anchor_id TEXT REFERENCES illustration_anchors(id),
  created_at  BIGINT NOT NULL,
  UNIQUE (book_id, anchor_key, signal)
);
```

### 6.5 栏目频道

```sql
CREATE TABLE channels (
  id            TEXT PRIMARY KEY,
  slug          TEXT NOT NULL UNIQUE,
  title         TEXT NOT NULL,
  subtitle      TEXT,
  type          TEXT NOT NULL,   -- text-library | audio | video | gallery | curated | forum
  cover_media_id TEXT REFERENCES media_assets(id),
  sort_order    INTEGER NOT NULL DEFAULT 0,
  visibility    TEXT NOT NULL DEFAULT 'hidden',  -- public | hidden
  region_scope  TEXT NOT NULL DEFAULT 'all',
  config_json   JSONB,           -- 各 type 的渲染参数（分组方式、播放器选项等）
  created_at    BIGINT NOT NULL,
  updated_at    BIGINT NOT NULL
);

-- 栏目与内容的多对多挂载（内容可以是典籍、媒体、专题）
CREATE TABLE channel_items (
  channel_id  TEXT NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
  item_type   TEXT NOT NULL,     -- book | media | anchor | external
  item_ref    TEXT NOT NULL,     -- bookId 或 media_assets.id
  sort_order  INTEGER NOT NULL DEFAULT 0,
  note        TEXT,
  PRIMARY KEY (channel_id, item_type, item_ref)
);
```

道乐现有的五个主题（五行/八卦/十天干/十二时辰/二十四节气）迁移为 5 条 `channels` 记录，
曲目迁为 `media_assets` + `channel_items`，`lib/music-catalog.ts` 退化为兜底默认值或直接删除。

### 6.6 用户投稿

```sql
CREATE TABLE contributions (
  id            TEXT PRIMARY KEY,
  user_id       TEXT NOT NULL REFERENCES users(id),
  kind          TEXT NOT NULL,   -- book | image | audio | video
  title         TEXT NOT NULL,
  body          TEXT,            -- 图书类：文本内容或来源说明
  media_id      TEXT REFERENCES media_assets(id),
  source_note   TEXT NOT NULL,   -- 来源说明，必填
  claimed_license TEXT NOT NULL, -- public-domain | own-work | licensed | unknown
  region        TEXT NOT NULL,   -- cn | global，投稿发生在哪个部署
  status        TEXT NOT NULL DEFAULT 'submitted',
  -- submitted | ai_passed | ai_flagged | approved | rejected | published
  created_at    BIGINT NOT NULL,
  updated_at    BIGINT NOT NULL
);
CREATE INDEX idx_contrib_status ON contributions(status, region);
```

### 6.7 审核记录（合规留痕，只增不改）

```sql
CREATE TABLE moderation_records (
  id            BIGSERIAL PRIMARY KEY,
  target_type   TEXT NOT NULL,   -- annotation | comment | contribution | media
  target_id     TEXT NOT NULL,
  region        TEXT NOT NULL,   -- cn | global
  policy        TEXT NOT NULL,   -- ai-fast | ai-gate | human-queue | ai-then-human

  -- AI 初审
  ai_model      TEXT,
  ai_verdict    TEXT,            -- pass | flag | reject
  ai_score      REAL,
  ai_categories JSONB,           -- 命中的风险类别
  ai_latency_ms INTEGER,

  -- 人工终审
  human_verdict TEXT,            -- approve | reject
  moderator_user_id TEXT REFERENCES users(id),
  reason        TEXT,

  created_at    BIGINT NOT NULL,
  decided_at    BIGINT
);
CREATE INDEX idx_mod_pending ON moderation_records(target_type, human_verdict, region);
```

现有 `annotations` / `comments` 的 `status` 枚举需扩展为
`approved | pending | hidden | rejected`，以承载「先发后审」与「待审」两种中间态。

---

## 七、双区合规与 AI 审核管线

这是本方案里最需要单独设计的部分。

### 7.1 策略矩阵

四种审核策略：

| 策略 | 含义 |
|---|---|
| `ai-fast` | AI 通过即发布；AI 拒绝则进人工复核队列 |
| `ai-gate` | **先发后审**：立即公开，AI 异步审核，命中即下架并进队列 |
| `human-queue` | **投稿制**：提交后不公开，人工审核通过才发布 |
| `ai-then-human` | AI 初筛降噪，人工终审后发布 |

按区域与内容类型映射：

| 内容类型 | 中国大陆版 | 海外版 |
|---|---|---|
| 文本 UGC（评论 / 标注） | `ai-gate`（开放，AI 审） | `ai-fast` |
| 媒体（图 / 音 / 视频） | `human-queue`（投稿审核） | `ai-fast` |
| 图书上传 | `ai-gate`（开放，古籍类优先） | `ai-then-human` |

**这个交叉设计是有内在逻辑的，不是随意配置：**

- **海外严图书、宽媒体**：主要风险是版权（现代点校本、译注本受著作权保护，DMCA 下架风险实在），
  而内容合规压力相对小。
- **大陆宽图书、严媒体**：古籍多属公有领域，国内古籍数字化分享氛围成熟；
  但音视频受前置审核类监管约束，风险显著更高。

### 7.2 区域实现方式：双部署，而非单站点切换

**不建议按 IP 自动切换策略**——易误判、可绕过，且跨境数据传输本身受监管约束。

**决策：同一份代码，两个独立部署，数据分库。**

| 项 | 海外版 | 大陆版 |
|---|---|---|
| 部署 | Vercel | 境内云（备案主体下） |
| 数据库 | Neon / Supabase | 境内 Postgres 实例 |
| 对象存储 | Cloudflare R2 | 境内对象存储 |
| 区域标识 | `DZ_REGION=global` | `DZ_REGION=cn` |

策略引擎读 `DZ_REGION` 决定矩阵行，代码单一来源，行为按环境变量分叉：

```ts
// lib/moderation/policy.ts
export type ModerationPolicy = 'ai-fast' | 'ai-gate' | 'human-queue' | 'ai-then-human';
export type ContentKind = 'text-ugc' | 'media' | 'book';
export type Region = 'cn' | 'global';

/**
 * 审核策略矩阵。两地法律风险结构不同，故按 (region, kind) 交叉取值，
 * 不做 IP 级动态判定：区域由部署环境决定，避免误判与绕过。
 */
const MATRIX: Record<Region, Record<ContentKind, ModerationPolicy>> = {
  cn:     { 'text-ugc': 'ai-gate', media: 'human-queue', book: 'ai-gate' },
  global: { 'text-ugc': 'ai-fast', media: 'ai-fast',     book: 'ai-then-human' },
};

export function resolvePolicy(kind: ContentKind): ModerationPolicy {
  const region = (process.env.DZ_REGION as Region) ?? 'global';
  return MATRIX[region][kind];
}
```

### 7.3 AI 审核管线

```text
提交 → 本地规则前置（长度/控制字符/敏感词表/频率）
     → 命中硬规则？ 直接拒绝，记录，不调用 LLM（省成本）
     → 未命中 → LLM 审核（结构化输出：verdict + categories + score）
     → 按 policy 决定：直接发布 / 先发后审 / 进人工队列
     → 全过程写 moderation_records
```

设计要点：

1. **规则前置降本**：`lib/ugc.ts` 已有清洗与限流（每人每日 30 条），
   在其后加敏感词与硬规则层，绝大多数正常内容与明显垃圾都不需要调 LLM。
2. **走现有工具层**：审核调用必须经 `lib/agent/` 的 provider 抽象，
   复用密钥管理与日志，不在审核代码里直连模型。
3. **结构化输出**：要求模型返回固定 JSON（`verdict` / `categories` / `score` / `reason`），
   解析失败一律降级为 `flag` 进人工队列，**不得默认放行**。
4. **AI 不是免责工具**：审核日志必须留存、可追溯、支持申诉复核。
   `moderation_records` 只增不改即为此设计。
5. **配额隔离**：审核用量与用户 AI 问道配额（`lib/agent/quota.ts`）分开计费，
   避免审核挤占用户额度。

### 7.4 必须正视的合规风险

以下是**方案外的前置条件**，技术无法绕过，需要你确认后再推进大陆版：

| 风险 | 说明 |
|---|---|
| 互联网宗教信息服务许可 | 中国大陆对通过互联网提供宗教信息服务有专门许可要求。道教典籍平台在大陆运营大概率触及，需先确认资质路径 |
| ICP 备案 | 境内部署的硬性前提 |
| 用户上传图书的版权 | 即使是古籍，**点校本、影印本、整理本的整理者权利仍受保护**，「古籍=公有领域」并不总成立 |
| 跨境数据 | 两地数据分库不仅是性能考虑，也是合规考虑 |

以上为工程视角的风险提示，不构成法律意见，建议在大陆版立项前单独确认。

---

## 八、路由与接口清单

### 8.1 后台页面

| 路由 | 归属 | 说明 | 最低角色 |
|---|---|---|---|
| `/admin/**` | Payload 生成 | 媒体库、栏目、元数据 CRUD | editor |
| `/studio` | 自研 | 运营概览：待审数、待配图数 | moderator |
| `/studio/moderation` | 自研 | UGC + 投稿审核队列 | moderator |
| `/studio/illustrations` | 自研 | 配图候选队列 + 阅读器内锚定 | editor |
| `/studio/users` | 自研 | 角色与封禁 | admin |
| `/review` | 现有 | 解析结构校正（保留，不合并） | editor |

`/studio` 与 `/admin` 分开的理由见 §4.4：前者用 Auth.js + `users.role` 鉴权，后者是 Payload 自己的登录。

### 8.2 新增 API

```
# 审核
GET    /api/studio/moderation?type=&status=&region=
POST   /api/studio/moderation/:id/decision      { verdict, reason }
POST   /api/studio/users/:id/status             { status }

# 媒体（浏览器直传，服务端只签名，不中转大文件）
POST   /api/media/upload-url                    { kind, mime, bytes } → { uploadUrl, storageKey }
POST   /api/media                               { storageKey, 元数据... }
PATCH  /api/media/:id
DELETE /api/media/:id                           软删除，status = 'removed'

# 配图
GET    /api/illustrations/candidates?bookId=&state=
POST   /api/illustrations/anchors               { bookId, anchorKey, mediaId, position, caption }
DELETE /api/illustrations/anchors/:id

# 栏目
GET    /api/channels                            前台消费，按 region_scope 过滤
POST   /api/studio/channels
PATCH  /api/studio/channels/:id

# 投稿
POST   /api/contributions
GET    /api/contributions/mine
```

### 8.3 前台改动

- `app/text/[id]/page.tsx`：读取 `illustration_anchors` 并按锚点注入图片块
  （复用现有 `ritual-illustrations` 注入逻辑，换数据源）。
- `app/music/`：从 `lib/music-catalog.ts` 改为读 `channels` + `media_assets`。
- 新增 `app/c/[slug]/page.tsx`：按 `channel.type` 分发渲染器，新增栏目无需新建路由。

**诚实提示**：`channels` 只解决「配置新栏目」，不解决「发明新交互」。
视频播放器、论坛帖子流这些新形态首次上线必须写前端组件，之后同类栏目才是纯配置。

---

## 九、插图定位：候选识别方案

四类线索，按强度分级，产出写入 `illustration_candidates`：

| 线索 | 强度 | 规则 | 已验证 |
|---|---|---|---|
| `title-tu` | 强 | 书名含「圖」 | **全库 1504 部中命中 59 部**，如《大明玄天上帝瑞應圖錄》《洞玄靈寶五岳古本真形圖》《黃庭內景五臟六腑補瀉圖》《大易象數鉤深圖》 |
| `inline-ref` | 强 | 行内出现「如左圖」「右圖」「圖曰」「其圖如後」等指示语 | 待扫描 |
| `glyph-suffix` | 中 | 短行且以 `[品篇章訣符圖讚頌咒誥]` 结尾，复用 `lib/text-parser.ts:247` 现有判断 | 已有实现可复用 |
| `low-confidence` | 中 | 低置信度块聚集区。符箓、表文类典籍低置信度率最高，很可能**原书此处本是图，OCR 后成了乱码或空白** | `docs/parse-report.md` |

脚本形态：`scripts/scan-illustration-candidates.ts`，与 `build-index` 同类，可重复运行、幂等。

**一个必须说清的边界**：txt 语料不含版面信息，自动识别只能定位「哪里缺图」，
不能产出图本身。真图需从影印底本另行获取（馆藏数字化资源等），这是资料工作，不是技术问题。

---

## 十、媒体与存储

| 类型 | 方案 | 理由 |
|---|---|---|
| 图片 | R2 / Vercel Blob + CDN，`sharp` 压缩（已有依赖） | 沿用现有压缩脚本思路 |
| 音频 | R2 + CDN，直传 | 273 MB 存量需迁移 |
| 视频 | **Cloudflare Stream 或 Mux** | 转码、多码率、防盗链自建成本极高，不自建 |

**存量迁移注意**：把 `public/audio` 从当前提交移除只能止血，
历史 commit 里的 273 MB 仍在 Git 对象库中。彻底瘦身需 `git filter-repo` 重写历史，
这会改变所有 commit hash，需团队协调，建议单独排期、单独执行。

---

## 十一、分期路线图

每期结束都应是**可独立上线、可回滚**的状态。

### 阶段 0 · 地基（阻塞全部后续）

- Next 16.2.2 → ≥ 16.2.6（Payload 前置要求 + 修 CVE）
- SQLite → Postgres，保持 `lib/db.ts` 函数签名不变，仅换实现
- 接入对象存储，`public/audio`、`public/images` 迁出，前台改引 CDN
- `users` 增加 `role` / `status` / `region`，`auth.ts` session 带出 role

**验收**：Vercel 生产环境登录、进度同步、UGC 发布重启后不丢；仓库新增提交不再带媒体文件。

### 阶段 1 · UGC 审核台 + 双区策略引擎

- `moderation_records` 建表；`annotations` / `comments` 状态枚举扩展
- `lib/moderation/policy.ts` 策略矩阵 + `DZ_REGION`
- 规则前置层（敏感词、硬规则）+ LLM 审核（走 `lib/agent/` provider）
- `/studio/moderation` 队列页 + 决策 API + 封禁

**验收**：发一条违规评论，`ai-gate` 下先发后审并自动下架，队列可见，人工可恢复，日志完整。

### 阶段 2 · CMS 接入与道乐迁移

- Payload 3 接入同一应用，Postgres 适配器，S3/R2 存储适配
- `media_assets` 建为 Payload collection，字段含全部来源审核字段
- `lib/music-catalog.ts` 的 5 主题曲目迁入 `channels` + `channel_items`
- 道乐页改为读库

**验收**：后台上传一首真实道乐录音，填齐来源与授权，前台道乐页无需发版即可看到。

### 阶段 3 · 配图候选与锚定工作台

- `scripts/scan-illustration-candidates.ts` 四类线索扫描
- `illustration_anchors` 建表，`data/ritual-illustrations.json` 数据迁入
- `/studio/illustrations`：候选队列 + 阅读器内定位界面
- 阅读页注入逻辑切数据源

**验收**：从 59 部书名含「圖」的典籍中选一部，走完「候选 → 上传 → 定位 → 前台可见」。

### 阶段 4 · 栏目频道与视频文献

- `channels` / `channel_items` + `app/c/[slug]` 类型分发渲染
- 视频接入 Stream/Mux，新增「仪式」「步法」栏目

### 阶段 5 · 投稿制与大陆版

- `contributions` 全链路，按策略矩阵分流（海外版：媒体 `ai-fast`、图书 `ai-then-human`）
- 大陆版独立部署 —— **已决定推迟**（见 §13），资质路径明确前不投入部署工作。
  §7 的策略矩阵与 `region` 字段先按双区设计落地，届时只需增加部署，不改代码。

### 阶段 6 · 论坛

**建议不要自研。** 论坛是完整子系统（帖子、楼层、通知、反垃圾、声望、搜索）。
两条路：接 Discourse 做 SSO；或先把 `comments` 升级为「主题帖 + 回复」轻量验证社区活跃度。
在审核台成熟前开论坛，会被垃圾内容淹没。

---

## 十二、风险登记

| 风险 | 影响 | 缓解 |
|---|---|---|
| 大陆宗教信息服务资质 | **可能阻断大陆版** | 阶段 5 前单独确认，技术侧先不投入 |
| Git 历史 273 MB 音频 | 克隆慢、CI 慢 | 单独排期 `git filter-repo`，需团队协调 |
| Payload 与 Next 版本耦合 | 未来 Next 升级受制于 Payload 支持节奏 | 业务数据在自有 Postgres 表，Payload 只做管理界面，必要时可弃用 |
| AI 审核误判 | 正常内容被下架伤害用户 | 保留申诉入口；`ai-gate` 先发后审降低体感；日志可追溯 |
| AI 审核成本 | 量大后费用上升 | 规则前置拦截大多数请求；审核配额与用户配额隔离 |
| 解析器升级导致锚点漂移 | 插图错位 | 锚点以 `anchor_key`（行号+前缀）为准，`block_id` 仅缓存，升级后重算 |
| 用户上传图书版权 | 法律风险 | `source_note` / `claimed_license` 必填；点校本、影印本不适用「古籍=公有领域」 |
| 两套账号造成运营困惑 | 体验成本 | 运营者人数少，可接受；文档说明清楚 |

---

## 十三、决策记录

### 已定（2026-08-10）

| 议题 | 决策 | 依据 |
|---|---|---|
| CMS 选型 | **Payload CMS 3** | 已验证支持 Next 16.2.x，最低要求 16.2.6；项目当前 16.2.2，升一个补丁版即可，且顺带修 CVE |
| 大陆版时机 | **推迟**，先只做海外版 | 互联网宗教信息服务资质短期无解；§7 的双区设计与 `region` 字段先保留，不投入部署工作 |
| 对象存储 | **Cloudflare R2**（S3 兼容） | 出网免费，适合长期分发数百 MB 音频；同一个桶后续可被 Payload 的 S3 适配器复用 |
| 账号体系 | 前台 Auth.js 与 Payload 账号**分离** | 见 §4.4 |

### 仍待确认

1. **Git 历史重写**：是否接受一次性 `git filter-repo`（所有 commit hash 变更）？
   阶段 0 只做「停止追踪」止血，彻底瘦身需单独排期。
2. **论坛**：接 Discourse，还是先把现有评论升级为主题帖？（阶段 6 前定即可）
3. **审核 AI**：沿用现有 DeepSeek 配置，还是审核用单独的模型与密钥？（阶段 1 前定）

### 施工计划

阶段 0 已展开为逐步施工计划：
[`docs/superpowers/plans/2026-08-10-phase0-infrastructure.md`](superpowers/plans/2026-08-10-phase0-infrastructure.md)

---

## 附：本方案不做的事

明确排除，避免范围蔓延：

- ❌ 典籍原文的在线编辑器（违反底稿不可变）
- ❌ 把 1504 部典籍导入 CMS 数据库
- ❌ 自研视频转码与流媒体
- ❌ 自研论坛引擎
- ❌ 打通前台账号与 Payload 账号
- ❌ 引入状态管理库或 UI 组件库
