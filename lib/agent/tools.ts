/**
 * Agent 工具注册中心（仅服务端使用，因为部分工具需要读文件系统）。
 *
 * 为什么用「注册表」而不是让模型直接访问数据：
 * 1. 模型绝不直接触碰文件系统 / 数据库，所有数据访问必须经过声明式工具，
 *    每个工具自带输入校验与权限要求，调用统一走 executeTool 以便记录日志；
 * 2. 工具清单本身就是给 LLM 的 function-calling 描述，集中注册可自动生成
 *    工具 schema，避免代码与提示词两处维护；
 * 3. 未来 Android / iOS 客户端通过同一套 Agent API 使用这些工具。
 *
 * 当前状态：数据检索类工具已可用（基于现有索引）；AI 生成类与用户数据类
 * 工具为声明式占位（notImplemented），接口先行、实现分期落地。
 */

import { getIndex, getEntryById, searchEntries, getContentById } from '@/lib/data';
import { searchFullText } from '@/lib/fulltext-search';
import { parseText } from '@/lib/text-parser';
import { AgentContext, PermissionContext } from './context';
import { getProvider } from './provider';

/** 工具定义：name/description 将来直接作为 LLM function-calling 的元数据 */
export interface AgentTool {
  name: string;
  description: string;
  /** 所需权限，executeTool 统一校验 */
  requires: keyof PermissionContext | null;
  /** 输入校验：返回错误信息或 null。工具自身不信任任何入参 */
  validate(input: Record<string, unknown>): string | null;
  execute(input: Record<string, unknown>, context: AgentContext): Promise<unknown>;
}

const registry = new Map<string, AgentTool>();

export function registerTool(tool: AgentTool): void {
  registry.set(tool.name, tool);
}

export function listTools(): Pick<AgentTool, 'name' | 'description'>[] {
  return Array.from(registry.values()).map(({ name, description }) => ({ name, description }));
}

/** 统一执行入口：权限检查 → 输入校验 → 执行 → 日志。禁止绕过本函数直接调工具 */
export async function executeTool(
  name: string,
  input: Record<string, unknown>,
  context: AgentContext,
): Promise<{ ok: boolean; result?: unknown; error?: string }> {
  const tool = registry.get(name);
  if (!tool) return { ok: false, error: `未知工具: ${name}` };

  if (tool.requires && !context.permissions[tool.requires]) {
    return { ok: false, error: `权限不足: 需要 ${tool.requires}` };
  }

  const invalid = tool.validate(input);
  if (invalid) return { ok: false, error: `参数错误: ${invalid}` };

  try {
    const result = await tool.execute(input, context);
    console.info('[agent-tool]', name, { ok: true });
    return { ok: true, result };
  } catch (e) {
    console.error('[agent-tool]', name, e);
    return { ok: false, error: e instanceof Error ? e.message : '工具执行失败' };
  }
}

// ---------- 已实现工具（基于现有静态索引） ----------

registerTool({
  name: 'search_books',
  description: '按书名、作者或关键词搜索道藏典籍，返回匹配条目列表',
  requires: null,
  validate: input => (typeof input.query === 'string' && input.query.trim() ? null : 'query 必填'),
  async execute(input) {
    const { results, total } = searchEntries(String(input.query), 1, 10);
    return {
      total,
      books: results.map(e => ({ id: e.id, title: e.title, category: e.category, author: e.author })),
    };
  },
});

registerTool({
  name: 'search_full_text',
  description: '在全部经文正文中检索关键词，返回命中典籍与上下文摘要（AI 回答引用原文的主要来源）',
  requires: null,
  validate: input => (typeof input.query === 'string' && input.query.trim() ? null : 'query 必填'),
  async execute(input) {
    const { results, total } = searchFullText(String(input.query), 1, 10);
    return { total, hits: results };
  },
});

registerTool({
  name: 'get_book_metadata',
  description: '获取指定典籍的元数据（书名、部类、作者、规模）',
  requires: null,
  validate: input => (typeof input.bookId === 'string' ? null : 'bookId 必填'),
  async execute(input) {
    const entry = getEntryById(String(input.bookId));
    if (!entry) throw new Error('典籍不存在');
    return entry;
  },
});

registerTool({
  name: 'get_chapter_content',
  description: '获取典籍的结构化内容（含标题层级与段落块），可按块 ID 范围截取',
  requires: null,
  validate: input => (typeof input.bookId === 'string' ? null : 'bookId 必填'),
  async execute(input) {
    const bookId = String(input.bookId);
    const entry = getEntryById(bookId);
    if (!entry) throw new Error('典籍不存在');
    const content = getContentById(bookId);
    const parsed = parseText(content, bookId, entry.title);
    // 输出给模型时截断，避免整本书塞进上下文
    return { toc: parsed.toc, blocks: parsed.blocks.slice(0, 200) };
  },
});

registerTool({
  name: 'get_current_reading_context',
  description: '获取用户当前的阅读上下文（正在读哪本书、哪一段、选中了什么）',
  requires: null,
  validate: () => null,
  async execute(_input, context) {
    return context.reading ?? null;
  },
});

registerTool({
  name: 'find_related_books',
  description: '根据指定典籍查找同分类的相关典籍',
  requires: null,
  validate: input => (typeof input.bookId === 'string' ? null : 'bookId 必填'),
  async execute(input) {
    const entry = getEntryById(String(input.bookId));
    if (!entry) throw new Error('典籍不存在');
    return getIndex()
      .entries.filter(e => e.category === entry.category && e.id !== entry.id)
      .slice(0, 10)
      .map(e => ({ id: e.id, title: e.title, author: e.author }));
  },
});

// ---------- AI 生成类工具 ----------

