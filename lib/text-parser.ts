/**
 * 道藏文本规则解析器（rule-v1）。
 *
 * 为什么解析发生在「读取时」而不是「构建时」：
 * 1. 原文保护 —— public/data/content/*.json 中保存的是不可变的原始文本，
 *    解析器是纯函数，结构化结果随时可由原文重新生成，天然可追溯、可回滚；
 * 2. 避免数据翻倍 —— 1500+ 部经文若在构建期落盘结构化 JSON 会使数据体积翻倍，
 *    而解析单本耗时在毫秒级，服务端按需解析即可；
 * 3. 解析器可独立测试 —— 本文件不依赖 fs / next，tests/ 下可直接单测。
 *
 * 解析策略：优先使用确定性规则；无法确定的结构给低置信度标记（< LOW_CONFIDENCE），
 * 由前端渲染为待审核样式，绝不强行判断、不静默改写原文。
 */

import {
  ContentBlock,
  ContentBlockType,
  ParsedBook,
  TocItem,
  LOW_CONFIDENCE,
} from './content-schema';

export const PARSER_VERSION = 'rule-v3';

/**
 * 由块列表生成目录（导出供人工审核 overrides 应用后重建目录，保证规则唯一）。
 * 仅收录 level ≤ 3 的标题类块；level 4（咒曰等正文小节标签）
 * 与正文块不进目录，避免科仪类文本目录被数百个标签淹没。
 */
export function buildToc(blocks: ContentBlock[]): TocItem[] {
  return blocks
    .filter(
      b =>
        (b.type === 'heading' || b.type === 'subheading') &&
        b.confidence >= 0.6 &&
        (b.level ?? 3) <= 3,
    )
    .map(b => ({ blockId: b.id, title: b.content, level: b.level ?? 3 }));
}

/** 中文数字与阿拉伯数字，用于卷次匹配 */
const CN_NUM = '[一二三四五六七八九十百千0-9０-９]+';

/** 卷标题：如「三洞珠囊卷之一」「太上感應篇卷上」 */
const VOLUME_RE = new RegExp(`^.{0,16}?卷(之${CN_NUM}|${CN_NUM}|[上中下])$`);

/**
 * 卷终行：如「靈寶領教濟度金書卷之一竟」。
 * rule-v2 依据：全库报告中此形态以低置信度 subheading 误判数百次，
 * 实为原书的卷末标记，归为 original-note（弱化展示但保留原文）。
 */
const VOLUME_END_RE = new RegExp(`^.{0,16}?卷(之${CN_NUM}|${CN_NUM}|[上中下])竟$`);

/**
 * 诵咒/颂偈引导语：如「呪曰」「咒曰」「頌曰：」「偈曰」。
 * rule-v2 依据：科仪类文本中高频出现（呪曰 459 次、頌曰 160 次），
 * 语义上是正文内的小节标签而非目录级标题，识别为 level 4 subheading
 * （目录只收录 level ≤ 3，避免目录被数百个「咒曰」淹没）。
 */
const SAY_LABEL_RE = /^[\u3400-\u9fff]{0,6}曰[：:]?$/;

/**
 * 作者署名行：如「武林道士褚伯秀學」「金谿子彭好古集」。
 * rule-v2 依据：注疏类文本卷首常见，属于原书的署名信息而非标题。
 */
const AUTHOR_LINE_RE = /^[\u3400-\u9fff]{2,12}(道士|真人|先生|居士|弟子|法師|天師)[\u3400-\u9fff]{1,8}(學|撰|註|注|集|編|纂|述|校|錄|疏|解)$/;

/** 单字延续词：如独行的「又」「右」「訖」，是行文延续标记而非标题 */
const CONTINUATION_RE = /^[又右訖畢終终]$/;

/**
 * 诗偈/符咒序号：如「其二」「其三」。
 * rule-v3 依据：全库报告中「其二」76 次、「其三」53 次以低置信度误判，
 * 实为组诗/组咒的序号标签，与「呪曰」同级（level 4，不进目录）。
 */
