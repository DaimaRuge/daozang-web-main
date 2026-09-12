# Spec: 原书插图正文落点 + 高清 PNG 复原（悬停对照原图）

> 日期：2026-09-11
> 状态：草案，待确认后按计划实现
> 来源：Images-Daozang-Data（本地 `data/images-daozang/`，约 48012 张，450 部书已与本站 txt 全等对位）

## Objective

两件独立、可分开验收的工作：

1. **落点**：把索引里的图插进对应阅读页正文。默认展示高清透明 PNG（有则用之，无则用原扫描）；**原图永不删除、永不覆盖**。鼠标悬停（触屏长按）对照原扫描，因为 AI / 生图软件不能保证与原图一模一样。
2. **复原**：在原扫描库上生成高清透明 PNG。模糊的优先走 libtv CLI 图生图；能上色的上色（符箓默认朱砂红），出红色时**同时**留一份墨线黑。

成功：读者在正文里看到清晰符图叠在宣纸上；随时能对照原扫描；朱/墨两份几何一致；原文件只读。

## Assumptions（不对就改这一节）

1. 对位已经完成（450/450 书、偏移抽样 40/40），本轮不再重跑全库对齐，只修「展示哪张图」。
2. 「数据库的图」= Images-Daozang-Data 的原扫描 + 索引，不是 Postgres。
3. 正文默认：**有复原则显示复原，没有则显示原扫描**。悬停/长按才出原图。
4. 触屏没有 hover：长按对照；另提供「对照原图」开关，避免只能用鼠标。
5. 朱砂色用站点令牌 `--cinnabar: #a83f39`。符/印/箓默认展示朱砂；其它插图（人、器、表、山水）默认墨线，不强行涂红。
6. **上色是展示层**：先得到与原图同构图的墨线高清稿，再本地染色成朱砂。这样红/黑两份笔画一致，避免生图软件各画一版。
7. libtv 负责「去糊、放大、清线」；若输出与输入字节级相同或尺寸几乎不变，视为失败，回退本地 Lanczos + 抠纸色（现有 `lib/daozang-restore-image.ts`）。
8. 不一次性对 48012 张跑 libtv。先试点《太上秘法鎮宅靈符》`45bee8697b49563d`，再扩到神符類，其余按书排队。
9. 复原图必须标注 AI；原扫描标注「原书插图」。二者不得混称为原文。
10. 不引入 UI 库；不改 `public/data/content/*.json` 原文。

## Content boundary

| 层 | 是什么 | 规则 |
|---|---|---|
| 原扫描 | 典籍组成部分 | 只读；API 始终能单独取到 |
| 结构化落点 | 按 txt 字符偏移插入 image 块 | 不改原文块 |
| AI 复原 / 朱砂染色 | 增强层 | 显式标注；悬停可对原图 |

## Display contract

阅读页每个原书插图块同时携带：

- `content`：当前展示 URL（复原默认图，否则原扫描）
- `originalSrc`：原扫描 URL（始终存在）
- 可选 `inkSrc` / `cinnabarSrc`：墨线 / 朱砂 PNG

交互：

- 指针设备：悬停或键盘焦点 → 叠原扫描（预加载，无空白闪一下）
- 触屏：长按 ≥ 400ms 对照；松开关回
- 有朱+墨两份时：图下小切换「朱砂 / 墨线」，默认符类朱砂、其它墨线
- 图注：`〔原书插图 · AI 复原〕` + 「悬停或长按对照原扫描」

## API contract

当前 `/api/daozang-images/[part]/[file]` **有复原就永远返回复原**，悬停无法拿到原图。改为按文件名精确取，不再偷偷替换：

| 请求 | 文件 |
|---|---|
| `…/洞真部/CNDZ…image086.jpg` | 原扫描（`data/images-daozang/data/images/…`） |
| `…/洞真部/CNDZ…image086.png` | 默认复原（符类指向朱砂，否则墨线） |
| `…/洞真部/CNDZ…image086.ink.png` | 墨线透明 PNG |
| `…/洞真部/CNDZ…image086.cinnabar.png` | 朱砂透明 PNG |

原扫描路径不存在 → 404。不要用复原图顶替原图请求。

磁盘约定：

```
data/images-daozang/data/images/<部>/<原名.jpg|png>   # 只读原图
data/images-daozang/restored/<部>/<stem>.ink.png
data/images-daozang/restored/<部>/<stem>.cinnabar.png
data/images-daozang/restored/<部>/<stem>.png          # 默认展示，复制或指向上面之一
```

## Restore pipeline

```
原扫描（只读）
  → libtv image2image（失败则本地 Lanczos）
  → 抠纸色透明 PNG（墨线）
  → 若判定为符/印/箓：同像素染 #a83f39 → 朱砂 PNG
  → 写入 restored/，不覆盖 data/images/
```

符类判定（先到先得）：

1. 书目 `subcategory` 含「神符」或书名含「符」
2. 图前锚点 / 宿主段落含 `符|籙|箓|印`
3. 否则仅出墨线，不出朱砂

libtv 提示要点：一比一修线、保持纵横比、不要添笔画、不要装饰背景。朱砂**不**靠第二次生图，靠本地染色。

## Success criteria

- 《太上秘法鎮宅靈符》第 5 页：正文是透明复原 PNG；悬停/长按出现原扫描；原文件字节不变
- 该页 image086 同时有 `.ink.png` 与 `.cinnabar.png`，尺寸相同，仅墨色不同
- `GET …image086.jpg` 的 `X-Daozang-Image: scan`；`GET …image086.png` 为 restored
- 无复原的书仍插入原扫描，图注不出现「AI 复原」
- `npm test -- tests/daozang-images.test.ts tests/daozang-restore-image.test.ts` 通过

## Commands

```
Dev:      npm run dev -- -p 4173
Align:    npm run align:images          # 已有，本轮一般不用重跑
Restore:  npx tsx scripts/restore-daozang-images.ts --bookId 45bee8697b49563d --limit=1
Test:     npm test -- tests/daozang-images.test.ts tests/daozang-restore-image.test.ts
```

## Boundaries

- Always：原图只读；复原标 AI；悬停能对原图；红/黑几何一致
- Ask first：对全库跑 libtv、换生图模型、改朱砂色值、把复原图当「正式史料」
- Never：改原文 JSON；用复原覆盖扫描目录；把 AI 符图说成原书

## Open questions

无阻塞问题。若要「正文默认原图、复原另开」，或「全部插图都涂朱砂」，改 Assumptions 3 / 5 后再动代码。
