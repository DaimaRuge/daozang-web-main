/**
 * 问答对话运行时（服务端）。
 *
 * 为什么单独拆一个模块而不是写在 API 路由里：
 * 对话逻辑 = 系统提示词 + 上下文注入 + 检索增强 + 供应商调用，
 * 这是 Agent Runtime 的雏形，未来的推荐、笔记整理等 Agent 复用同一套
 * 组装逻辑；API 路由只负责 HTTP 编解码。
 *
 * 检索增强：书名号 → 目录检索；问句概念 → 词表最长匹配（图谱 lexicon）
 * 再以停用词切分补位。命中实体时用提及边的 blockId 引文，否则全文检索。
 * 未做向量检索 —— 属路线图中期项，接口不变时可无缝升级。
 */

import { AgentContext, AgentMessage, Citation } from './context';
import { extractConcepts } from './concepts';
import { getProvider } from './provider';
import { searchEntries } from '@/lib/data';
import { searchFullText } from '@/lib/fulltext-search';
import {
  getConceptLexicon,
  mentionCitationsForQuery,
  resolveQuery,
} from '@/lib/graph/query';
import { queryVariants } from '@/lib/zh-convert';

export { extractConcepts } from './concepts';

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

/** 组装参考资料：书名 + 概念级检索 + 阅读上下文，返回资料文本与引用列表 */
async function buildReferences(question: string, context: AgentContext): Promise<{ text: string; citations: Citation[] }> {
  const citations: Citation[] = [];
  const parts: string[] = [];
  const citedBooks = new Set<string>();

  // 1. 问题中明确提到的典籍：取全文检索摘要作为参考
  for (const title of extractBookTitles(question).slice(0, 3)) {
    const { results } = searchEntries(title, 1, 1);
    const book = results[0];
    if (!book || citedBooks.has(book.id)) continue;
    citedBooks.add(book.id);
    const { results: hits } = await searchFullText(title.length >= 2 ? title : book.title, 1, 1);
    const snippet = hits.find(h => h.entry.id === book.id)?.snippet ?? book.preview.slice(0, 150);
    parts.push(`《${book.title}》（${book.collection} · ${book.category}）片段：${snippet}`);
    citations.push({ bookId: book.id, bookTitle: book.title, quote: snippet.slice(0, 100) });
  }

  // 2. 概念级检索：词表最长匹配 + 停用词补位。
  //    能解析到图谱实体时，直接用构建期扫好的提及出处（带 blockId）；
  //    未入词表的片段仍走全文检索。
  const concepts = extractConcepts(question, {
    lexicon: getConceptLexicon(),
    variants: queryVariants,
    canonicalId: term => resolveQuery(term)?.id,
  });
  for (const concept of concepts) {
    const graphHits = mentionCitationsForQuery(concept, 2);
    if (graphHits.length > 0) {
      for (const hit of graphHits) {
        if (citedBooks.has(hit.bookId)) continue;
        citedBooks.add(hit.bookId);
        const snippet = hit.quote ?? '';
        parts.push(`《${hit.bookTitle}》中与「${concept}」相关的片段：${snippet}`);
        citations.push({
          bookId: hit.bookId,
          bookTitle: hit.bookTitle,
          blockId: hit.blockId,
          quote: snippet.slice(0, 100),
        });
      }
    } else {
      const { results: hits } = await searchFullText(concept, 1, 2);
      for (const hit of hits) {
        if (citedBooks.has(hit.entry.id)) continue;
        citedBooks.add(hit.entry.id);
        parts.push(`《${hit.entry.title}》中与「${concept}」相关的片段：${hit.snippet}`);
        citations.push({ bookId: hit.entry.id, bookTitle: hit.entry.title, quote: hit.snippet.slice(0, 100) });
      }
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
  const provider = getProvider('pro');
  const messages = context.conversation?.messages ?? [];
  const lastUser = [...messages].reverse().find(m => m.role === 'user');
  if (!lastUser) throw new Error('对话中缺少用户消息');

  const { text: references, citations } = await buildReferences(lastUser.content, context);

  const finalMessages: AgentMessage[] = [
    { role: 'system', content: CHAT_SYSTEM_PROMPT + (references ? `\n\n参考资料：\n${references}` : '') },
    // 只保留最近 10 轮，控制上下文长度与成本
    ...messages.slice(-10).map(m => ({ role: m.role, content: m.content })),
  ];

  const reply = await provider.chat(finalMessages, { maxTokens: 1200 });
  return { reply, citations, aiGenerated: true };
}

/** 流式问答：yield 文本块，最终事件携带 citations */
export async function* runChatStream(
  context: AgentContext,
): AsyncGenerator<{ event: 'chunk' | 'done'; data: unknown }, void, unknown> {
  const provider = getProvider('pro');
  const messages = context.conversation?.messages ?? [];
  const lastUser = [...messages].reverse().find(m => m.role === 'user');
  if (!lastUser) throw new Error('对话中缺少用户消息');

  const { text: references, citations } = await buildReferences(lastUser.content, context);
  const finalMessages: AgentMessage[] = [
    { role: 'system', content: CHAT_SYSTEM_PROMPT + (references ? `\n\n参考资料：\n${references}` : '') },
    ...messages.slice(-10).map(m => ({ role: m.role, content: m.content })),
  ];

  for await (const chunk of provider.chatStream(finalMessages, { maxTokens: 1200 })) {
    yield { event: 'chunk', data: { text: chunk } };
  }
  yield { event: 'done', data: { citations, aiGenerated: true } };
}