const SEQUENCE_LABEL_RE = new RegExp(`^其${CN_NUM}$`);

/**
 * 通用章节名白名单：数字化底本与原书通用的固定章节名。
 * rule-v3 依据：报告中「目錄」58 次、「附錄」66 次、「譯文」62 次等
 * 均为确定性章节名，可直接给高置信度。
 */
const SECTION_NAME_SET = new Set([
  '目錄', '目录', '附錄', '附录', '譯文', '译文', '告文', '附方',
  '序', '跋', '凡例', '原序', '後序', '后序', '自序', '原跋',
]);

/**
 * 科仪指示语：如「各禮師存念如法」。
 * rule-v3 依据：威儀類文本高频（172 次），是对行科法师的操作指示，
 * 语义上属仪式注记而非标题，归为 annotation。
 */
const RITUAL_DIRECTIVE_RE = /^[\u3400-\u9fff]{2,14}(如法|如式|如常式|如上法)$/;

/** 整理者按语：数字化底本自带的元数据行，如「經名：三洞珠囊。唐王懸河編。十卷。底本出處：…」 */
const EDITOR_NOTE_RE = /^(經名|经名|底本出處|底本出处)[：:]/;

/** 句读类标点：短行中若出现句末标点，一般不是标题 */
const SENTENCE_PUNCT_RE = /[。？！；]/;

/** 判断一行是否可能为诗偈句：四至十字、以顿逗或句号收尾、不含叙述性词缀 */
const VERSE_LINE_RE = /^[\u3400-\u9fff]{4,10}[，、。]?$/;

interface RawLine {
  /** 原始行号（0 起） */
  index: number;
  /** 去掉全角/半角空白后的文本 */
  text: string;
  /** 是否以全角空格缩进（正文段落的典型特征） */
  indented: boolean;
}

/** 预处理：保留行号映射，去除首尾空白，但先记录全角缩进特征（正文段落线索） */
function toRawLines(source: string): RawLine[] {
  return source.split(/\r?\n/).map((line, index) => ({
    index,
    text: line.replace(/^[\s\u3000]+|[\s\u3000]+$/g, ''),
    indented: /^[\s]*\u3000/.test(line),
  }));
}

/** 是否形如标题的短行：不长、无句末标点、非缩进 */
function looksLikeHeading(line: RawLine): boolean {
  return (
    line.text.length > 0 &&
    line.text.length <= 16 &&
    !line.indented &&
    !SENTENCE_PUNCT_RE.test(line.text) &&
    !/[，、]/.test(line.text)
  );
}

/**
 * 解析一部典籍的原始文本。
 * @param source  原始全文（不可变底稿）
 * @param bookId  典籍 ID，用于生成块级锚点
 * @param bookTitle 索引中的书名，用于提升首行书名识别置信度
 */
