/**
 * 简繁转换层（仅服务端使用）。
 *
 * 为什么需要它：道藏语料是繁体（且存在「為/爲」等异体差异），
 * 而用户查询与提问多为简体 —— 没有这一层，全文搜索和对话检索
 * 对简体输入几乎全部落空。
 *
 * 为什么输出「多个变体」而不是单一转换结果：OpenCC 不同目标标准
 * （t=OpenCC 标准繁体，tw=台湾正体）对同一字可能给出不同异体
 * （如 无→爲/為），语料内部也不统一，检索时对所有变体取并集最稳妥。
 */

import * as OpenCC from 'opencc-js';

// 转换器初始化有词典加载成本，模块级缓存（每个服务进程一次）
const toT = OpenCC.Converter({ from: 'cn', to: 't' });
const toTW = OpenCC.Converter({ from: 'cn', to: 'tw' });

/** 返回查询词的去重变体列表：原文、OpenCC 繁体、台湾正体 */
export function queryVariants(query: string): string[] {
  const q = query.trim();
  if (!q) return [];
  return Array.from(new Set([q, toT(q), toTW(q)]));
}
