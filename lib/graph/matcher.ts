/**
 * 多模式串匹配（Aho-Corasick）—— 全库提及扫描的性能前提。
 *
 * 为什么必须用自动机而不是沿用 fulltext-search 的 indexOf：
 * 词表约 250 个实体，展开简繁异体别名后接近上千个模式；语料约 3500 万字。
 * 逐模式 indexOf 是「模式数 × 语料长度」≈ 350 亿次字符比较，构建脚本会跑到不可用。
 * 自动机把它压成对语料的一遍扫描（与模式数无关）。
 *
 * 为什么放在 lib 而不是 scripts：纯函数、无 I/O，需要被单测覆盖
 * （最长匹配优先的策略直接影响图谱质量，必须可回归）。
 *
 * 匹配策略：最长匹配优先。道藏术语大量互为前缀（符 / 符箓 / 神符箓），
 * 若不做抑制，「符箓」的每次命中都会连带记一次「符」，
 * 图谱里通用词会淹没具体术语。
 */

interface AcNode {
  /** 字符 → 子节点下标 */
  next: Map<number, number>;
  /** 失配指针 */
  fail: number;
  /** 以本节点结尾的模式在 patterns 中的下标；-1 表示无 */
  pattern: number;
  /** 沿失配链能到达的最近「有模式」节点，避免扫描时逐级回溯 */
  outputLink: number;
  /** 该节点对应模式的长度（用于计算匹配起点） */
  depth: number;
}

export interface AcMatch {
  /** 命中模式在构造入参中的下标 */
  patternIndex: number;
  /** 命中起点（含） */
  start: number;
  /** 命中终点（不含） */
  end: number;
}

/**
 * Aho-Corasick 自动机。
 * 构造一次可反复扫描（构建脚本对 1504 部典籍复用同一个实例）。
 */
export class AhoCorasick {
  private nodes: AcNode[] = [];
  private patterns: string[] = [];

  constructor(patterns: string[]) {
    this.nodes.push(this.newNode());
    // 去重但保留下标语义：调用方按 patternIndex 反查实体，
    // 故重复模式保留首次出现的下标（后续重复直接映射到同一节点）
    for (let i = 0; i < patterns.length; i++) {
      const p = patterns[i];
      this.patterns.push(p);
      if (!p) continue;
      let cur = 0;
      for (let c = 0; c < p.length; c++) {
        const code = p.charCodeAt(c);
        let nxt = this.nodes[cur].next.get(code);
        if (nxt === undefined) {
          nxt = this.nodes.length;
          this.nodes.push(this.newNode());
          this.nodes[nxt].depth = this.nodes[cur].depth + 1;
          this.nodes[cur].next.set(code, nxt);
        }
        cur = nxt;
      }
      // 同一词形被多个实体共用时以先注册者为准（词表应避免这种歧义）
      if (this.nodes[cur].pattern === -1) this.nodes[cur].pattern = i;
    }
    this.buildFailLinks();
  }

  private newNode(): AcNode {
    return { next: new Map(), fail: 0, pattern: -1, outputLink: -1, depth: 0 };
  }

  /** BFS 构建失配指针与输出链 */
  private buildFailLinks(): void {
    const queue: number[] = [];
    for (const child of this.nodes[0].next.values()) {
      this.nodes[child].fail = 0;
      queue.push(child);
    }
    for (let head = 0; head < queue.length; head++) {
      const cur = queue[head];
      const node = this.nodes[cur];
      const failNode = this.nodes[node.fail];
      node.outputLink = failNode.pattern !== -1 ? node.fail : failNode.outputLink;

      for (const [code, child] of node.next) {
        let f = node.fail;
        // 沿失配链找最长可延续的后缀
        for (;;) {
          const cand = this.nodes[f].next.get(code);
          if (cand !== undefined && cand !== child) {
            this.nodes[child].fail = cand;
            break;
          }
          if (f === 0) {
            this.nodes[child].fail = 0;
            break;
          }
          f = this.nodes[f].fail;
        }
        queue.push(child);
      }
    }
  }

  /**
   * 扫描文本，返回最长匹配优先、互不嵌套的命中列表。
   *
   * 为什么必须分两步走：自动机是从左向右流式推进的，短模式总在长模式之前
   * 被发现（读到「神符」时还不知道后面跟着「籙」）。因此第一步先收集候选，
   * 第二步再剔除被其他候选完全包含的那些 —— 只有这样「神符籙」出现处
   * 才不会同时给「神符」记一次。部分重叠（如「雷法」与「法印」在「雷法印」中）
   * 不属于包含关系，两者都保留，因为它们确实各自出现过。
   */
  scan(text: string): AcMatch[] {
    const candidates: AcMatch[] = [];
    let state = 0;

    for (let i = 0; i < text.length; i++) {
      const code = text.charCodeAt(i);
      // 失配回退
      for (;;) {
        const nxt = this.nodes[state].next.get(code);
        if (nxt !== undefined) {
          state = nxt;
          break;
        }
        if (state === 0) break;
        state = this.nodes[state].fail;
      }

      const node = this.nodes[state];
      // 同一结束位置只取最深（最长）的模式；更短的后缀模式若确有独立出现，
      // 会在它自己的结束位置被单独收集到
      const hit = node.pattern !== -1 ? state : node.outputLink;
      if (hit === -1) continue;

      const hitNode = this.nodes[hit];
      const end = i + 1;
      candidates.push({ patternIndex: hitNode.pattern, start: end - hitNode.depth, end });
    }

    if (candidates.length < 2) return candidates;

    // 起点升序、同起点按长度降序：如此扫一遍即可判定包含关系，
    // 因为任何在前的候选起点都不大于当前候选起点
    candidates.sort((a, b) => (a.start - b.start) || (b.end - a.end));

    const out: AcMatch[] = [];
    let maxEnd = -1;
    for (const c of candidates) {
      if (c.end <= maxEnd) continue; // 被此前某个更长的候选完全覆盖
      out.push(c);
      maxEnd = c.end;
    }
    return out;
  }

  /** 模式总数（含空模式），供构建脚本打印统计 */
  get size(): number {
    return this.patterns.length;
  }
}
