/**
 * 目录探索元数据：各部类的文化语境、视觉配图与探索路径。
 * 配图路径指向 public/images/（AI 生成水墨意象，与典籍原文严格区分）。
 */

export interface CategoryMeta {
  /** 部类展示名 */
  name: string;
  /** 一句话意境 */
  tagline: string;
  /** 部类简介（目录英雄区展示） */
  description: string;
  /** 横幅配图（相对 public/） */
  heroImage: string;
  /** 代表典籍关键词（用于「部类精选」推荐） */
  highlights: string[];
  /** 视觉主色（角标、渐变） */
  accent: string;
}

/** 探索路径：帮用户在 1500+ 部典籍中找到入口 */
export interface ExplorePath {
  id: string;
  title: string;
  description: string;
  /** 点击后应用的标签筛选 */
  tags: string[];
  /** 或直接跳转的目录参数 */
  href?: string;
  icon: string;
}

export const CATEGORY_META: Record<string, CategoryMeta> = {
  洞真部: {
    name: '洞真部',
    tagline: '上清境 · 存神炼气',
    description:
      '洞真部为上清派经典所宗，以存思、炼气、内景修炼为主，收录上清诸经、南岳魏夫人所传、司马承祯坐忘诸要典。从此部入手，可窥道教内修之深。',
    heroImage: '/images/wuxing-shui.jpg',
    highlights: ['黃庭', '上清', '坐忘', '大洞'],
    accent: '#3d5a80',
  },
  洞玄部: {
    name: '洞玄部',
    tagline: '灵宝境 · 度人济物',
    description:
      '洞玄部以灵宝派经典为核心，强调普度、斋醮、功德回向。灵宝领教、度人经、步虚韵等在此部最为集中，是了解道教公共仪式传统的窗口。',
    heroImage: '/images/wuxing-mu.jpg',
    highlights: ['靈寶', '度人', '步虛', '齋醮'],
    accent: '#4a7c59',
  },
  洞神部: {
    name: '洞神部',
    tagline: '三洞之极 · 神明威仪',
    description:
      '洞神部为三洞最高一部，神霄、雷法、真武、斗姆等神明经典与大型科仪忏法汇集于此。威仪类文本数量可观，适合研究道教仪式结构。',
    heroImage: '/images/wuxing-huo.jpg',
    highlights: ['真武', '斗姆', '神霄', '雷法'],
    accent: '#b5473c',
  },
  太平部: {
    name: '太平部',
    tagline: '太平要术 · 早期道藏',
    description:
      '太平部收录早期道教文献与太平道相关典籍，是追溯道教源流的重要部类。正一盟威、太平经残卷等皆在此。',
    heroImage: '/images/hero.jpg',
    highlights: ['太平', '正一', '盟威'],
    accent: '#6b5b4f',
  },
  太清部: {
    name: '太清部',
    tagline: '老子系 · 玄牝之门',
    description:
      '太清部以老子、庄子系经典为主，道德经注疏、玄珠录、文始真经等，是理解道教哲学根基的首选部类。',
    heroImage: '/images/wuxing-jin.jpg',
    highlights: ['道德', '老子', '庄子', '玄珠'],
    accent: '#8c8c94',
  },
  太玄部: {
    name: '太玄部',
    tagline: '玄学义理 · 阴阳五行',
    description:
      '太玄部兼收术数、阴阳五行、易学与道教义理之典籍，皇极经世、周易参同契注、太玄经等，适合探究道藏中的象数传统。',
    heroImage: '/images/wuxing-tu.jpg',
    highlights: ['周易', '參同', '太玄', '皇極'],
    accent: '#9c7a4f',
  },
  正一部: {
    name: '正一部',
    tagline: '天师正一 · 符箓科仪',
    description:
      '正一部为天师道、正一派经典所聚，符箓、印咒、科仪、盟威诸法在此部最为系统。想了解「正一」传统，从此部进入。',
    heroImage: '/images/wuxing-huo.jpg',
    highlights: ['正一', '符箓', '天師', '盟威'],
    accent: '#7a4a3a',
  },
  '': {
    name: '续道藏',
    tagline: '万历续修 · 增补典籍',
    description:
      '续道藏为明万历年间增补编纂，收录正续道藏未辑之典籍，是研究明代道教文献传播的重要补充。',
    heroImage: '/images/wuxing-jin.jpg',
    highlights: ['續道藏', '萬曆'],
    accent: '#5a6a7a',
  },
};

export function getCategoryMeta(name: string): CategoryMeta {
  return (
    CATEGORY_META[name] ?? {
      name: name || '未分类',
      tagline: '道藏典籍',
      description: '道藏经籍目录。',
      heroImage: '/images/hero.jpg',
      highlights: [],
      accent: '#4a7c59',
    }
  );
}

export const EXPLORE_PATHS: ExplorePath[] = [
  {
    id: 'classics',
    title: '入门经典',
    description: '道德经、清静经、黄庭经——先立根基',
    tags: ['经典'],
    href: '/search?q=道德經',
    icon: '經',
  },
  {
    id: 'neidan',
    title: '内丹修炼',
    description: '悟真篇、参同契、金丹要诀',
    tags: ['内丹', '修炼'],
    icon: '丹',
  },
  {
    id: 'keyi',
    title: '科仪威仪',
    description: '灯仪、忏法、斋醮科范——观礼法结构',
    tags: ['科仪'],
    href: '/catalog?cat=%E6%B4%9E%E7%A5%9E%E9%83%A8&sub=%E5%A8%81%E5%84%80%E9%A1%9E',
    icon: '儀',
  },
  {
    id: 'zhoujue',
    title: '咒诀符箓',
    description: '神咒、秘诀、灵符诸经',
    tags: ['咒诀', '符箓'],
    icon: '符',
  },
  {
    id: 'short',
    title: '短篇速览',
    description: '百行以内，适合碎片时间通读',
    tags: [],
    href: '/catalog',
    icon: '短',
  },
  {
    id: 'xudao',
    title: '续道藏',
    description: '万历续修增补文献',
    tags: ['续藏'],
    href: '/catalog?cat=',
    icon: '续',
  },
];
