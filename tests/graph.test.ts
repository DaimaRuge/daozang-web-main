/**
 * 知识图谱单元测试。
 *
 * 覆盖三条必须有回归保护的路径：
 * 1. 多模式匹配器的「最长匹配优先」——直接决定图谱质量
 *    （若「符籙」的每次命中都连带记一次「符」，通用词会淹没具体术语）；
 * 2. 布局的名额分配 —— 保证条目少但可靠的关系（如目录归属）不被大组挤掉；
 * 3. 查询层在真实产物上的行为 —— 别名简繁解析、提及边的 blockId 溯源、
 *    以及「构建脚本不得改写原文」这条内容边界。
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
import { AhoCorasick } from '../lib/graph/matcher';
import {
  centerFontSize,
  computeLayout,
  labelBox,
  labelsOverlap,
  nodeDisplayLabel,
} from '../lib/graph/layout';
import { GraphView, nodeId, parseNodeId } from '../lib/graph/schema';
import {
  expandNode,
  getConceptLexicon,
  getGraphAtlasIndex,
  getGraphAtlasSection,
  graphForWork,
  graphViewForQuery,
  isGraphAvailable,
  mentionCitationsForQuery,
  parseAtlasType,
  resolveQuery,
} from '../lib/graph/query';
import { GRAPH_ARTIFACT_MAX_BYTES, loadKnowledgeGraph } from '../lib/graph/load';
import { applyGraphProposals, loadGraphProposals } from '../lib/graph/proposals';
import { listGraphReviewQueue, loadGraphOverrides } from '../lib/graph/overrides';

// ---------- 匹配器 ----------

test('匹配器：命中所有模式并给出正确区间', () => {
  const ac = new AhoCorasick(['符籙', '齋醮']);
  const hits = ac.scan('凡行符籙之法，先建齋醮');
  assert.equal(hits.length, 2);
  assert.equal(hits[0].patternIndex, 0);
  assert.equal(hits[0].start, 2);
  assert.equal(hits[0].end, 4);
  assert.equal(hits[1].patternIndex, 1);
});

test('匹配器：最长匹配优先，短模式不在长匹配内部重复计数', () => {
  // 「神符」与「神符籙」共存时，「神符籙」出现处只应记一次长匹配
  const ac = new AhoCorasick(['神符', '神符籙']);
  const hits = ac.scan('授神符籙於壇');
  assert.equal(hits.length, 1);
  assert.equal(hits[0].patternIndex, 1, '应命中较长的「神符籙」');
});

test('匹配器：短模式在独立出现处仍被计入', () => {
  const ac = new AhoCorasick(['神符', '神符籙']);
  const hits = ac.scan('神符靈驗，又受神符籙');
  assert.equal(hits.length, 2);
  assert.equal(hits[0].patternIndex, 0);
  assert.equal(hits[1].patternIndex, 1);
});

test('匹配器：跨模式的部分重叠不会漏掉后一个模式', () => {
  const ac = new AhoCorasick(['雷法', '法印']);
  const hits = ac.scan('雷法印訣');
  assert.ok(hits.some(h => h.patternIndex === 0), '应命中「雷法」');
});

test('匹配器：无命中时返回空数组', () => {
  assert.deepEqual(new AhoCorasick(['符籙']).scan('清靜無為'), []);
});

// ---------- 节点 id ----------

test('节点 id 拼装与解析互逆', () => {
  const id = nodeId('work', 'abc123');
  assert.equal(id, 'work:abc123');
  assert.deepEqual(parseNodeId(id), { type: 'work', raw: 'abc123' });
});

test('非法节点 id 解析为 null（运行时入参不可信）', () => {
  assert.equal(parseNodeId('不存在的类型:x'), null);
  assert.equal(parseNodeId('work'), null);
  assert.equal(parseNodeId(':x'), null);
});

// ---------- 布局 ----------

/** 构造最小视图：一个只有 1 条的目录关系 + 一个有 30 条的提及关系 */
function fakeView(): GraphView {
  const center = { id: 'concept:x', type: 'concept' as const, label: '中心' };
  const mk = (i: number) => ({
    node: { id: `work:w${i}`, type: 'work' as const, label: `典籍${i}` },
    edge: {
      from: 'concept:x',
      to: `work:w${i}`,
      type: 'mentioned_in' as const,
      source: 'mention' as const,
      confidence: 0.9,
      weight: 30 - i,
    },
    direction: 'out' as const,
  });
  return {
    center,
    synthetic: false,
    groups: [
      {
        type: 'part_of',
        label: '所属部类',
        total: 1,
        items: [
          {
            node: { id: 'category:正一部', type: 'category' as const, label: '正一部' },
            edge: {
              from: 'concept:x',
              to: 'category:正一部',
              type: 'part_of' as const,
              source: 'catalog' as const,
              confidence: 0.98,
            },
            direction: 'out' as const,
          },
        ],
      },
      {
        type: 'mentioned_in',
        label: '见于典籍',
        total: 60,
        items: Array.from({ length: 30 }, (_, i) => mk(i)),
      },
    ],
  };
}

