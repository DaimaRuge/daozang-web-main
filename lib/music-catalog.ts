import { MusicTrack } from '@/app/music/MusicPlayer';

/** 五行曲目（scripts/gen-music.ps1） */
export const WUXING_TRACKS: MusicTrack[] = [
  { id: 'jin', element: '金', title: '金 · 商音清越', description: '编钟磬石，秋气肃然。金性收敛，其音清越悠远。', audio: '/audio/wuxing-jin.mp3', image: '/images/wuxing-jin.jpg', color: '#8c8c94' },
  { id: 'mu', element: '木', title: '木 · 角音舒展', description: '古琴箫管，春意萌发。木性生长，其音舒展条达。', audio: '/audio/wuxing-mu.mp3', image: '/images/wuxing-mu.jpg', color: '#4a7c59' },
  { id: 'shui', element: '水', title: '水 · 羽音潜流', description: '筝音如涧，洞箫如雾。水性润下，其音绵长深邃。', audio: '/audio/wuxing-shui.mp3', image: '/images/wuxing-shui.jpg', color: '#3d5a80' },
  { id: 'huo', element: '火', title: '火 · 徵音明亮', description: '法鼓铜锣，香火升腾。火性炎上，其音明亮庄重。', audio: '/audio/wuxing-huo.mp3', image: '/images/wuxing-huo.jpg', color: '#b5473c' },
  { id: 'tu', element: '土', title: '土 · 宫音沉稳', description: '埙声浑厚，笙音和缓。土性承载，其音沉稳中正。', audio: '/audio/wuxing-tu.mp3', image: '/images/wuxing-tu.jpg', color: '#9c7a4f' },
];

/** 八卦曲目（scripts/gen-bagua-music.ps1） */
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

const IMG = { mu: '/images/wuxing-mu.jpg', huo: '/images/wuxing-huo.jpg', tu: '/images/wuxing-tu.jpg', jin: '/images/wuxing-jin.jpg', shui: '/images/wuxing-shui.jpg' };

/** 十天干（scripts/gen-cycles-music.ps1） */
export const TIANGAN_TRACKS: MusicTrack[] = [
  { id: 'jia', element: '甲', title: '甲 · 阳木', description: '参天大树，春阳生发。如日出松林，刚健始生。', audio: '/audio/tiangan-jia.mp3', image: IMG.mu, color: '#3d6b4f' },
  { id: 'yi', element: '乙', title: '乙 · 阴木', description: '藤萝花草，柔顺蔓延。如春风拂柳，曲而不折。', audio: '/audio/tiangan-yi.mp3', image: IMG.mu, color: '#5a8a6a' },
  { id: 'bing', element: '丙', title: '丙 · 阳火', description: '烈日当空，光明炽盛。如正午丹炉，阳气极盛。', audio: '/audio/tiangan-bing.mp3', image: IMG.huo, color: '#c44a32' },
  { id: 'ding', element: '丁', title: '丁 · 阴火', description: '灯烛炉火，温照内室。如夜读道经，静火长明。', audio: '/audio/tiangan-ding.mp3', image: IMG.huo, color: '#d47a5a' },
  { id: 'wu', element: '戊', title: '戊 · 阳土', description: '高山厚土，承载万物。如五岳镇方，广大稳固。', audio: '/audio/tiangan-wu.mp3', image: IMG.tu, color: '#8b7355' },
  { id: 'ji', element: '己', title: '己 · 阴土', description: '田园沃土，化育群生。如雨后新田，含养滋长。', audio: '/audio/tiangan-ji.mp3', image: IMG.tu, color: '#9c8565' },
  { id: 'geng', element: '庚', title: '庚 · 阳金', description: '秋金肃杀，刚利断截。如霜刃出鞘，清越凌厉。', audio: '/audio/tiangan-geng.mp3', image: IMG.jin, color: '#7a8088' },
  { id: 'xin', element: '辛', title: '辛 · 阴金', description: '珠玉精金，柔润内敛。如晨露凝霜，细腻晶莹。', audio: '/audio/tiangan-xin.mp3', image: IMG.jin, color: '#9aa0a8' },
  { id: 'ren', element: '壬', title: '壬 · 阳水', description: '江河湖海，浩荡奔流。如长江东去，汪洋不息。', audio: '/audio/tiangan-ren.mp3', image: IMG.shui, color: '#2a5080' },
  { id: 'gui', element: '癸', title: '癸 · 阴水', description: '雨露甘泉，润下无声。如细雨入土，深潜养根。', audio: '/audio/tiangan-gui.mp3', image: IMG.shui, color: '#4a7098' },
];

