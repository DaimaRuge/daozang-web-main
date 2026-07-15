# 道可道 · 道藏经文藏书阁

道藏经文在线阅读平台，收录正统道藏、续道藏共计 1500 余部经典文献。

## 在线访问

👉 [daozang.vercel.app](https://daozang.vercel.app)

## 功能

- 📖 结构化阅读器：书名/卷/篇品/段落自动识别，目录导航，服务端渲染正文（SEO 友好）
- 🎨 阅读设置：字号、行距、宽度、宣纸/护眼/夜间三套主题，本地记忆
- ✍️ 划词操作：选中文字即可复制、收藏段落、添加笔记（AI 解释入口已预留）
- 🏠 我的书房：最近阅读（含进度）、收藏、笔记，数据保存在浏览器本地
- 🔍 双模式搜索：书名搜索 + 全文搜索（上下文摘要与关键词高亮）；简体查询自动命中繁体语料；阅读器内书内搜索定位
- 📚 按部类分类浏览（洞真部、洞玄部、洞神部、太平部、太清部、太玄部、正一部、续道藏）
- 🤖 智能问道：AI 对话页（概念级检索增强、带原文引用）+ 划词 AI 解释/现代汉语转写 + 阅读页「问道此书」带上下文进入对话（需配置 OpenAI 兼容服务环境变量，见 `docs/ARCHITECTURE.md`）；`/api/agent` 工具调用接口与 AgentContext 上下文契约
- 🛠 解析人工审核：开发环境 `/review` 页逐块校正低置信度解析结果，校正数据随代码提交生效
- 🎵 道乐（`/music`）：五行 + 八卦主题 AI 背景器乐、水墨配图、《道德经》AI 朗读（`scripts/gen-music.ps1`、`scripts/gen-bagua-music.ps1`）
- 📂 沉浸式目录：部类英雄横幅、探索路径、标签云筛选、卡片式书目、本地搜索排序（`components/catalog/`）
- 🖼 科仪示意图：LLM 解读科仪段落 → 生成示意图 → 阅读页原文锚点后注入（`data/ritual-illustrations.json`，示例：《北斗本命延壽燈儀》）
- 📋 一键复制全文
- 📱 移动端适配（底部工具栏 + 目录抽屉）
- 🔗 上一篇/下一篇导航
- 📑 SEO 优化（sitemap、Open Graph、独立页面 metadata）

## 技术栈

- **Next.js 16** (App Router)
- **TypeScript**
- **Tailwind CSS 4**
- **Vercel** 部署

## 数据来源

所有经文文本来源于开源项目 [DaimaRuge/daozang-text](https://github.com/DaimaRuge/daozang-text)，仅供学术研究与个人学习用途。

## 本地开发

```bash
# 克隆仓库
git clone https://github.com/DaimaRuge/daozang-web.git
cd daozang-web

# 安装依赖
npm install

# 拉取文本数据
git clone https://github.com/DaimaRuge/daozang-text.git data/daozang-text

# 构建数据索引
npm run build-index

# 启动开发服务器
npm run dev
```

## 测试

```bash
npm run lint   # ESLint
npm test       # 单元测试（解析器 / 检索层 / 人工校正层）
```

打开 http://localhost:3000

## 构建

```bash
npm run build
npm start
```

## 部署到 Vercel

1. Fork 本仓库
2. 在 [Vercel](https://vercel.com) 导入该仓库
3. 设置构建命令：`npm run build`（prebuild 脚本会自动构建索引）
4. 部署

**注意**: Vercel 构建时需要 `data/daozang-text` 目录。确保在仓库中包含该数据目录，或在 Vercel 构建设置中添加：

```
Build Command: git clone https://github.com/DaimaRuge/daozang-text.git data/daozang-text && npm run build
```

## 免责声明

本站所有经文文本仅供学术研究、文化交流与个人学习之用途。道藏原文的版权归属于相关权利人。本站不声称对所收录文本拥有任何版权。如有任何版权问题，请联系管理员。

## License

- **代码**: MIT
- **数据**: 请参阅 [DaimaRuge/daozang-text](https://github.com/DaimaRuge/daozang-text) 的许可证
