/**
 * 构词归属：自动术语只挂到策展正名，别名与神名通名不得乱认亲。
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { inferTaxonomyLink, MAX_MORPHOLOGY_CHILDREN, pickTaxonomyLinks } from '../lib/graph/taxonomy';

const parents = [
  { id: 'deity:yuanshi', type: 'deity', label: '元始天尊', aliases: ['元始'] },
  { id: 'deity:lingbao', type: 'deity', label: '靈寶天尊' },
  { id: 'deity:taiyi', type: 'deity', label: '太乙救苦天尊' },
  { id: 'deity:laojun', type: 'deity', label: '太上老君', aliases: ['老君'] },
  { id: 'deity:yuhuang', type: 'deity', label: '玉皇' },
  { id: 'deity:zhenwu', type: 'deity', label: '真武' },
  { id: 'deity:ziwei', type: 'deity', label: '紫微', aliases: ['紫微大帝', '北極紫微'] },
  { id: 'deity:dongyue', type: 'deity', label: '東嶽大帝', aliases: ['東嶽'] },
  { id: 'deity:leizun', type: 'deity', label: '雷聲普化天尊', aliases: ['雷祖大帝'] },
  { id: 'concept:wuwei', type: 'concept', label: '無為' },
  { id: 'concept:dongtian', type: 'concept', label: '洞天福地' },
  { id: 'concept:sanqing', type: 'concept', label: '三清' },
  { id: 'place:kunlun', type: 'place', label: '崑崙' },
  { id: 'place:taishan', type: 'place', label: '泰山' },
  { id: 'place:nanyue', type: 'place', label: '南嶽', aliases: ['衡山', '南嶽衡山'] },
  { id: 'place:xiyue', type: 'place', label: '西嶽', aliases: ['華山'] },
  { id: 'deity:taiwei', type: 'deity', label: '太微帝君', aliases: ['太微'] },
  { id: 'deity:nandou', type: 'deity', label: '南斗', aliases: ['南斗六司'] },
  { id: 'deity:qingdi', type: 'deity', label: '青帝', aliases: ['青帝君'] },
  { id: 'concept:dansha', type: 'concept', label: '丹砂' },
  { id: 'concept:sandong', type: 'concept', label: '三洞' },
  { id: 'concept:yinyang', type: 'concept', label: '陰陽' },
];

test('后缀正名：太上元始天尊 → 元始天尊', () => {
  const link = inferTaxonomyLink({ term: '太上元始天尊', type: 'deity' }, parents);
  assert.deepEqual(link, { parentId: 'deity:yuanshi', via: '元始天尊', confidence: 0.8 });
});

test('前缀正名：真武真君 → 真武；玉皇大天尊 → 玉皇', () => {
  assert.equal(inferTaxonomyLink({ term: '真武真君', type: 'deity' }, parents)?.parentId, 'deity:zhenwu');
  assert.equal(inferTaxonomyLink({ term: '玉皇大天尊', type: 'deity' }, parents)?.parentId, 'deity:yuhuang');
});

test('地名：崑崙山 → 崑崙；東嶽泰山 → 泰山', () => {
  assert.equal(inferTaxonomyLink({ term: '崑崙山', type: 'place' }, parents)?.parentId, 'place:kunlun');
  assert.equal(inferTaxonomyLink({ term: '東嶽泰山', type: 'place' }, parents)?.parentId, 'place:taishan');
});

test('约定后缀：救苦天尊 → 太乙；洞天/福地 → 洞天福地', () => {
  assert.equal(
    inferTaxonomyLink({ term: '十方救苦天尊', type: 'deity' }, parents)?.parentId,
    'deity:taiyi',
  );
  assert.equal(inferTaxonomyLink({ term: '華陽洞天', type: 'place' }, parents)?.parentId, 'concept:dongtian');
  assert.equal(inferTaxonomyLink({ term: '七十二福地', type: 'place' }, parents)?.parentId, 'concept:dongtian');
});

test('不认别名义项：希言自然不得挂到無為', () => {
  // 若误用「自然」这个别名，会把完全不相干的词挂上去
  assert.equal(inferTaxonomyLink({ term: '希言自然', type: 'concept' }, parents), null);
});

test('神名通名不挂三清：逍遙快樂天尊保持孤立', () => {
  assert.equal(inferTaxonomyLink({ term: '逍遙快樂天尊', type: 'deity' }, parents), null);
});

test('动词前缀丢弃：見老君、普告三界、傳太微天帝君', () => {
  assert.equal(inferTaxonomyLink({ term: '見老君', type: 'deity' }, parents), null);
  assert.equal(inferTaxonomyLink({ term: '普告三界', type: 'concept' }, parents), null);
  assert.equal(inferTaxonomyLink({ term: '傳太微天帝君', type: 'deity' }, parents), null);
});

test('中央黃老君不误认为太上老君的下位', () => {
  assert.equal(inferTaxonomyLink({ term: '中央黃老君', type: 'deity' }, parents), null);
});

test('神祇中缀与安全别名：紫微、東嶽、雷祖大帝', () => {
  assert.equal(inferTaxonomyLink({ term: '北極紫微大帝', type: 'deity' }, parents)?.parentId, 'deity:ziwei');
  assert.equal(inferTaxonomyLink({ term: '東嶽泰山君', type: 'deity' }, parents)?.parentId, 'deity:dongyue');
  assert.equal(inferTaxonomyLink({ term: '九天雷祖大帝', type: 'deity' }, parents)?.parentId, 'deity:leizun');
  assert.equal(inferTaxonomyLink({ term: '元始天王', type: 'deity' }, parents)?.parentId, 'deity:yuanshi');
});

test('二字别名不作后缀：聞天尊不挂到任何正名', () => {
  assert.equal(inferTaxonomyLink({ term: '聞天尊', type: 'deity' }, parents), null);
});

test('太微前缀、南斗中缀、丹砂下位、衡山约定后缀', () => {
  assert.equal(inferTaxonomyLink({ term: '太微天帝君', type: 'deity' }, parents)?.parentId, 'deity:taiwei');
  assert.equal(inferTaxonomyLink({ term: '南斗六司星君', type: 'deity' }, parents)?.parentId, 'deity:nandou');
  assert.equal(inferTaxonomyLink({ term: '伏火丹砂', type: 'concept' }, parents)?.parentId, 'concept:dansha');
  assert.equal(inferTaxonomyLink({ term: '祝融衡山', type: 'place' }, parents)?.parentId, 'place:nanyue');
  assert.equal(inferTaxonomyLink({ term: '東方青帝君', type: 'deity' }, parents)?.parentId, 'deity:qingdi');
});

test('概念可挂神祇正名：高上玉皇 → 玉皇', () => {
  assert.equal(
    inferTaxonomyLink({ term: '高上玉皇', type: 'concept' }, parents)?.parentId,
    'deity:yuhuang',
  );
});

test('约定整词：洞真/洞玄/大洞 → 三洞；少陽/少陰 → 陰陽', () => {
  assert.equal(inferTaxonomyLink({ term: '洞真', type: 'concept' }, parents)?.parentId, 'concept:sandong');
  assert.equal(inferTaxonomyLink({ term: '洞玄', type: 'concept' }, parents)?.parentId, 'concept:sandong');
  assert.equal(inferTaxonomyLink({ term: '大洞', type: 'concept' }, parents)?.parentId, 'concept:sandong');
  assert.equal(inferTaxonomyLink({ term: '少陽', type: 'concept' }, parents)?.parentId, 'concept:yinyang');
  assert.equal(inferTaxonomyLink({ term: '少陰', type: 'concept' }, parents)?.parentId, 'concept:yinyang');
});

test('每个上位截断子女数量', () => {
  const children = Array.from({ length: 20 }, (_, i) => ({
    term: `第${i}元始天尊`,
    type: 'deity',
  }));
  const links = pickTaxonomyLinks(children, parents);
  assert.ok(links.every(l => l.parentId === 'deity:yuanshi'));
  assert.ok(links.length <= MAX_MORPHOLOGY_CHILDREN);
});