/** 十二时辰（scripts/gen-cycles-music.ps1） */
export const SHICHEN_TRACKS: MusicTrack[] = [
  { id: 'zi', element: '子', title: '子时 · 23–1', description: '一阳初生，静水深流。夜半修道，凝神待旦。', audio: '/audio/shichen-zi.mp3', image: IMG.shui, color: '#2e4a70' },
  { id: 'chou', element: '丑', title: '丑时 · 1–3', description: '土气稳藏，牛反刍息。深夜养气，厚载静守。', audio: '/audio/shichen-chou.mp3', image: IMG.tu, color: '#6a5a48' },
  { id: 'yin', element: '寅', title: '寅时 · 3–5', description: '虎啸黎明，木气萌动。平旦采气，东方启明。', audio: '/audio/shichen-yin.mp3', image: IMG.mu, color: '#4a7a5a' },
  { id: 'mao', element: '卯', title: '卯时 · 5–7', description: '日出扶桑，兔跃青野。朝气清越，诵读早课。', audio: '/audio/shichen-mao.mp3', image: IMG.mu, color: '#5a9a6a' },
  { id: 'chen', element: '辰', title: '辰时 · 7–9', description: '龙云汇聚，阳气展发。食后调息，行功正当时。', audio: '/audio/shichen-chen.mp3', image: IMG.tu, color: '#8a9a5a' },
  { id: 'si', element: '巳', title: '巳时 · 9–11', description: '蛇蜕暖阳，火气温升。日高精进，内炼正阳。', audio: '/audio/shichen-si.mp3', image: IMG.huo, color: '#c06040' },
  { id: 'wu', element: '午', title: '午时 · 11–13', description: '日中天极，马奔炎上。正午存神，火候最盛。', audio: '/audio/shichen-wu.mp3', image: IMG.huo, color: '#d04030' },
  { id: 'wei', element: '未', title: '未时 · 13–15', description: '羊牧午后，土气温厚。阳收阴长，缓行调息。', audio: '/audio/shichen-wei.mp3', image: IMG.tu, color: '#a08060' },
  { id: 'shen', element: '申', title: '申时 · 15–17', description: '猴跃金风，气收敛精。下哺炼化，金气初凝。', audio: '/audio/shichen-shen.mp3', image: IMG.jin, color: '#808890' },
  { id: 'you', element: '酉', title: '酉时 · 17–19', description: '鸡报日暮，金声余响。日落归息，晚课将始。', audio: '/audio/shichen-you.mp3', image: IMG.jin, color: '#a89870' },
  { id: 'xu', element: '戌', title: '戌时 · 19–21', description: '犬守黄昏，土闭库藏。暮鼓低鸣，闭关静养。', audio: '/audio/shichen-xu.mp3', image: IMG.tu, color: '#706050' },
  { id: 'hai', element: '亥', title: '亥时 · 21–23', description: '猪眠亥水，归元入静。人定息心，准备入定。', audio: '/audio/shichen-hai.mp3', image: IMG.shui, color: '#3a5878' },
];