test('布局：节点数不超过上限', () => {
  const layout = computeLayout(fakeView(), { maxNodes: 12 });
  assert.ok(layout.nodes.length <= 12, `实际 ${layout.nodes.length}`);
});

test('布局：条目少的可靠关系不会被大组挤掉', () => {
  const layout = computeLayout(fakeView(), { maxNodes: 6 });
  assert.ok(
    layout.nodes.some(n => n.node.id === 'category:正一部'),
    '目录归属关系必须出现在画布上',
  );
});

test('布局：坐标落在画布内且中心居中', () => {
  const layout = computeLayout(fakeView(), { width: 800, height: 600 });
  assert.equal(layout.center.x, 400);
  assert.equal(layout.center.y, 300);
  for (const n of layout.nodes) {
    assert.ok(n.x >= 0 && n.x <= 800, `x 越界：${n.x}`);
    assert.ok(n.y >= 0 && n.y <= 600, `y 越界：${n.y}`);
  }
});

test('布局：每个分组都分到扇区标题', () => {
  const layout = computeLayout(fakeView(), { maxNodes: 20 });
  assert.equal(layout.sectors.length, 2);
  assert.ok(layout.sectors.some(s => s.label === '见于典籍'));
});

test('布局：分组数大于上限时总节点仍不超过 maxNodes，且靠前的可靠组保留', () => {
  const center = { id: 'concept:x', type: 'concept' as const, label: '中心' };
  const groups: GraphView['groups'] = [
    {
      type: 'part_of',
      label: '所属部类',
      total: 1,
      items: [
        {
          node: { id: 'category:正一部', type: 'category' as const, label: '正一部' },
          edge: {
            from: 'concept:x',
            to: 'category:正一部',
            type: 'part_of',
            source: 'catalog',
            confidence: 0.98,
          },
          direction: 'out',
        },
      ],
    },
  ];
  for (let i = 0; i < 14; i++) {
    groups.push({
      type: 'has_tag',
      label: `标签${i}`,
      total: 1,
      items: [
        {
          node: { id: `tag:t${i}`, type: 'tag' as const, label: `标${i}` },
          edge: {
            from: 'concept:x',
            to: `tag:t${i}`,
            type: 'has_tag',
            source: 'catalog',
            confidence: 0.9,
          },
          direction: 'out',
        },
      ],
    });
  }
  const layout = computeLayout({ center, synthetic: false, groups }, { maxNodes: 8 });
  assert.ok(layout.nodes.length <= 8, `实际 ${layout.nodes.length}`);
  assert.ok(layout.nodes.some(n => n.node.id === 'category:正一部'));
});

test('布局：比例分配取整不得突破剩余名额', () => {
  const center = { id: 'concept:x', type: 'concept' as const, label: '中心' };
  const mkGroup = (label: string, prefix: string): GraphView['groups'][number] => ({
    type: 'mentioned_in',
    label,
    total: 20,
    items: Array.from({ length: 20 }, (_, i) => ({
      node: { id: `work:${prefix}${i}`, type: 'work' as const, label: `${label}${i}` },
      edge: {
        from: 'concept:x',
        to: `work:${prefix}${i}`,
        type: 'mentioned_in',
        source: 'mention',
        confidence: 0.9,
      },
      direction: 'out' as const,
    })),
  });
  const layout = computeLayout(
    {
      center,
      synthetic: false,
      groups: [mkGroup('甲', 'a'), mkGroup('乙', 'b'), mkGroup('丙', 'c')],
    },
    { maxNodes: 5 },
  );
  assert.ok(layout.nodes.length <= 5, `实际 ${layout.nodes.length}`);
  assert.equal(layout.sectors.length, 3, '三组都应保底出现');
});

