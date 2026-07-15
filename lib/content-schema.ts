/**
 * 内容结构化 Schema —— 整个平台的内容数据模型基石。
 *
 * 为什么单独拆一个文件：
 * 1. 「原始文本 / 结构化文本 / AI 增强内容」三层内容必须共享同一套类型定义，
 *    解析器（scripts、lib/text-parser）、阅读器（components/reader）、
 *    Agent 工具（lib/agent）都依赖这里，任何一方都不应私自定义内容结构。
 * 2. 未来 Android / iOS App 与 Web 共用后端时，本文件即是接口契约的单一来源。
 * 3. 类型文件不含任何运行时依赖（fs 等），前后端均可安全引用。
 */

/**
 * 内容块类型。
 * 当前规则解析器只会产出其中一部分（heading / subheading / paragraph /
 * verse / editor-note / separator），其余类型为多媒体与 AI 能力预留，
 * 阅读器渲染层已按完整枚举实现分发，后续新增类型无需改动渲染架构。
 */
export type ContentBlockType =
  | 'heading'         // 书名、卷名等主标题
  | 'subheading'      // 篇、品、章、节等次级标题
  | 'paragraph'       // 正文段落
  | 'quote'           // 引文
  | 'annotation'      // 注文（原书夹注）
  | 'commentary'      // 历代注解
  | 'list'            // 条目列表
  | 'verse'           // 诗偈、韵文
  | 'formula'         // 口诀、符咒文本
  | 'table'           // 表格
  | 'image'           // 图片（书影、人物、地图等，当前数据缺失，占位预留）
  | 'image-caption'   // 图注
  | 'separator'       // 分隔（原文空行、分卷符）
  | 'original-note'   // 原文校记
  | 'editor-note'     // 整理者按语（如「經名：…底本出處：…」）
  | 'ai-explanation'; // AI 生成解释 —— 必须与原文严格区分，不允许混入其他类型

/**
 * 结构化内容块。
 *
 * 设计要点（可追溯性）：
 * - sourceStart / sourceEnd 记录该块在原始 txt 中的行号区间，
 *   保证任何结构化结果都能回溯到不可变的原始文本；
 * - confidence 是自动识别置信度，低于 LOW_CONFIDENCE 阈值的块
 *   会被前端渲染为「待审核」状态，绝不静默改写；
 * - parser 记录产出该块的解析器版本，便于重跑与回滚。
 */
export interface ContentBlock {
  /** 块唯一 ID（bookId-块序号），用于锚点定位、收藏、笔记与 Agent 上下文 */
  id: string;
  type: ContentBlockType;
  /** 展示用文本。仅做去缩进等格式处理，不改动原文实质内容 */
  content: string;
  /** 标题层级：1=书名，2=卷，3=篇/品/章 */
  level?: number;
  /** 原始文件中的起始行号（从 0 计） */
  sourceStart: number;
  /** 原始文件中的结束行号（含） */
  sourceEnd: number;
  /** 自动识别置信度 0~1 */
  confidence: number;
  /** 解析器标识，如 "rule-v1" */
  parser: string;
}

/** 低置信度阈值：低于此值的识别结果视为「待人工审核」 */
export const LOW_CONFIDENCE = 0.7;

/** 目录项：由 heading / subheading 块生成，驱动阅读器目录面板 */
export interface TocItem {
  /** 指向 ContentBlock.id，用于滚动定位 */
  blockId: string;
  title: string;
  level: number;
}

/** 一部典籍的结构化解析结果 */
export interface ParsedBook {
  bookId: string;
  title: string;
  blocks: ContentBlock[];
  toc: TocItem[];
  /** 解析质量统计，供解析质量报告与审核工具使用 */
  stats: {
    totalBlocks: number;
    lowConfidenceBlocks: number;
    parser: string;
  };
}

/**
 * 图片元数据模型 —— 当前文本数据没有图片，先定义数据结构与占位机制，
 * 禁止来源不明的图片直接作为正式文化资料（isVerified 必须为 true 才可正式展示）。
 */
export interface ImageAsset {
  id: string;
  title: string;
  description?: string;
  /** 来源说明（馆藏、出版物、拍摄者等），必填以保证学术严谨性 */
  source: string;
  /** 版权状态：public-domain / licensed / unknown */
  copyright: 'public-domain' | 'licensed' | 'unknown';
  author?: string;
  era?: string;
  /** 关联典籍与章节，便于在阅读器中按位置插入 */
  bookId?: string;
  blockId?: string;
  /** 无障碍替代文本 */
  alt: string;
  /** 是否 AI 生成 —— AI 图片必须显式标注，不得伪装为史料 */
  aiGenerated: boolean;
  /** 是否已通过来源审核 */
  isVerified: boolean;
}