/**
 * AI 解释的系统提示词：内容边界与学术严谨性的核心约束在此固化 ——
 * 必须区分原文与推断、不得虚构出处、不确定处如实说明。
 */
const EXPLAIN_SYSTEM_PROMPT = [
  '你是道藏典籍阅读助手，帮助现代读者理解道教经文。',
  '用户会给出一段经文原文及其出处，请用平实的现代汉语解释其含义。',
  '要求：',
  '1. 先给出整体大意，再解释关键词语（术语、人名、典故）；',
  '2. 严格区分「原文说了什么」与「你的推断/背景补充」，推断部分明确说明；',
  '3. 不得虚构典籍出处、人物言论；对无法确定的含义如实说「此处含义存疑」；',
  '4. 保持学术中立，不做戏谑化表达，不以现代观点简单否定历史语境；',
  '5. 回答控制在 300 字以内，简体中文。',
].join('\n');

registerTool({
  name: 'explain_selected_text',
  description: '用现代汉语解释用户选中的经文片段（AI 生成内容，输出必须标注）',
  requires: 'canUseAI',
  validate: input =>
    typeof input.text === 'string' && input.text.trim()
      ? input.text.length > 2000
        ? '选中文本过长（上限 2000 字）'
        : null
      : 'text 必填',
  async execute(input, context) {
    const provider = getProvider();
    if (!provider.isConfigured()) throw new Error('AI 服务尚未配置');

    // 携带阅读上下文中的出处信息，让解释有据可依，也便于回答中引用
    const bookTitle = context.reading?.bookTitle ?? '未知典籍';
    const reply = await provider.chat([
      { role: 'system', content: EXPLAIN_SYSTEM_PROMPT },
      { role: 'user', content: `出处：《${bookTitle}》\n\n原文：\n${String(input.text)}` },
    ]);

    return {
      // 显式标注为 AI 生成：前端必须按此字段与原文区分展示
      aiGenerated: true,
      explanation: reply,
      citations: context.reading?.bookId
        ? [{ bookId: context.reading.bookId, bookTitle, blockId: context.reading.blockId, quote: String(input.text).slice(0, 100) }]
        : [],
    };
  },
});

/** 现代汉语转写的系统提示词：直译优先、不增删义项、存疑标注 */
const TRANSLATE_SYSTEM_PROMPT = [
  '你是道藏典籍翻译助手，将文言经文转写为现代汉语。',
  '要求：',
  '1. 逐句对应转写，忠实原文，不增加原文没有的内容，不省略原文内容；',
  '2. 专有名词（神名、术语、典籍名）保留原文并在括号内简注；',
  '3. 无法确定含义的句子保留原文并标注「〔此句存疑〕」，不得强行编造译文；',
  '4. 只输出译文本身，不加评论；简体中文。',
].join('\n');

registerTool({
  name: 'translate_to_modern_chinese',
  description: '将选中的文言经文逐句转写为现代汉语（AI 生成内容，输出必须标注）',
  requires: 'canUseAI',
  validate: input =>
    typeof input.text === 'string' && input.text.trim()
      ? input.text.length > 2000
        ? '选中文本过长（上限 2000 字）'
        : null
      : 'text 必填',
  async execute(input, context) {
    const provider = getProvider();
    if (!provider.isConfigured()) throw new Error('AI 服务尚未配置');

    const bookTitle = context.reading?.bookTitle ?? '未知典籍';
    const reply = await provider.chat(
      [
        { role: 'system', content: TRANSLATE_SYSTEM_PROMPT },
        { role: 'user', content: `出处：《${bookTitle}》\n\n原文：\n${String(input.text)}` },
      ],
      // 翻译任务用更低温度，追求稳定忠实而非发挥
      { temperature: 0.1 },
    );

    return {
      aiGenerated: true,
      explanation: reply,
      citations: context.reading?.bookId
        ? [{ bookId: context.reading.bookId, bookTitle, blockId: context.reading.blockId, quote: String(input.text).slice(0, 100) }]
        : [],
    };
  },
});

// ---------- 占位工具（接口先行，依赖 AI 供应商或用户系统，分期实现） ----------

const PLANNED_TOOLS: Array<{ name: string; description: string; requires: keyof PermissionContext | null }> = [
  { name: 'compare_passages', description: '对比多个经文段落的异同（依赖模型供应商）', requires: 'canUseAI' },
  { name: 'find_related_concepts', description: '查找相关概念（依赖知识图谱，规划中）', requires: null },
  { name: 'create_note', description: '为用户创建笔记（依赖用户数据同步服务）', requires: 'canWriteUserData' },
  { name: 'update_note', description: '更新用户笔记', requires: 'canWriteUserData' },
  { name: 'save_bookmark', description: '为用户保存收藏', requires: 'canWriteUserData' },
  { name: 'create_reading_list', description: '创建阅读清单', requires: 'canWriteUserData' },
  { name: 'generate_summary', description: '生成章节摘要（AI 生成内容，输出必须标注）', requires: 'canUseAI' },
  { name: 'generate_study_outline', description: '基于用户笔记生成学习提纲', requires: 'canUseAI' },
  { name: 'generate_audio_script', description: '生成有声典籍讲解脚本', requires: 'canUseAI' },
  { name: 'generate_video_script', description: '生成章节导读视频脚本', requires: 'canUseAI' },
  { name: 'recommend_next_reading', description: '推荐下一步阅读内容', requires: null },
];

for (const t of PLANNED_TOOLS) {
  registerTool({
    ...t,
    validate: () => null,
    async execute() {
      throw new Error(`工具 ${t.name} 尚未实现（接口已预留）`);
    },
  });
}