test('画布标签：剥掉文件名残留的丛集前缀与朝代作者后缀', () => {
  const node = {
    id: 'work:x',
    type: 'work' as const,
    label: '續道藏-漢天師世家-明-張鉞',
  };
  assert.equal(nodeDisplayLabel(node), '漢天師世家');
});

test('画布标签：正常书名只做长度截断，不误伤含朝代字的标题', () => {
  const node = { id: 'work:y', type: 'work' as const, label: '太上洞玄靈寶無量度人上品妙經' };
  assert.equal(nodeDisplayLabel(node, 8), '太上洞玄靈寶無量…');
  // 「明」在标题中间不构成「-朝代-人名」后缀，不应被剪掉
  const keep = { id: 'work:z', type: 'work' as const, label: '黃庭內景玉經注' };
  assert.equal(nodeDisplayLabel(keep), '黃庭內景玉經注');
});

test('画布标签：非典籍节点不做前后缀处理', () => {
  const node = { id: 'concept:a', type: 'concept' as const, label: '符籙' };
  assert.equal(nodeDisplayLabel(node), '符籙');
});

/**
 * 标签包围盒：复用布局导出的 labelBox 与字号，
 * 与 GraphCanvas 的实际绘制口径一致（渲染层不得另立一套字号）。
 */
function labelBoxes(layout: ReturnType<typeof computeLayout>) {
  return [
    labelBox(layout.center, centerFontSize(layout.labelFontSize)),
    ...layout.nodes.map(n => labelBox(n, layout.labelFontSize)),
  ];
}

function countCollisions(layout: ReturnType<typeof computeLayout>): number {
  const boxes = labelBoxes(layout);
  let n = 0;
  for (let i = 0; i < boxes.length; i++) {
    for (let j = i + 1; j < boxes.length; j++) {
      if (labelsOverlap(boxes[i], boxes[j])) n++;
    }
  }
  return n;
}

/** 标签压在别人的节点圆上同样是渲染错乱，必须一并守住 */
function countLabelOverCircle(layout: ReturnType<typeof computeLayout>): number {
  const items = [layout.center, ...layout.nodes];
  const boxes = labelBoxes(layout);
  const circles = items.map(n => ({ x1: n.x - n.r, x2: n.x + n.r, y1: n.y - n.r, y2: n.y + n.r }));
  let n = 0;
  for (let i = 0; i < boxes.length; i++) {
    for (let j = 0; j < circles.length; j++) {
      if (i !== j && labelsOverlap(boxes[i], circles[j])) n++;
    }
  }
  return n;
}

test('布局：长书名密集时标签互不压盖', () => {
  // 道藏书名动辄七八字，同扇区内极易横向压盖，故用真实长书名构造最坏情况
  const titles = [
    '洞玄靈寶三師名諱形狀居觀方所文',
    '洞玄靈寶真靈位業圖',
    '靈寶無量度人上品妙經',
    '靈寶無量度人上經大法',
    '上清洞真元經五籍符',
    '上清金母求仙上法',
    '高上神霄玉清真王紫書大法',
    '高上大洞文昌司祿紫陽寶籙',
    '太上洞淵三昧神咒齋懺謝儀',
    '沖虛至德真經鬳齋口義',
  ];
  const view: GraphView = {
    center: { id: 'concept:c', type: 'concept', label: '符籙' },
    synthetic: false,
    groups: [
      {
        type: 'mentioned_in',
        label: '见于典籍',
        total: titles.length,
        items: titles.map((t, i) => ({
          node: { id: `work:t${i}`, type: 'work' as const, label: t },
          edge: {
            from: 'concept:c',
            to: `work:t${i}`,
            type: 'mentioned_in' as const,
            source: 'mention' as const,
            confidence: 0.9,
          },
          direction: 'out' as const,
        })),
      },
    ],
  };

  for (const opts of [
    { width: 900, height: 620, maxNodes: 34 },
    { width: 760, height: 440, maxNodes: 22 },
    { width: 400, height: 520, maxNodes: 12, labelFontSize: 14 },
  ]) {
    const layout = computeLayout(view, opts);
    assert.equal(countCollisions(layout), 0, `${opts.width}x${opts.height} 出现标签压盖`);
  }
});

// ---------- 查询层（依赖真实产物，未构建时跳过） ----------

const graphReady = isGraphAvailable();
const skipReason = { skip: graphReady ? false : '需先运行 npm run build-graph' };