/** 二十四节气（scripts/gen-cycles-music.ps1） */
export const JIEQI_TRACKS: MusicTrack[] = [
  { id: 'lichun', element: '春', title: '立春', description: '岁首回春，万物始生。东风解冻，新阳初转。', audio: '/audio/jieqi-lichun.mp3', image: IMG.mu, color: '#4a8a5a' },
  { id: 'yushui', element: '春', title: '雨水', description: '鸿雁北归，春雨润物。天一生水，滋育萌芽。', audio: '/audio/jieqi-yushui.mp3', image: IMG.shui, color: '#5a9a8a' },
  { id: 'jingzhe', element: '春', title: '惊蛰', description: '雷动蛰出，桃始华。春雷一声，万类苏醒。', audio: '/audio/jieqi-jingzhe.mp3', image: IMG.mu, color: '#6a8a4a' },
  { id: 'chunfen', element: '春', title: '春分', description: '昼夜均平，阴阳各半。玄鸟至，平衡守中。', audio: '/audio/jieqi-chunfen.mp3', image: IMG.mu, color: '#5a9a6a' },
  { id: 'qingming', element: '春', title: '清明', description: '气清景明，桐始华。天地澄澈，宜静思省过。', audio: '/audio/jieqi-qingming.mp3', image: IMG.mu, color: '#6aaa7a' },
  { id: 'guyu', element: '春', title: '谷雨', description: '雨生百谷，萍始生。春将尽，播撒与收功。', audio: '/audio/jieqi-guyu.mp3', image: IMG.mu, color: '#4a7a5a' },
  { id: 'lixia', element: '夏', title: '立夏', description: '夏气始交，蝼蝈鸣。阳气盛长，心火初萌。', audio: '/audio/jieqi-lixia.mp3', image: IMG.huo, color: '#c05040' },
  { id: 'xiaoman', element: '夏', title: '小满', description: '麦渐饱满，物至于此小得盈满。', audio: '/audio/jieqi-xiaoman.mp3', image: IMG.huo, color: '#d07050' },
  { id: 'mangzhong', element: '夏', title: '芒种', description: '有芒之种，忙种忙收。阳极将转，勤修不怠。', audio: '/audio/jieqi-mangzhong.mp3', image: IMG.huo, color: '#b86040' },
  { id: 'xiazhi', element: '夏', title: '夏至', description: '日北至，阳极阴生。一阴初动，守中保精。', audio: '/audio/jieqi-xiazhi.mp3', image: IMG.huo, color: '#d04030' },
  { id: 'xiaoshu', element: '夏', title: '小暑', description: '温风至，蟋蟀居宇。暑气初盛，宜清心静气。', audio: '/audio/jieqi-xiaoshu.mp3', image: IMG.huo, color: '#c87050' },
  { id: 'dashu', element: '夏', title: '大暑', description: '大热极盛，腐草为萤。至阳之时，更须内守。', audio: '/audio/jieqi-dashu.mp3', image: IMG.huo, color: '#a84030' },
  { id: 'liqiu', element: '秋', title: '立秋', description: '凉风至，白露降。金气始收，收敛神气。', audio: '/audio/jieqi-liqiu.mp3', image: IMG.jin, color: '#8a9088' },
  { id: 'chushu', element: '秋', title: '处暑', description: '暑气止，鹰乃祭鸟。热退凉生，调息归平。', audio: '/audio/jieqi-chushu.mp3', image: IMG.jin, color: '#9a9880' },
  { id: 'bailu', element: '秋', title: '白露', description: '露凝而白，鸿雁来。秋意清润，宜早课诵经。', audio: '/audio/jieqi-bailu.mp3', image: IMG.jin, color: '#a8b0a8' },
  { id: 'qiufen', element: '秋', title: '秋分', description: '昼夜再均，雷始收声。阴阳平衡，收获内省。', audio: '/audio/jieqi-qiufen.mp3', image: IMG.jin, color: '#909888' },
  { id: 'hanlu', element: '秋', title: '寒露', description: '露气寒冷，菊有黄华。深秋肃降，养藏预备。', audio: '/audio/jieqi-hanlu.mp3', image: IMG.jin, color: '#788080' },
  { id: 'shuangjiang', element: '秋', title: '霜降', description: '气肃而凝，霜始降。秋之末，万物归藏。', audio: '/audio/jieqi-shuangjiang.mp3', image: IMG.jin, color: '#687078' },
  { id: 'lidong', element: '冬', title: '立冬', description: '冬气始交，水始冰。闭藏之始，宜早卧晚起。', audio: '/audio/jieqi-lidong.mp3', image: IMG.shui, color: '#4a6078' },
  { id: 'xiaoxue', element: '冬', title: '小雪', description: '天地闭塞，虹藏不见。微雪初降，静守内元。', audio: '/audio/jieqi-xiaoxue.mp3', image: IMG.shui, color: '#5a7090' },
  { id: 'daxue', element: '冬', title: '大雪', description: '积阴为大雪，万物尽藏。至静至寂，深修内丹。', audio: '/audio/jieqi-daxue.mp3', image: IMG.shui, color: '#3a5070' },
  { id: 'dongzhi', element: '冬', title: '冬至', description: '日南至，一阳初生。至阴返阳，守静复命。', audio: '/audio/jieqi-dongzhi.mp3', image: IMG.shui, color: '#2a4068' },
  { id: 'xiaohan', element: '冬', title: '小寒', description: '寒气积而为小寒。严凝未极，仍须温养。', audio: '/audio/jieqi-xiaohan.mp3', image: IMG.shui, color: '#3a5878' },
  { id: 'dahan', element: '冬', title: '大寒', description: '寒气之逆极。岁将尽，静候春回。', audio: '/audio/jieqi-dahan.mp3', image: IMG.shui, color: '#2a4868' },
];

export type MusicTheme = 'wuxing' | 'bagua' | 'tiangan' | 'shichen' | 'jieqi';

export const MUSIC_THEMES: Array<{ id: MusicTheme; label: string; desc: string }> = [
  { id: 'wuxing', label: '五行', desc: '金木水火土' },
  { id: 'bagua', label: '八卦', desc: '乾坤震巽坎离艮兑' },
  { id: 'tiangan', label: '十天干', desc: '甲乙丙丁戊己庚辛壬癸' },
  { id: 'shichen', label: '十二时辰', desc: '子丑寅卯辰巳午未申酉戌亥' },
  { id: 'jieqi', label: '二十四节气', desc: '顺天时 · 应物候' },
];

export const TRACKS_BY_THEME: Record<MusicTheme, MusicTrack[]> = {
  wuxing: WUXING_TRACKS,
  bagua: BAGUA_TRACKS,
  tiangan: TIANGAN_TRACKS,
  shichen: SHICHEN_TRACKS,
  jieqi: JIEQI_TRACKS,
};

export const THEME_INTRO: Record<MusicTheme, string> = {
  wuxing: '五行对应五音（宫商角徵羽），是道教乐理的基本框架。以下器乐依五行意象生成，适合阅读时作背景氛围。',
  bagua: '八卦取象天地雷风水火山泽，各卦有独特气韵。以下器乐依八卦意象生成，可随阅读内容切换心境。',
  tiangan: '十天干分阴阳，配五行而生灭。以下曲目依天干意象谱写，可配合术数、历法类典籍阅读。',
  shichen: '一日十二时辰，对应十二地支与脏腑经络。以下曲目依各时辰气韵生成，可随日课作息选用。',
  jieqi: '二十四节气顺天时、应物候，是古人观天授时的智慧。以下曲目依节气流转谱写，春生夏长秋收冬藏。',
};
