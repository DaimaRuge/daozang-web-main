# Spec: 缺图候选导入与审核台清单

> 日期：2026-08-19
> 状态：实现中（用户指示继续；正式阅读页仍不插占位）
> 前置：`docs/superpowers/specs/2026-08-18-illustration-candidates-design.md`

## Objective

把扫描 JSON 幂等写入已预留的 `illustration_candidates`，并在 `/studio/illustrations` 提供只读清单：编辑可按类型筛选、跳转排版 demo 与正式阅读页。本轮不做上传、锚定、前台注入。

## Commands

```
Migrate: npm run migrate
Import:  npm run import:illustrations
Test:    npm test -- tests/illustration-import.test.ts
Dev:     /studio/illustrations（需 moderator）
```

## Boundaries

- Always：导入不覆盖已人工改过的 `state` / `resolved_anchor_id`
- Ask first：正式 `/text/[id]` 插占位；加宽检测线索
- Never：改原文 JSON；本轮做 Payload

## Success

- [x] 映射单测通过；无 Postgres 时导入脚本给出明确错误
- [x] `/studio/illustrations` 能列出伏魔 5 条正文槽，并链到 demo `?slot=`
- [x] 正式阅读页仍无缺图占位框
- [x] 本地 migrate + import 写入 648 条；再导入不覆盖人工 `state`
