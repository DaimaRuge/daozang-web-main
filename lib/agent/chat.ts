/**
 * 问答对话运行时（服务端）。
 *
 * 为什么单独拆一个模块而不是写在 API 路由里：
 * 对话逻辑 = 系统提示词 + 上下文注入 + 检索增强 + 供应商调用，
 * 这是 Agent Runtime 的雏形，未来的推荐、笔记整理等 Agent 复用同一套
 * 组装逻辑；API 路由只负责 HTTP 编解码。
 *
 * 检索增强（v1，轻量）：从用户问题中提取书名号内的典籍名做检索，
 * 命中的原文片段作为参考资料注入提示词，让回答有据可引。
 * 未做向量检索 —— 属路线图中期项，接口不变时可无缝升级。
 */

import { AgentContext, AgentMessage, Citation } from './context';
import { getProvider } from './provider';
import { searchEntries } from '@/lib/data';
import { searchFullText } from '@/lib/fulltext-search';

/** 问答系统提示词：学术严谨性约束在此固化 */
const CHAT_SYSTEM_PROMPT = [
  '你是「道可道」平台的道藏典籍阅读助手，帮助公众了解道教经典与传统文化。',
  '回答准则：',
  '1. 尽量引用具体典籍与篇目；下方若提供了「参考资料」，优先依据资料回答并注明出处；',
  '2. 严格区分史实、经文原意与你的推断，推断须明确说明「这是推断」；',
  '3. 不虚构典籍出处、不虚构人物言论、不擅自改写经文；',
  '4. 无法确定时如实说明不确定，不要编造；',
  '5. 对宗教内容保持尊重与学术中立，不做戏谑化表达；',
  '6. 回答简明（500 字以内），简体中文。',
].join('\n');

export interface ChatResult {
  reply: string;
  /** 本次回答实际参考的资料来源（前端据此展示引用） */
  citations: Citation[];
  aiGenerated: true;
}

/** 从问题中提取《书名号》内的典籍名，用于确定性检索 */
function extractBookTitles(question: string): string[] {
  return Array.from(question.matchAll(/《([^》]{1,20})》/g)).map(m => m[1]);
}

/**
 * 疑问/功能性词汇：从问题中剔除后剩下的片段即概念候选词。
 * 用「剔除停用词 + 标点切分」而非分词器：确定性、零依赖，
 * 对「什么是清静无为」「内丹和外丹有什么区别」这类问句足够有效。
 */
// 注意：正则交替从左到右取首个匹配，长短语必须排在其包含的短词之前
// （如「有什么」在「什么」之前），否则会留下残字黏在概念词上
const STOPWORDS_RE = new RegExp(
  [
    '有什么', '是什么', '什么是', '什么叫', '为什么', '什么样', '什么',
    '怎么样', '怎么', '如何', '为何', '是不是', '有没有', '有哪些',
    '哪些', '哪个', '哪里', '谁是', '多少',
    '请问', '请解释', '解释一下', '介绍一下', '讲讲', '说说', '告诉我',
    '的意思', '的含义', '意思', '含义', '区别', '关系', '异同',
    '是', '的', '和', '与', '或', '了', '吗', '呢', '啊', '这', '那', '它', '一下',
  ].join('|'),
  'g',
);

/** 概念候选词提取：去书名号内容 → 剔除停用词 → 按标点切分 → 取 2~8 字片段（导出供测试） */
export function extractConcepts(question: string): string[] {
  const withoutTitles = question.replace(/《[^》]*》/g, '，');
  const cleaned = withoutTitles.replace(STOPWORDS_RE, '，');
  const candidates = cleaned
    .split(/[，。？！、；：\s「」『』（）()？?!.,]+/)
    .map(s => s.trim())
    .filter(s => /^[\u3400-\u9fff]{2,8}$/.test(s));
  return Array.from(new Set(candidates)).slice(0, 3);
}

/** 组装参考资料：书名 + 概念级检索 + 阅读上下文，返回资料文本与引用列表 */
function buildReferences(question: string, context: AgentContext): { text: string; citations: Citation[] } {
  const citations: Citation[] = [];
  const parts: string[] = [];
  const citedBooks = new Set<string>();

  // 1. 问题中明确提到的典籍：取全文检索摘要作为参考
  for (const title of extractBookTitles(question).slice(0, 3)) {
    const { results } = searchEntries(title, 1, 1);
    const book = results[0];
    if (!book || citedBooks.has(book.id)) continue;
    citedBooks.add(book.id);
    const { results: hits } = searchFullText(title.length >= 2 ? title : book.title, 1, 1);
    const snippet = hits.find(h => h.entry.id === book.id)?.snippet ?? book.preview.slice(0, 150);
    parts.push(`《${book.title}》（${book.collection} · ${book.category}）片段：${snippet}`);
    citations.push({ bookId: book.id, bookTitle: book.title, quote: snippet.slice(0, 100) });
  }

  // 2. 概念级检索：候选概念词做全文检索（简繁变体已在检索层处理），
  //    每个概念取命中最多的前 2 部典籍片段作为参考
  for (const concept of extractConcepts(question)) {
    const { results: hits } = searchFullText(concept, 1, 2);
    for (const hit of hits) {
      if (citedBooks.has(hit.entry.id)) continue;
      citedBooks.add(hit.entry.id);
      parts.push(`《${hit.entry.title}》中与「${concept}」相关的片段：${hit.snippet}`);
      citations.push({ bookId: hit.entry.id, bookTitle: hit.entry.title, quote: hit.snippet.slice(0, 100) });
    }
    if (citedBooks.size >= 5) break; // 参考资料上限，控制提示词长度
  }

  // 3. 用户正在阅读的典籍：注入当前语境
  if (context.reading?.bookId) {
    const r = context.reading;
    parts.push(
      `用户当前正在阅读《${r.bookTitle ?? '未知典籍'}》${r.selectedText ? `，选中了原文：「${r.selectedText.slice(0, 200)}」` : ''}`,
    );
    if (!citedBooks.has(r.bookId)) {
      citations.push({ bookId: r.bookId, bookTitle: r.bookTitle ?? '', blockId: r.blockId });
    }
  }

  return { text: parts.join('\n\n'), citations };
}

export async function runChat(context: AgentContext): Promise<ChatResult> {
  const provider = getProvider();
  const messages = context.conversation?.messages ?? [];
  const lastUser = [...messages].reverse().find(m => m.role === 'user');
  if (!lastUser) throw new Error('对话中缺少用户消息');

  const { text: references, citations } = buildReferences(lastUser.content, context);

  const finalMessages: AgentMessage[] = [
    { role: 'system', content: CHAT_SYSTEM_PROMPT + (references ? `\n\n参考资料：\n${references}` : '') },
    // 只保留最近 10 轮，控制上下文长度与成本
    ...messages.slice(-10).map(m => ({ role: m.role, content: m.content })),
  ];

  const reply = await provider.chat(finalMessages, { maxTokens: 1200 });
  return { reply, citations, aiGenerated: true };
}
