import { MusicTrack } from '@/app/music/MusicPlayer';

/** 五行曲目（已由 scripts/gen-music.ps1 生成） */
export const WUXING_TRACKS: MusicTrack[] = [
  { id: 'jin', element: '金', title: '金 · 商音清越', description: '编钟磬石，秋气肃然。金性收敛，其音清越悠远。', audio: '/audio/wuxing-jin.mp3', image: '/images/wuxing-jin.jpg', color: '#8c8c94' },
  { id: 'mu', element: '木', title: '木 · 角音舒展', description: '古琴箫管，春意萌发。木性生长，其音舒展条达。', audio: '/audio/wuxing-mu.mp3', image: '/images/wuxing-mu.jpg', color: '#4a7c59' },
  { id: 'shui', element: '水', title: '水 · 羽音潜流', description: '筝音如涧，洞箫如雾。水性润下，其音绵长深邃。', audio: '/audio/wuxing-shui.mp3', image: '/images/wuxing-shui.jpg', color: '#3d5a80' },
  { id: 'huo', element: '火', title: '火 · 徵音明亮', description: '法鼓铜锣，香火升腾。火性炎上，其音明亮庄重。', audio: '/audio/wuxing-huo.mp3', image: '/images/wuxing-huo.jpg', color: '#b5473c' },
  { id: 'tu', element: '土', title: '土 · 宫音沉稳', description: '埙声浑厚，笙音和缓。土性承载，其音沉稳中正。', audio: '/audio/wuxing-tu.mp3', image: '/images/wuxing-tu.jpg', color: '#9c7a4f' },
];

/**
 * 八卦曲目（scripts/gen-bagua-music.ps1 生成）。
 * 乾兑属金、震巽属木、坎属水、离属火、坤艮属土，各卦取独特器乐意象。
 */
export const BAGUA_TRACKS: MusicTrack[] = [
  { id: 'qian', element: '乾', title: '乾 · 天行健', description: '纯阳之卦，刚健不息。天鼓远鸣，清气上扬。', audio: '/audio/bagua-qian.mp3', image: '/images/wuxing-jin.jpg', color: '#c9a227' },
  { id: 'kun', element: '坤', title: '坤 · 地势坤', description: '纯阴之卦，厚德载物。埙笙低吟，大地安宁。', audio: '/audio/bagua-kun.mp3', image: '/images/wuxing-tu.jpg', color: '#8b7355' },
  { id: 'zhen', element: '震', title: '震 · 雷发声', description: '雷动万物，阳生于下。法鼓惊雷，春雷隐隐。', audio: '/audio/bagua-zhen.mp3', image: '/images/wuxing-mu.jpg', color: '#5a8a4a' },
  { id: 'xun', element: '巽', title: '巽 · 风入物', description: '风行天下，柔顺入微。箫声婉转，如风吹过竹林。', audio: '/audio/bagua-xun.mp3', image: '/images/wuxing-mu.jpg', color: '#6b9e7a' },
  { id: 'kan', element: '坎', title: '坎 · 水流润', description: '水陷而险，智慧深藏。古筝泛音，深渊回响。', audio: '/audio/bagua-kan.mp3', image: '/images/wuxing-shui.jpg', color: '#2e5a88' },
  { id: 'li', element: '离', title: '离 · 火明照', description: '火丽而明，文明之象。铃钹清亮，烛照灵台。', audio: '/audio/bagua-li.mp3', image: '/images/wuxing-huo.jpg', color: '#d45a3a' },
  { id: 'gen', element: '艮', title: '艮 · 山止静', description: '山止而静，止其所止。木鱼沉稳，坐忘入静。', audio: '/audio/bagua-gen.mp3', image: '/images/wuxing-tu.jpg', color: '#7a6a55' },
  { id: 'dui', element: '兑', title: '兑 · 泽说悦', description: '泽润万物，悦而能说。编钟悦耳，甘露洒心。', audio: '/audio/bagua-dui.mp3', image: '/images/wuxing-jin.jpg', color: '#9a8aaa' },
];

export type MusicTheme = 'wuxing' | 'bagua';

export const MUSIC_THEMES: Array<{ id: MusicTheme; label: string; desc: string }> = [
  { id: 'wuxing', label: '五行', desc: '金木水火土 · 五音相配' },
  { id: 'bagua', label: '八卦', desc: '乾坤震巽坎离艮兑' },
];
