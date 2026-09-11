/**
 * 题署人物解析（文件名 / index.json 的 author 字段）。
 *
 * 为什么独立成模块：author 不是目录学著录，而是 build-index 从文件名切出来的。
 * 旧规则用单字朝代类去匹配，再把朝代拼回后缀，于是大量变成「宋-宋-王慶升」；
 * 「五代」「南朝宋」还会被切成「五-五代-…」。阅读页、卡片、图谱若各自正则，
 * 噪声会分叉。清洗只影响展示与人物节点，绝不改第一层原文 JSON。
 */

export interface ParsedAuthor {
  name: string;
  era?: string;
}

/**
 * 长词在前，避免「南朝宋」被「宋」先吃掉。
 * 含金、遼、齊等旧正则字符类漏掉的朝代。
 */
export const AUTHOR_ERA_TOKENS = [
  '南朝宋', '南齊', '北齊', '北魏', '南宋', '南唐', '東晉', '西晉',
  '後唐', '後漢', '後周', '後梁', '五代',
  '遼', '金', '元', '明', '清', '唐', '宋', '晉', '漢', '隋',
  '周', '商', '夏', '秦', '戰國',
] as const;

/** 单独出现时是类型名，不是题署人物 */
const NOT_A_PERSON = new Set(['真人', '天尊', '天師']);

function looksLikeName(name: string): boolean {
  if (!name || name.length > 8) return false;
  if (/[0-9A-Za-z]/.test(name)) return false;
  if (NOT_A_PERSON.has(name)) return false;
  return true;
}

/**
 * 把 index 里的原始 author 收成「人名 + 可选朝代」。
 * 已格式化的「宋 · 王慶升」再解析一次保持幂等，避免数据层与展示层重复清洗。
 */
export function parseAuthor(raw?: string): ParsedAuthor | null {
  if (!raw) return null;
  const text = raw.trim();
  if (!text) return null;

  const dotted = text.split(' · ');
  if (dotted.length === 2 && looksLikeName(dotted[1])) {
    return { era: dotted[0], name: dotted[1] };
  }

  const parts = text.split('-').map(s => s.trim()).filter(Boolean);
  if (parts.length === 0) return null;

  let era: string | undefined;
  let name: string;

  // 五-五代-蒲處貫 / 宋-宋-王慶升 / 南-南朝宋-陸修靜
  if (parts.length >= 3 && parts[1].startsWith(parts[0])) {
    era = parts[1];
    name = parts.slice(2).join('');
  } else if (parts.length >= 2) {
    era = parts[0];
    name = parts.slice(1).join('');
  } else {
    name = parts[0];
  }

  // 元-元王玠 → 元 · 王玠；唐-唐淳 剥完只剩一字，视为人名本身含该字，丢掉误切朝代
  if (era && name.startsWith(era)) {
    const stripped = name.slice(era.length);
    if (stripped.length >= 2) name = stripped;
    else era = undefined;
  }

  if (!looksLikeName(name)) return null;
  return era ? { name, era } : { name };
}

/** 阅读页 / 卡片用。解析失败则不展示，避免把「宋-宋-…」继续铺到界面上。 */
export function formatAuthor(raw?: string): string | undefined {
  const parsed = parseAuthor(raw);
  if (!parsed) return undefined;
  return parsed.era ? `${parsed.era} · ${parsed.name}` : parsed.name;
}

/**
 * 从文件名里「书名-朝代-人名」的尾巴切开。
 * 供 build-index 使用，从源头不再写出加倍朝代。
 */
export function splitTitleAndAttribution(remainder: string): { title: string; author?: string } {
  for (const era of AUTHOR_ERA_TOKENS) {
    const needle = `-${era}-`;
    const i = remainder.lastIndexOf(needle);
    if (i <= 0) continue;
    const name = remainder.slice(i + needle.length);
    if (!looksLikeName(name)) continue;
    return { title: remainder.slice(0, i), author: `${era}-${name}` };
  }

  for (const era of AUTHOR_ERA_TOKENS) {
    const suffix = remainder.match(new RegExp(`-${era}([\\u4e00-\\u9fff]{2,8})$`));
    if (!suffix) continue;
    const name = suffix[1];
    if (!looksLikeName(name)) continue;
    const title = remainder.slice(0, remainder.length - era.length - name.length - 1);
    if (!title) continue;
    return { title, author: `${era}-${name}` };
  }

  return { title: remainder };
}
