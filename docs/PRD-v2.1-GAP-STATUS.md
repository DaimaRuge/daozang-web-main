# PRD v2.1 功能对照清单

> 对照《道藏阅读器功能迭代需求文档 v2.1》与当前代码库。  
> 状态：**DONE** / **PARTIAL** / **NOT STARTED**

最后更新：2026-07-18

---

## §2 阅读体验优化（P0）

| ID | 需求 | 状态 | 实现位置 |
|----|------|------|----------|
| 2.1a–c | 目录跳转 / 展开 / 高亮 | **DONE** | `TocPanel.tsx` + `Reader.tsx` |
| 2.2a–h | 分页阅读 + API + 进度恢复 | **DONE** | `PageControls`、`book-pagination`、articles API |
| 2.3a–c | 全局道乐 | **DONE** | `MusicProvider` + `GlobalMusicBar` |

---

## §5 阅读体验技术要点

| ID | 需求 | 状态 | 实现位置 |
|----|------|------|----------|
| 5.1 | URL `volume` + `page` | **DONE** | `syncReadingUrl` |
| 5.2–5.3 | 分页 / 目录 API | **DONE** | `/api/articles/...` |
| 5.4 | 进度落库 | **DONE** | 登录用户 `POST /api/progress` → SQLite |
| 5.5 | 埋点上报 | **DONE** | `trackEvent` → `POST /api/events` |

---

## P0 — AI 问道与解释

| 需求 | 状态 | 说明 |
|------|------|------|
| 划词「问道」/ 译文 | **DONE** | `ExplainPanel` + SSE |
| 独立 `/ask` 页 | **DONE** | 流式对话 + 推荐问题 |
| DeepSeek 双模型 | **DONE** | `v4-pro` / `v4-flash`，`.env` 配置 |
| 流式输出 SSE | **DONE** | `/api/agent` + `sse-client` |
| 免费配额 5 次/日 | **DONE** | `lib/agent/quota.ts`（匿名 5 / 登录 50） |
| 本页 AI 摘要 | **DONE** | `generate_summary` + 阅读器「本页摘要」 |
| 对话历史（会话级） | **DONE** | `/ask` → `sessionStorage` 最近 5 轮 |
| 查询日志 JSONL | **NOT STARTED** | Sprint A8 |
| 云端多端对话历史 | **NOT STARTED** | 依赖账号扩展 |

---

## P0 — AI 插画生成

| 需求 | 状态 | 说明 |
|------|------|------|
| 道乐 59 张配图 | **DONE** | `public/images/music/*.jpg` |
| 在线「生成插图」 | **DONE** | `POST /api/illustrations` + 划词「插图」 |
| 异步任务 + SQLite | **DONE** | `article_illustrations`（无 BullMQ，MVP 够用） |
| 生产独立 worker | **PARTIAL** | 依赖本机 libtv；Vercel 无 CLI |

---

## P1 — 账号与同步

| 需求 | 状态 | 说明 |
|------|------|------|
| 注册 / 登录 | **DONE** | Auth.js Credentials + `/login` |
| OAuth | **NOT STARTED** | |
| 进度云端同步 | **DONE** | SQLite `reading_progress` |
| 笔记云端同步 | **NOT STARTED** | 仍 localStorage |

---

## P2–P4

| 模块 | 状态 |
|------|------|
| 阅读计划 / 报告 | **NOT STARTED** |
| 热门榜单 / 推荐 | **PARTIAL** |
| 个人资产 / 功德点 | **NOT STARTED** |
| AI 视频器物 | **NOT STARTED** |
| 道者 Web Agent 形象 | **NOT STARTED** |
| 同兴趣社交 | **NOT STARTED** |

---

## 建议下一步

1. **提交并部署**本批改动（含道乐配图、Auth、SSE、配额、插画、埋点）
2. **Vercel 环境变量**：`AUTH_SECRET`、`DZ_LLM_*`（生产无 better-sqlite3 持久盘时需换 Turso/Neon）
3. **A8 查询日志** / 笔记云同步 / OAuth

---

## 相关 API 速查

```
GET  /api/agent
POST /api/agent          # tool | chat | quota；stream: true → SSE
POST /api/illustrations
GET  /api/illustrations?jobId=
POST /api/events
POST /api/progress
GET  /api/progress?bookId=
POST /api/auth/register
*    /api/auth/[...nextauth]
GET  /api/articles/{id}/toc
GET  /api/articles/{id}/page/{page_num}?volume={blockId}
```