export function parseText(source: string, bookId: string, bookTitle?: string): ParsedBook {
  const lines = toRawLines(source);
  const blocks: ContentBlock[] = [];
  let blockSeq = 0;

  /** 统一的块构造入口：保证每个块都带可追溯信息 */
  const push = (
    type: ContentBlockType,
    content: string,
    start: number,
    end: number,
    confidence: number,
    level?: number,
  ) => {
    blocks.push({
      id: `${bookId}-b${blockSeq++}`,
      type,
      content,
      level,
      sourceStart: start,
      sourceEnd: end,
      confidence,
      parser: PARSER_VERSION,
    });
  };

  let sawTitle = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line.text) continue; // 空行仅作为段落边界，不产出块

    // 1. 首个非空行视为书名；若与索引书名互相包含则置信度更高
    if (!sawTitle) {
      sawTitle = true;
      const matchesIndexTitle =
        !!bookTitle && (line.text.includes(bookTitle) || bookTitle.includes(line.text));
      push('heading', line.text, line.index, line.index, matchesIndexTitle ? 0.95 : 0.8, 1);
      continue;
    }

    // 2. 整理者按语（經名 / 底本出處）：属于数字底本元数据，与经文正文严格区分
    if (EDITOR_NOTE_RE.test(line.text)) {
      push('editor-note', line.text, line.index, line.index, 0.9);
      continue;
    }

    // 3a. 卷终行（「…卷之N竟」）：原书卷末标记，弱化展示、不进目录
    if (!line.indented && VOLUME_END_RE.test(line.text) && line.text.length <= 24) {
      push('original-note', line.text, line.index, line.index, 0.9);
      continue;
    }

    // 3b. 卷标题：确定性正则，高置信度
    if (!line.indented && VOLUME_RE.test(line.text) && line.text.length <= 20) {
      push('heading', line.text, line.index, line.index, 0.9, 2);
      continue;
    }

    // 4. 诗偈：连续 2 行以上的等长短句视为韵文（弱规则，低置信度待审核）
    if (!line.indented && VERSE_LINE_RE.test(line.text)) {
      let j = i;
      while (j + 1 < lines.length && VERSE_LINE_RE.test(lines[j + 1].text) && !lines[j + 1].indented) {
        j++;
      }
      if (j > i) {
        const verseLines = lines.slice(i, j + 1).map(l => l.text);
        push('verse', verseLines.join('\n'), line.index, lines[j].index, 0.5);
        i = j;
        continue;
      }
    }

    // 5a. 单字延续标记（又/右/訖…）：行文延续词，按正文处理
    if (!line.indented && CONTINUATION_RE.test(line.text)) {
      push('paragraph', line.text, line.index, line.index, 0.85);
      continue;
    }

    // 5b. 诵咒/颂偈引导语（呪曰/頌曰…）与组诗序号（其二/其三…）：
    //     正文内小节标签，level 4 不进目录
    if (!line.indented && (SAY_LABEL_RE.test(line.text) || SEQUENCE_LABEL_RE.test(line.text))) {
      push('subheading', line.text, line.index, line.index, 0.85, 4);
      continue;
    }

    // 5b'. 通用章节名白名单（目錄/附錄/序/跋…）：确定性章节名，高置信度
    if (!line.indented && SECTION_NAME_SET.has(line.text)) {
      push('subheading', line.text, line.index, line.index, 0.9, 3);
      continue;
    }

    // 5b''. 科仪指示语（…如法/如式）：对行科法师的操作注记，非标题
    if (!line.indented && line.text.length <= 16 && RITUAL_DIRECTIVE_RE.test(line.text)) {
      push('annotation', line.text, line.index, line.index, 0.8);
      continue;
    }

    // 5c. 作者署名行：原书署名信息，归为 original-note
    if (!line.indented && line.text.length <= 20 && AUTHOR_LINE_RE.test(line.text)) {
      push('original-note', line.text, line.index, line.index, 0.8);
      continue;
    }

    // 5d. 篇 / 品 / 章名：短行 + 无句读 + 非缩进。
    //    强后缀（品/篇/章/咒/誥…，rule-v3 扩充咒名类）给 0.8，
    //    其余无法百分之百确定（可能是极短正文），给 0.65 交由人工审核
    if (looksLikeHeading(line)) {
      const strongSuffix = /[品篇章訣诀符圖图讚赞頌颂咒呪誥诰]$/.test(line.text);
      push('subheading', line.text, line.index, line.index, strongSuffix ? 0.8 : 0.65, 3);
      continue;
    }

    // 6. 默认：正文段落。仅去除排版缩进，不改动任何文字内容
    push('paragraph', line.text, line.index, line.index, 0.98);
  }

  const toc = buildToc(blocks);

  return {
    bookId,
    title: bookTitle || blocks[0]?.content || '',
    blocks,
    toc,
    stats: {
      totalBlocks: blocks.length,
      lowConfidenceBlocks: blocks.filter(b => b.confidence < LOW_CONFIDENCE).length,
      parser: PARSER_VERSION,
    },
  };
}
