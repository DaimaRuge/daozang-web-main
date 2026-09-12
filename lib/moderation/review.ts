/**
 * LLM 初审：用 pi-agent-core 的 Agent + 结构化工具拿到 verdict。
 *
 * 为什么走 Agent 而不是裸 chat JSON：工具参数有 schema，解析失败可明确降级为 flag，
 * 不会把模型随口一句话当成放行。配额与问道隔离——这里不扣 ai_quota。
 *
 * pi 包是纯 ESM，本模块顶层不静态 import，避免 node:test/tsx 的 CJS 解析炸掉纯函数测试。
 */

import { readLlmApiKey, resolvePiRuntime } from '@/lib/agent/pi';

export type AiVerdict = 'allow' | 'flag' | 'block';

export interface AiReview {
  verdict: AiVerdict;
  score: number;
  categories: string[];
  reason: string;
  model: string;
  latencyMs: number;
  parseFailed?: boolean;
}

const SYSTEM = [
  '你是「道可道」公益道藏阅读平台的内容审核员。',
  '平台讨论道教经典、修行、科仪、学术引用，文言与宗教术语是正常内容，不得因此判 block。',
  '只拦截：垃圾广告、刷屏、辱骂、违法违禁、明显色情交易、钓鱼链接。',
  '必须调用 submit_review 提交结论，不要用自然语言作答。',
  'verdict：allow=可公开；flag=不确定，交人工；block=应隐藏。',
].join('\n');

function clampScore(n: number): number {
  if (!Number.isFinite(n)) return 0.5;
  return Math.min(1, Math.max(0, n));
}

function asVerdict(value: unknown): AiVerdict | null {
  return value === 'allow' || value === 'flag' || value === 'block' ? value : null;
}

export type ParsedReview = {
  verdict: AiVerdict;
  score: number;
  categories: string[];
  reason: string;
};

/** 从未知对象抽出审核结论；失败返回 null，由上层降级为 flag。 */
export function parseReviewPayload(raw: unknown): ParsedReview | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  const verdict = asVerdict(o.verdict);
  if (!verdict) return null;
  const categories = Array.isArray(o.categories)
    ? o.categories.filter((x): x is string => typeof x === 'string').slice(0, 8)
    : [];
  const reason = typeof o.reason === 'string' && o.reason.trim() ? o.reason.trim().slice(0, 500) : verdict;
  const score = clampScore(typeof o.score === 'number' ? o.score : Number(o.score));
  return { verdict, score, categories, reason };
}

/** 从模型自由文本里抠第一段 JSON 对象。 */
export function extractJsonObject(text: string): unknown | null {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  try {
    return JSON.parse(text.slice(start, end + 1));
  } catch {
    return null;
  }
}

function flagged(model: string, latencyMs: number, reason: string): AiReview {
  return {
    verdict: 'flag',
    score: 0.5,
    categories: ['parse-failed'],
    reason,
    model,
    latencyMs,
    parseFailed: true,
  };
}

export type ReviewRunner = (input: { text: string; quote?: string }) => Promise<AiReview>;

async function runModerationAgent(input: { text: string; quote?: string }): Promise<AiReview> {
  const started = Date.now();
  const [{ Agent }, { Type, contentText }, { models, model, apiKey }] = await Promise.all([
    import('@earendil-works/pi-agent-core'),
    import('@earendil-works/pi-ai'),
    resolvePiRuntime('fast'),
  ]);
  const box: { value: ParsedReview | null } = { value: null };

  const ReviewSchema = Type.Object({
    verdict: Type.Union([
      Type.Literal('allow'),
      Type.Literal('flag'),
      Type.Literal('block'),
    ]),
    score: Type.Number({ description: '风险 0–1，越高越危险' }),
    categories: Type.Array(Type.String(), { description: 'spam / abuse / ads / illegal / other' }),
    reason: Type.String({ description: '给审核员看的短理由' }),
  });

  const submitReview = {
    name: 'submit_review',
    label: '提交审核',
    description: '提交对这段用户内容的审核结论。',
    parameters: ReviewSchema,
    execute: async (_id: string, params: unknown) => {
      box.value = parseReviewPayload(params);
      return {
        content: [{ type: 'text' as const, text: 'recorded' }],
        details: params,
        terminate: true,
      };
    },
  };

  const agent = new Agent({
    initialState: {
      systemPrompt: SYSTEM,
      model,
      thinkingLevel: 'off',
      tools: [submitReview],
    },
    streamFn: (m, ctx, opts) =>
      models.streamSimple(m, ctx, {
        ...opts,
        apiKey,
        temperature: 0,
        maxTokens: 400,
        signal: opts?.signal ?? AbortSignal.timeout(15_000),
      }),
    getApiKey: () => apiKey,
    convertToLlm: messages =>
      messages.filter(m => m.role === 'user' || m.role === 'assistant' || m.role === 'toolResult'),
  });

  const quoteLine = input.quote ? `引用原文：${input.quote.slice(0, 200)}\n` : '';
  await agent.prompt(`${quoteLine}用户发表：\n${input.text.slice(0, 2000)}`);

  const latencyMs = Date.now() - started;
  if (box.value) {
    return {
      verdict: box.value.verdict,
      score: box.value.score,
      categories: box.value.categories,
      reason: box.value.reason,
      model: model.id,
      latencyMs,
    };
  }

  const last = [...agent.state.messages].reverse().find(m => m.role === 'assistant');
  if (last && last.role === 'assistant') {
    const parsed = parseReviewPayload(extractJsonObject(contentText(last.content)));
    if (parsed) {
      return {
        verdict: parsed.verdict,
        score: parsed.score,
        categories: parsed.categories,
        reason: parsed.reason,
        model: model.id,
        latencyMs,
      };
    }
  }

  const err = agent.state.errorMessage;
  return flagged(model.id, latencyMs, err ? `llm-error:${err.slice(0, 200)}` : 'no-tool-call');
}

/**
 * 对一段文本做 LLM 初审。
 * 未配置密钥时返回 null，由调用方回退到 initialUgcStatus。
 * 解析失败返回 flag，不得当作 allow。
 */
export async function reviewUgcText(
  input: { text: string; quote?: string },
  run: ReviewRunner = runModerationAgent,
): Promise<AiReview | null> {
  if (run === runModerationAgent && !readLlmApiKey()) return null;
  try {
    const result = await run(input);
    if (!result.verdict) return flagged(result.model || 'unknown', result.latencyMs, 'empty-verdict');
    return result;
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown';
    console.error('[moderation-llm]', message);
    return flagged('unknown', 0, `exception:${message.slice(0, 200)}`);
  }
}
