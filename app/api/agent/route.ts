import { NextResponse } from 'next/server';
import { listTools, executeTool } from '@/lib/agent/tools';
import { getProvider } from '@/lib/agent/provider';
import { runChat, runChatStream } from '@/lib/agent/chat';
import { AgentContext } from '@/lib/agent/context';
import { checkAiQuota, consumeAiQuota } from '@/lib/agent/quota';
import { sseResponse, sseStream } from '@/lib/agent/sse';

/**
 * Agent API（v1 + SSE 流式 + 匿名配额）。
 *
 * 契约：
 *   GET  /api/agent          → 工具清单与 AI 配置状态
 *   POST /api/agent          → { action, stream?, ... }
 *     stream: true 时返回 text/event-stream（chunk / done / error）
 */

export async function GET() {
  const provider = getProvider();
  return NextResponse.json({
    version: 1,
    aiConfigured: provider.isConfigured(),
    tools: listTools(),
    streaming: true,
  });
}

async function handleStreamChat(context: AgentContext, request: Request): Promise<Response> {
  const quota = await checkAiQuota(request, context);
  if (!quota.allowed) {
    return NextResponse.json(
      { error: '今日 AI 次数已用完', quotaRemaining: 0, limit: quota.limit },
      { status: 429 },
    );
  }

  const generator = async function* () {
    let full = '';
    for await (const part of runChatStream(context)) {
      if (part.event === 'chunk') {
        const text = (part.data as { text?: string }).text ?? '';
        full += text;
        yield part;
      } else {
        const after = await consumeAiQuota(request, context);
        yield {
          event: 'done' as const,
          data: {
            ...(part.data as object),
            reply: full,
            quotaRemaining: after.remaining,
          },
        };
      }
    }
  };

  return sseResponse(sseStream(generator()));
}

async function handleStreamTool(
  tool: string,
  input: Record<string, unknown>,
  context: AgentContext,
  request: Request,
): Promise<Response> {
  const quota = await checkAiQuota(request, context);
  if (!quota.allowed) {
    return NextResponse.json(
      { error: '今日 AI 次数已用完', quotaRemaining: 0, limit: quota.limit },
      { status: 429 },
    );
  }

  const generator = async function* () {
    const result = await executeTool(tool, input, context);
    if (!result.ok) {
      yield { event: 'error' as const, data: { error: result.error } };
      return;
    }
    const explanation =
      (result.result as { explanation?: string })?.explanation ??
      JSON.stringify(result.result);
    // 工具结果一次性推送（explain/translate 通常较短；未来可改 provider 流式）
    yield { event: 'chunk' as const, data: { text: explanation } };
    const after = await consumeAiQuota(request, context);
    yield {
      event: 'done' as const,
      data: {
        ok: true,
        result: result.result,
        quotaRemaining: after.remaining,
      },
    };
  };

  return sseResponse(sseStream(generator()));
}

export async function POST(request: Request) {
  let body: {
    action?: string;
    tool?: string;
    input?: Record<string, unknown>;
    context?: AgentContext;
    stream?: boolean;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: '请求体必须为 JSON' }, { status: 400 });
  }

  const context: AgentContext = body.context ?? {
    session: { sessionId: 'anonymous', startedAt: Date.now() },
    page: { path: '/', pageType: 'other' },
    permissions: { canReadUserData: false, canWriteUserData: false, canUseAI: false },
  };

  const wantsStream =
    body.stream === true ||
    request.headers.get('accept')?.includes('text/event-stream');

  if (body.action === 'tool') {
    if (!body.tool) return NextResponse.json({ error: 'tool 必填' }, { status: 400 });
    if (!context.permissions.canUseAI) {
      return NextResponse.json({ error: '权限不足: 需要 canUseAI' }, { status: 403 });
    }
    const AI_TOOLS = new Set([
      'explain_selected_text',
      'translate_to_modern_chinese',
      'generate_summary',
    ]);
    if (wantsStream && AI_TOOLS.has(body.tool)) {
      return handleStreamTool(body.tool, body.input ?? {}, context, request);
    }
    const quota = await checkAiQuota(request, context);
    if (!quota.allowed) {
      return NextResponse.json(
        { error: '今日 AI 次数已用完', quotaRemaining: 0, limit: quota.limit },
        { status: 429 },
      );
    }
    const result = await executeTool(body.tool, body.input ?? {}, context);
    if (result.ok && AI_TOOLS.has(body.tool)) {
      const after = await consumeAiQuota(request, context);
      return NextResponse.json({ ...result, quotaRemaining: after.remaining }, { status: 200 });
    }
    return NextResponse.json(result, { status: result.ok ? 200 : 400 });
  }

  if (body.action === 'chat') {
    const provider = getProvider();
    if (!provider.isConfigured()) {
      return NextResponse.json(
        { error: 'AI 服务尚未接入，接口契约已就绪。', aiConfigured: false },
        { status: 501 },
      );
    }
    if (!context.permissions.canUseAI) {
      return NextResponse.json({ error: '权限不足: 需要 canUseAI' }, { status: 403 });
    }
    if (wantsStream) {
      return handleStreamChat(context, request);
    }
    const quota = await checkAiQuota(request, context);
    if (!quota.allowed) {
      return NextResponse.json(
        { error: '今日 AI 次数已用完', quotaRemaining: 0, limit: quota.limit },
        { status: 429 },
      );
    }
    try {
      const result = await runChat(context);
      const after = await consumeAiQuota(request, context);
      return NextResponse.json({ ...result, quotaRemaining: after.remaining });
    } catch (e) {
      return NextResponse.json(
        { error: e instanceof Error ? e.message : 'AI 服务调用失败' },
        { status: 500 },
      );
    }
  }

  if (body.action === 'quota') {
    const status = await checkAiQuota(request, context);
    return NextResponse.json(status);
  }

  return NextResponse.json({ error: '未知 action，支持 tool | chat | quota' }, { status: 400 });
}
