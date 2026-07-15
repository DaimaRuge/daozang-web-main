import { DaozangEntry } from './data';

/**
 * 书目辅助标签：从标题、部类、子类规则推导，供目录筛选与探索路径。
 * 确定性规则（非 LLM），零运行时依赖，标签随索引数据即时计算。
 */

export type EntryTag =
  | '经典'
  | '修炼'
  | '内丹'
  | '科仪'
  | '咒诀'
  | '符箓'
  | '斋醮'
  | '注释'
  | '文集'
  | '续藏';

/** 标签 → 匹配规则（标题或子类命中即贴标） */
const TAG_RULES: Array<{ tag: EntryTag; test: (e: DaozangEntry) => boolean }> = [
  { tag: '科仪', test: e => /威儀|科儀|齋醮|道場|儀|忏|懺|法事/.test(e.title + e.subcategory) },
  { tag: '咒诀', test: e => /咒|呪|訣|真言|神呪/.test(e.title) },
  { tag: '符箓', test: e => /符|籙|箓|灵符|靈符/.test(e.title) },
  { tag: '内丹', test: e => /内丹|內丹|金丹|修真|煉丹|悟真|參同|還丹|丹經|丹訣/.test(e.title) },
  { tag: '修炼', test: e => /坐忘|養性|修煉|修眞|清靜|黄庭|黃庭|导引|導引|胎息/.test(e.title) },
  { tag: '斋醮', test: e => /齋|醮|祭|祈禳|度亡/.test(e.title) },
  { tag: '注释', test: e => /注|疏|解|義|章句|集注|正義/.test(e.title) },
  { tag: '文集', test: e => /集|錄|語|論|說|要/.test(e.title) },
  { tag: '经典', test: e => /經$|真經|靈經|妙經/.test(e.title) && !/注|疏|解/.test(e.title) },
  { tag: '续藏', test: e => e.collection.includes('续') || e.category === '' },
];

/** 为单部典籍计算标签列表 */
export function getEntryTags(entry: DaozangEntry): EntryTag[] {
  return TAG_RULES.filter(r => r.test(entry)).map(r => r.tag);
}

/** 按标签筛选（多选：命中任一即保留） */
export function filterByTags(entries: DaozangEntry[], tags: EntryTag[]): DaozangEntry[] {
  if (tags.length === 0) return entries;
  return entries.filter(e => {
    const et = getEntryTags(e);
    return tags.some(t => et.includes(t));
  });
}

/** 篇幅分级标签（辅助浏览） */
export function getSizeLabel(lineCount: number): '短篇' | '中篇' | '长篇' {
  if (lineCount < 200) return '短篇';
  if (lineCount < 2000) return '中篇';
  return '长篇';
}

export type SortKey = 'default' | 'title' | 'lines-asc' | 'lines-desc';

export function sortEntries(entries: DaozangEntry[], key: SortKey): DaozangEntry[] {
  const copy = [...entries];
  switch (key) {
    case 'title':
      return copy.sort((a, b) => a.title.localeCompare(b.title, 'zh-Hant'));
    case 'lines-asc':
      return copy.sort((a, b) => a.lineCount - b.lineCount);
    case 'lines-desc':
      return copy.sort((a, b) => b.lineCount - a.lineCount);
    default:
      return copy;
  }
}

/** 本地搜索（标题/作者/摘要） */
export function filterByQuery(entries: DaozangEntry[], query: string): DaozangEntry[] {
  const q = query.trim().toLowerCase();
  if (!q) return entries;
  return entries.filter(
    e =>
      e.title.toLowerCase().includes(q) ||
      (e.author?.toLowerCase().includes(q) ?? false) ||
      e.preview.toLowerCase().includes(q),
  );
}