test('查询：简繁两种写法解析到同一实体', skipReason, () => {
  const a = resolveQuery('符箓');
  const b = resolveQuery('符籙');
  assert.ok(a, '简体「符箓」应能解析');
  assert.equal(a!.id, b!.id);
  assert.equal(a!.type, 'concept');
});

test('查询：展开中心点得到分组关系且含原文提及', skipReason, () => {
  const view = expandNode('concept:fulu');
  assert.ok(view, '符籙节点应存在');
  const mention = view!.groups.find(g => g.type === 'mentioned_in');
  assert.ok(mention && mention.items.length > 0, '应有见于典籍的关系');
  assert.ok(mention!.total <= 60, '提及边在构建期按上限截断');
});

test('查询：提及边的出处可定位到内容块，且引文确实含命中词', skipReason, () => {
  const view = expandNode('concept:fulu')!;
  const mention = view.groups.find(g => g.type === 'mentioned_in')!;
  let checked = 0;
  for (const item of mention.items.slice(0, 5)) {
    const citation = item.edge.citations?.[0];
    assert.ok(citation, `${item.node.label} 的提及边应带出处`);
    assert.ok(citation!.blockId, '出处应含 blockId（阅读器据此深链定位）');
    assert.ok(
      citation!.quote && citation!.matchedTerm && citation!.quote.includes(citation!.matchedTerm),
      `引文应包含实际命中词形：${citation!.quote} / ${citation!.matchedTerm}`,
    );
    // blockId 形如 {bookId}-b{序号}，必须与出处书号一致，否则深链会跳错书
    assert.ok(citation!.blockId!.startsWith(`${citation!.bookId}-b`), citation!.blockId);
    checked++;
  }
  assert.ok(checked > 0);
});

test('查询：词表未命中的检索词走回退链路仍有关系可看', skipReason, () => {
  // 「醮壇」在词表中有实体，故取一个刻意不在词表里的组合词
  const view = graphViewForQuery('五臟');
  assert.ok(view, '回退链路应产出视图');
  assert.equal(view!.synthetic, true, '应标记为合成中心点');
  assert.ok(view!.groups.length > 0, '应至少有一组关系');
  assert.ok(view!.note, '合成视图必须带说明，不能让用户误认为是既有实体');
  const hits = view!.groups.find(g => g.label === '检索命中典籍');
  assert.ok(hits && hits.items.length > 0, '应有检索命中典籍');
  assert.ok(
    hits.items.every(i => i.edge.source === 'catalog'),
    '目录检索命中不得标成原文提及',
  );
});

test('查询：典籍中心点带关联文献与本书涉及的本体', skipReason, () => {
  // 《道法會元》：符箓法术总集，关联关系应当丰富
  const view = graphForWork('32d235d02aa0f195');
  assert.ok(view, '该典籍节点应存在');
  assert.ok(view!.groups.some(g => g.type === 'similar_work'), '应有关联文献');
  assert.ok(
    view!.groups.some(g => g.type === 'mentioned_in' && g.items[0]?.direction === 'in'),
    '应有指向本书的提及边（即本书涉及的本体）',
  );
});

test('查询：不存在的节点返回 null 而不抛错', skipReason, () => {
  assert.equal(expandNode('concept:__不存在__'), null);
  assert.equal(graphForWork('0000000000000000'), null);
});

test('查询：自动抽取节点若存在则不带编造释义', skipReason, () => {
  const graph = loadKnowledgeGraph();
  assert.ok(graph, '图谱产物应可加载');
  const autos = graph.nodes.filter((n: { origin?: string }) => n.origin === 'auto');
  for (const n of autos) {
    assert.ok(!n.shortDef, `自动节点不得带释义：${n.id}`);
  }
  if (graph.stats.autoEntities) {
    assert.equal(autos.length, graph.stats.autoEntities);
    assert.ok(autos.length >= 1000, `词表二期应并入至少 1000 条自动术语，实际 ${autos.length}`);
  }
});

test('查询：本体词表含策展与自动术语，不含书名', skipReason, () => {
  const lexicon = getConceptLexicon();
  assert.ok(lexicon.includes('無為'), '策展词应在词表中');
  assert.ok(lexicon.includes('无为'), '简体别名应在词表中，供简体问句直接命中');
  assert.ok(lexicon.length >= 1000, `词表应覆盖并入的自动术语，实际 ${lexicon.length}`);
  assert.ok(!lexicon.some(t => t.includes('道法會元')), '典籍名不得进入对话分词词表');
});

