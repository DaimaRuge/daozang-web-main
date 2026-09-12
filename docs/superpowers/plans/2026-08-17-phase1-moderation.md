# 阶段 1 · UGC 审核台 Implementation Plan

> **For agentic workers:** 阶段 1 最小审核台、LLM 初审与来稿薄切片已落地。

**Goal:** 让运营能处理被举报/待审的旁注、评论与投稿，并封禁用户；策略矩阵按部署区域决定新内容的默认状态。新文本 UGC 在配置了密钥后走 LLM 结构化初审。媒体投稿只审标题与来源说明，不审像素。

**Architecture:** 审核记录只增不改；前台读者仍走 Auth.js；`/studio` 用 `requireRole('moderator')`。LLM 经 `lib/agent/pi.ts`（pi-ai Models）与 `pi-agent-core` Agent 工具调用；解析失败 → `flag` 进队列，不得默认放行。投稿表 `contributions` 直接存 `storage_key`，不建 `media_assets`（留给 Payload）。

**Tech Stack:** 现有 Next.js + Postgres + Auth.js + `@earendil-works/pi-agent-core` + S3 兼容预签名直传。

## 已交付

1. `moderation_records` 表 + 队列/决策数据函数
2. `lib/moderation/policy.ts` 策略矩阵 + 硬规则前置
3. `/studio`、`/studio/moderation` 与 `/api/studio/*`
4. 登录拒绝 `banned` 用户
5. 举报达阈值隐藏时写入审核记录
6. LLM 初审（`lib/moderation/review.ts`）+ `DZ_LLM_PROVIDER` 切换
7. 来稿薄切片：`contributions` 表、预签名直传、`/contribute`、审核队列预览（image/audio/book；不做 video）

## 明确不做（下一增量）

- Payload CMS
- 视频转码 / Stream
- Task 8 媒体出 Git
