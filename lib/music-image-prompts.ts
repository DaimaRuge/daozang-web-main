/**
 * 道乐曲目专属配图提示词（libtv 文生图）。
 * 每首曲目独立视觉，不复用五行图。
 */
import {
  BAGUA_TRACKS,
  JIEQI_TRACKS,
  SHICHEN_TRACKS,
  TIANGAN_TRACKS,
  WUXING_TRACKS,
  MusicTheme,
  musicImg,
} from '../lib/music-catalog';
import type { MusicTrack } from '../app/music/MusicPlayer';

export const MUSIC_IMAGE_STYLE =
  'Traditional Chinese ink wash painting on aged xuan paper, Song literati aesthetic, serene Taoist atmosphere, elegant negative space, muted pine-green and vermilion accents, no text, no watermark, no modern elements';

export interface MusicImageJob {
  theme: MusicTheme;
  track: MusicTrack;
  filename: string;
  nodeName: string;
  prompt: string;
}

/** 在通用描述上叠加主题专属视觉锚点，保证 59 张互不相同 */
const VISUAL: Record<string, string> = {
  // 五行
  'wuxing-jin': 'Autumn mountain altar with bronze bianzhong bells and grey chime stones, cool metallic mist, sparse falling leaves',
  'wuxing-mu': 'Spring bamboo and ancient pine beside a hermitage, tender green shoots, morning mist through grove',
  'wuxing-shui': 'Moonlit waterfall into deep pool, lone fishing boat, flowing blue-black ink washes',
  'wuxing-huo': 'Taoist altar candles and incense flame at dusk, warm vermilion glow, ritual bronze tripod',
  'wuxing-tu': 'Loess terrace with small earth shrine, ochre horizontal fields, harvest stillness at twilight',
  // 八卦
  'bagua-qian': 'Vast azure sky with six hidden dragons, celestial qi ascending, sun at zenith above clouds',
  'bagua-kun': 'Wide golden plain carrying mountains, receptive earth, gentle rolling fields under soft haze',
  'bagua-zhen': 'Spring thunder over valley, lightning fork above sprouting woods, awakening yang energy',
  'bagua-xun': 'Wind bending bamboo and willow, soft penetrating breeze, layered green ink strokes',
  'bagua-kan': 'Deep ravine water, moon reflection in abyss, dangerous beauty, hidden wisdom',
  'bagua-li': 'Sacred flame on altar lamp, phoenix-like light, clarity illuminating dark hall',
  'bagua-gen': 'Still mountain peak above cloud sea, meditating figure silhouette, immovable rock',
  'bagua-dui': 'Lotus pond and marsh reflecting sky, joyful ripples, marsh birds at dusk',
  // 十天干
  'tiangan-jia': 'Towering pine at dawn, yang wood rising, golden light piercing forest canopy',
  'tiangan-yi': 'Curving vine and wildflowers on cliff, flexible yin wood, wind-swept willow',
  'tiangan-bing': 'Blazing sun over alchemy furnace, yang fire, radiant heat haze',
  'tiangan-ding': 'Single oil lamp in scripture hall, yin fire, warm circle of light on desk',
  'tiangan-wu': 'Five sacred mountains panorama, yang earth, monumental plateau',
  'tiangan-ji': 'Terraced rice field after rain, yin earth, nurturing furrows',
  'tiangan-geng': 'Autumn frost on bronze blade and bell, yang metal, sharp clear air',
  'tiangan-xin': 'Jade ornament and dew on silver grass, yin metal, delicate frost sparkle',
  'tiangan-ren': 'Great river bend from cliff view, yang water, mighty current',
  'tiangan-gui': 'Fine rain on mossy stone, yin water, misty spring drizzle',
  // 十二时辰
  'shichen-zi': 'Midnight pond under crescent moon, deep still water, first yang spark',
  'shichen-chou': 'Ox resting in barn at deep night, earthy dim lantern, quiet tillage',
  'shichen-yin': 'Tiger shape in dawn fog, eastern light, buds opening on branch',
  'shichen-mao': 'Rabbit in dewy meadow at sunrise, rosy sky, fresh morning qi',
  'shichen-chen': 'Dragon coiled in morning clouds above temple roof, yang expanding',
  'shichen-si': 'Snake sunning on warm rock, mid-morning heat shimmer',
  'shichen-wu': 'Horse galloping under noon sun, peak yang, blazing sky',
  'shichen-wei': 'Sheep grazing in mellow afternoon shade, soft golden light',
  'shichen-shen': 'Monkey on autumn branch, slanting afternoon sun, gathering qi',
  'shichen-you': 'Rooster on temple eaves at sunset, golden hour, metal resonance',
  'shichen-xu': 'Dog guarding gate at twilight, closing doors, evening drum distant',
  'shichen-hai': 'Pig sleeping by moonlit stream, night rest, water returning inward',
  // 二十四节气（各节气独立物候）
  'jieqi-lichun': 'First willow catkins on ice edge, east wind melting, spring beginning',
  'jieqi-yushui': 'Rain on temple tiles, returning geese, moist air over fields',
  'jieqi-jingzhe': 'Peach blossom with distant spring thunder, insects stirring under soil',
  'jieqi-chunfen': 'Balanced day and night over equinox flowers, swallow flying evenly',
  'jieqi-qingming': 'Clear sky after rain, green hills, quiet tomb path with cypress',
  'jieqi-guyu': 'Rain feeding young grain shoots, floating duckweed on pond',
  'jieqi-lixia': 'First cicada hint, lotus leaves unfolding, summer gate opening',
  'jieqi-xiaoman': 'Wheat ears slightly full in warm field, not yet heavy',
  'jieqi-mangzhong': 'Busy farmer planting rice in humid air, busy orderly rhythm',
  'jieqi-xiazhi': 'Longest day sun over stone sundial, shadow shortest at noon',
  'jieqi-xiaoshu': 'Warm breeze in courtyard, cricket under eaves, lazy heat beginning',
  'jieqi-dashu': 'Cicada on pine in intense summer haze, deep shade meditation',
  'jieqi-liqiu': 'First cool wind rippling lotus, beginning of metal qi, early autumn',
  'jieqi-chushu': 'Heat ending, eagle circling high, lotus pond at ease',
  'jieqi-bailu': 'White dew on pine needles at dawn, wild geese passing',
  'jieqi-qiufen': 'Harvest moon over balanced fields, chrysanthemum blooming',
  'jieqi-hanlu': 'Cold dew on chrysanthemum, deeper autumn mist in valley',
  'jieqi-shuangjiang': 'First frost on stone steps, sparse red leaves falling',
  'jieqi-lidong': 'Closed temple doors, first winter breath, stored grain jars',
  'jieqi-xiaoxue': 'Light snow on roof tiles, quiet white beginning',
  'jieqi-daxue': 'Heavy snow muffling mountains, profound silence, deep winter',
  'jieqi-dongzhi': 'Longest night candle vigil, yang reborn in depth, returning light',
  'jieqi-xiaohan': 'Icy stream under grey sky, austerity before spring',
  'jieqi-dahan': 'Frozen river under cold moon, ultimate stillness before renewal',
};

const THEMES: Array<{ theme: MusicTheme; tracks: MusicTrack[] }> = [
  { theme: 'wuxing', tracks: WUXING_TRACKS },
  { theme: 'bagua', tracks: BAGUA_TRACKS },
  { theme: 'tiangan', tracks: TIANGAN_TRACKS },
  { theme: 'shichen', tracks: SHICHEN_TRACKS },
  { theme: 'jieqi', tracks: JIEQI_TRACKS },
];

export function buildMusicImageJobs(): MusicImageJob[] {
  const jobs: MusicImageJob[] = [];
  for (const { theme, tracks } of THEMES) {
    for (const track of tracks) {
      const key = `${theme}-${track.id}`;
      const visual = VISUAL[key];
      if (!visual) throw new Error(`missing VISUAL prompt for ${key}`);
      jobs.push({
        theme,
        track,
        filename: musicImg(theme, track.id).replace('/images/music/', ''),
        nodeName: `music-${theme}-${track.id}`.slice(0, 40),
        prompt: `${visual}. Taoist music theme "${track.title}": ${track.description}. ${MUSIC_IMAGE_STYLE}`,
      });
    }
  }
  return jobs;
}

export const MUSIC_IMAGE_JOB_COUNT = buildMusicImageJobs().length;