test('查询：构词归属把太上元始天尊挂到元始天尊，且不把通名天尊挂到三清', skipReason, () => {
  const child = resolveQuery('太上元始天尊');
  const parent = resolveQuery('元始天尊');
  assert.ok(child && parent);
  const view = expandNode(parent.id);
  assert.ok(view);
  const subclasses = view.groups.find(g => g.type === 'subclass_of');
  assert.ok(
    subclasses?.items.some(i => i.node.id === child.id && i.edge.source === 'morphology'),
    '元始天尊应列出构词下位「太上元始天尊」',
  );
  const sanqing = resolveQuery('三清');
  assert.ok(sanqing);
  const sq = expandNode(sanqing.id);
  const sqChildren = sq?.groups.find(g => g.type === 'subclass_of');
  assert.ok(
    !sqChildren?.items.some(i => i.node.label.endsWith('天尊') && i.edge.source === 'morphology' && i.node.label.length > 4 && !['元始天尊', '靈寶天尊'].some(n => i.node.label.includes(n))),
    '三清不应收纳逍遙快樂天尊这类通名',
  );
});

test('查询：三清词表邻域含元始天尊；阴阳连到太极', skipReason, () => {
  const sanqing = resolveQuery('三清');
  assert.ok(sanqing && sanqing.origin === 'curated');
  const sq = expandNode(sanqing.id);
  const related = sq?.groups.find(g => g.type === 'related_to');
  assert.ok(
    related?.items.some(i => i.node.label === '元始天尊' && i.edge.source === 'gazetteer'),
    '三清应有词表策展的「元始天尊」边',
  );
  const yinyang = resolveQuery('阴阳');
  assert.ok(yinyang);
  const yy = expandNode(yinyang.id);
  const yyRelated = yy?.groups.find(g => g.type === 'related_to');
  assert.ok(
    yyRelated?.items.some(i => i.node.label === '太極' && i.edge.source === 'gazetteer'),
    '陰陽应有词表策展的「太極」边',
  );
});

test('查询：高上玉皇挂玉皇；洞真挂三洞', skipReason, () => {
  const child = resolveQuery('高上玉皇');
  const parent = resolveQuery('玉皇');
  assert.ok(child && parent && child.origin === 'auto' && parent.origin === 'curated');
  const view = expandNode(parent.id);
  const subclasses = view?.groups.find(g => g.type === 'subclass_of');
  assert.ok(
    subclasses?.items.some(i => i.node.id === child.id && i.edge.source === 'morphology'),
    '玉皇应列出构词下位「高上玉皇」',
  );
  const dongzhen = resolveQuery('洞真');
  const sandong = resolveQuery('三洞');
  assert.ok(dongzhen && sandong && sandong.origin === 'curated');
  const sd = expandNode(sandong.id);
  const sdChildren = sd?.groups.find(g => g.type === 'subclass_of');
  assert.ok(
    sdChildren?.items.some(i => i.node.id === dongzhen.id && i.edge.source === 'morphology'),
    '三洞应列出构词下位「洞真」',
  );
});

test('查询：丹砂为策展概念并连到外丹', skipReason, () => {
  const dansha = resolveQuery('丹砂');
  assert.ok(dansha && dansha.origin === 'curated' && dansha.shortDef);
  const view = expandNode(dansha.id);
  const related = view?.groups.find(g => g.type === 'related_to');
  assert.ok(
    related?.items.some(i => i.node.label === '外丹' && i.edge.source === 'gazetteer'),
    '丹砂应有词表策展的「外丹」边',
  );
});

test('查询：紫微收纳北極紫微大帝；許真君为策展神祇', skipReason, () => {
  const ziwei = resolveQuery('紫微');
  assert.ok(ziwei && ziwei.origin === 'curated');
  const view = expandNode(ziwei.id);
  const children = view?.groups.find(g => g.type === 'subclass_of');
  assert.ok(
    children?.items.some(i => i.node.label.includes('紫微') && i.edge.source === 'morphology'),
    '紫微应有构词下位',
  );
  const xu = resolveQuery('许真君');
  assert.ok(xu && xu.origin === 'curated' && xu.shortDef);
});

