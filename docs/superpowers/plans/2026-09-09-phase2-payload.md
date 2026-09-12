# 阶段 2 · Payload CMS 接入 Implementation Plan

> **For agentic workers:** 本增量只做「CMS 能独立登录」，不做媒体库、道乐迁库、S3 插件。

**Goal:** 在同一 Next 应用内挂上 Payload 3 管理端 `/admin`，与前台 Auth.js `users` 表隔离。

**Architecture:** 前台页面迁入 `app/(site)`，Payload 放 `app/(payload)`，两组布局各自管 `html/body`。Payload 表进 Postgres schema `payload`，运营账号 collection 为 `payload-admins`，绝不占用 `users`。

**Tech Stack:** Payload 3 + `@payloadcms/next` + `@payloadcms/db-postgres` + Lexical 编辑器（框架要求，本轮无内容模型）。

## Global Constraints

- 原文 JSON 不可改
- 前台 Auth.js 与 Payload 账号不打通
- 不引入前台 UI 组件库（Payload Admin 仅服务 `/admin`）
- 不用 `--legacy-peer-deps`
- 本轮不做：`media` 上传（会落到本地盘）、S3 插件、道乐迁库、视频

## 已交付（Slice 1）

1. Payload 依赖与 `withPayload(nextConfig)`
2. `payload-admins` + schema `payload`
3. `/admin` 路由与 REST `/api/*` catch-all（更具体的现有 API 优先）
4. `/studio` 链到 CMS（提示另一套登录）