test('查询：别名并入策展；五嶽与太微可解析', skipReason, () => {
  const tao = resolveQuery('陶隐居');
  assert.ok(tao && tao.origin === 'curated' && tao.label === '陶弘景');
  const han = resolveQuery('汉天师');
  assert.ok(han && han.label === '張道陵');
  const wuyue = resolveQuery('五岳');
  assert.ok(wuyue && wuyue.origin === 'curated' && wuyue.type === 'place');
  const taiwei = resolveQuery('太微天帝君');
  assert.ok(taiwei && (taiwei.label === '太微帝君' || taiwei.label.includes('太微')));
  const huang = resolveQuery('黄帝');
  assert.ok(huang && huang.origin === 'curated' && huang.type === 'person');
  const yin = resolveQuery('文始先生');
  assert.ok(yin && yin.origin === 'curated' && yin.label === '尹喜');
  const huanglao = resolveQuery('中央黄老君');
  assert.ok(huanglao && huanglao.origin === 'curated' && huanglao.label === '中央黃老君');
  const qing = resolveQuery('青帝');
  assert.ok(qing && qing.origin === 'curated');
});

test('查询：政策裁定后人工待审队列为空；無為连到清靜而非广布共现', skipReason, () => {
  const raw = loadKnowledgeGraph();
  assert.ok(raw);
  const queue = listGraphReviewQueue(
    applyGraphProposals(raw, loadGraphProposals()),
    loadGraphOverrides(),
    { status: 'pending' },
  );
  assert.equal(queue.pending, 0, '待考共现应已由 review-relations 落盘，文献近邻不进队列');
  const wuwei = resolveQuery('无为');
  assert.ok(wuwei);
  const view = expandNode(wuwei.id);
  const related = view?.groups.find(g => g.type === 'related_to');
  assert.ok(related?.items.some(i => i.node.label === '清靜'), '無為应有清靜词表边');
  const co = view?.groups.find(g => g.type === 'cooccurs_with');
  assert.ok(
    !co?.items.some(i => i.node.label === '長生' || i.node.label === '陰陽'),
    '广布共现不应再占無為邻域',
  );
});

test('查询：已审抽取边确认可见、否决不再展示', skipReason, () => {
  const leidian = resolveQuery('雷电');
  assert.ok(leidian);
  const view = expandNode(leidian.id);
  const related = view?.groups.find(g => g.type === 'related_to');
  assert.ok(
    related?.items.some(i => i.node.label === '雷法' && i.edge.source === 'human'),
    '雷電→雷法应已人工确认',
  );
  const rejected = resolveQuery('度仙上聖天尊');
  if (rejected) {
    const rv = expandNode(rejected.id);
    const rel = rv?.groups.find(g => g.type === 'related_to');
    assert.ok(
      !rel?.items.some(i => i.node.label === '好生度命天尊'),
      '否决的天尊配对不应再出现',
    );
  }
});

test('查询：概念图目录按类型开架，不含典籍与题署人物', skipReason, () => {
  assert.equal(parseAtlasType('deity'), 'deity');
  assert.equal(parseAtlasType('work'), null);
  const index = getGraphAtlasIndex();
  assert.ok(index.some(i => i.type === 'concept' && i.curated >= 30));
  const section = getGraphAtlasSection('concept');
  assert.ok(section);
  assert.ok(section.curated.some(e => e.label === '符籙' && e.shortDef));
  assert.ok(!section.curated.some(e => e.id.startsWith('work:')));
  assert.ok(section.auto.every(e => e.origin === 'auto'));
  const persons = getGraphAtlasSection('person');
  assert.ok(persons);
  assert.ok(persons.curated.every(e => e.origin === 'curated'));
  assert.ok(!persons.curated.some(e => e.label.includes('參知')));
  const filtered = getGraphAtlasSection('deity', '玉皇');
  assert.ok(filtered);
  assert.ok(filtered.curated.some(e => e.label === '玉皇'));
  assert.ok(filtered.curated.every(e => e.label.includes('玉皇')));
});

test('查询：概念出处带回 blockId，供问答引用', skipReason, () => {
  const cites = mentionCitationsForQuery('無為', 2);
  assert.ok(cites.length > 0, '無為应有提及出处');
  assert.ok(cites.length <= 2);
  for (const c of cites) {
    assert.ok(c.bookId && c.bookTitle);
    assert.ok(c.blockId, '问答引用需要能跳回原文的 blockId');
    assert.ok(c.blockId!.startsWith(`${c.bookId}-b`), c.blockId);
  }
});

test('查询：对称关系合并为单一分组且邻居不重复', skipReason, () => {
  // 词表里「符籙 related_to 正一」与「正一 related_to 符籙」两条边都存在，
  // 若按方向分组，用户会看到两个「相关概念」分组、正一出现两次
  const view = expandNode('concept:fulu')!;
  const relatedGroups = view.groups.filter(g => g.type === 'related_to');
  assert.equal(relatedGroups.length, 1, '相关概念应只有一组');
  const labels = relatedGroups[0].items.map(i => i.node.label);
  assert.equal(new Set(labels).size, labels.length, `分组内邻居重复：${labels.join(',')}`);
  for (const g of view.groups) {
    assert.ok(!g.items.some(i => i.node.id === view.center.id), '不应出现指向自身的关系');
  }
});

test('全部中心点在三档画布下均无标签压盖与越界', skipReason, () => {
  // 图谱有近两千个节点，任何一个都可能被用户点成中心点，
  // 因此这条不变量必须对全图成立，而不是抽查几个
  const graph = loadKnowledgeGraph();
  assert.ok(graph, '图谱产物应可加载');
  const sizes = [
    { width: 900, height: 620, maxNodes: 34 },
    { width: 760, height: 440, maxNodes: 22 },
    { width: 400, height: 520, maxNodes: 12, labelFontSize: 14 },
  ];

  for (const opts of sizes) {
    let collided = 0;
    let overCircle = 0;
    let outOfBounds = 0;
    for (const node of graph.nodes) {
      const view = expandNode(node.id);
      if (!view) continue;
      const layout = computeLayout(view, opts);
      if (countCollisions(layout) > 0) collided++;
      if (countLabelOverCircle(layout) > 0) overCircle++;
      for (const box of labelBoxes(layout)) {
        if (box.x1 < -4 || box.x2 > opts.width + 4 || box.y1 < -4 || box.y2 > opts.height + 4) {
          outOfBounds++;
        }
      }
    }
    assert.equal(collided, 0, `${opts.width}x${opts.height}：${collided} 个中心点存在标签压盖`);
    assert.equal(overCircle, 0, `${opts.width}x${opts.height}：${overCircle} 个中心点存在标签压在节点圆上`);
    assert.equal(outOfBounds, 0, `${opts.width}x${opts.height}：${outOfBounds} 个标签越出画布`);
  }
});

// ---------- 内容边界 ----------

test('图谱产物单文件不超过 Vercel 函数安全阈值', skipReason, () => {
  // Vercel 对打进 Serverless Function 的单文件有约 10MB 的历史上限；
  // 未压缩的 graph.json 在并入自动术语后超过该阈值，预览部署会直接失败。
  const dir = path.resolve(process.cwd(), 'public/data');
  const artifacts = fs.readdirSync(dir).filter(f => f.startsWith('graph'));
  assert.ok(artifacts.length > 0, '应存在图谱产物');
  for (const name of artifacts) {
    const bytes = fs.statSync(path.join(dir, name)).size;
    assert.ok(
      bytes <= GRAPH_ARTIFACT_MAX_BYTES,
      `${name} 为 ${(bytes / 1024 / 1024).toFixed(2)}MB，超过 ${(GRAPH_ARTIFACT_MAX_BYTES / 1024 / 1024).toFixed(0)}MB 上限`,
    );
  }
});

test('图谱产物不包含原文全文，仅含受限长度的引文', skipReason, () => {
  const graph = loadKnowledgeGraph();
  assert.ok(graph);
  for (const edge of graph.edges) {
    for (const c of edge.citations ?? []) {
      assert.ok(
        !c.quote || c.quote.length <= 40,
        `引文超过 40 字上限，图谱不得变相复制原文：${c.quote}`,
      );
    }
  }
});

test('构建脚本对原文目录只读（源码层面不出现写入原文的调用）', () => {
  const script = fs.readFileSync(path.resolve(process.cwd(), 'scripts/build-graph.ts'), 'utf-8');
  const writes = script.match(/writeFileSync\([^)]*/g) ?? [];
  assert.ok(writes.length > 0, '脚本应有写出产物的调用');
  for (const w of writes) {
    assert.ok(
      !/CONTENT_DIR|INDEX_PATH/.test(w),
      `构建脚本不得写回原文或索引：${w}`,
    );
  }
});
