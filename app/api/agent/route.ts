import { NextResponse } from 'next/server';
import { listTools, executeTool } from '@/lib/agent/tools';
import { getProvider } from '@/lib/agent/provider';
import { runChat } from '@/lib/agent/chat';
import { AgentContext } from '@/lib/agent/context';

/**
 * Agent API（v1 骨架）。
 *
 * 为什么现在就建这个路由：Web as Agent 架构要求「接口先行」——
 * 前端（以及未来的 App 客户端）从现在起就按此契约开发，
 * 模型供应商接入后本路由内部升级即可，客户端零改动。
 *
 * 契约：
 *   GET  /api/agent          → 返回工具清单与 AI 配置状态
 *   POST /api/agent          → { action: 'tool', tool, input, context }  调用工具
 *                              { action: 'chat', context }               AI 对话（待供应商接入）
 *
 * 安全：模型不直接访问数据，一切经 executeTool 的权限检查与输入校验；
 * 密钥只存在于服务端环境变量。
 */

export async function GET() {
  const provider = getProvider();
  return NextResponse.json({
    version: 1,
    aiConfigured: provider.isConfigured(),
    tools: listTools(),
  });
}

export async function POST(request: Request) {
  let body: { action?: string; tool?: string; input?: Record<string, unknown>; context?: AgentContext };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: '请求体必须为 JSON' }, { status: 400 });
  }

  // 未提供上下文时按最小权限处理，防止越权调用用户数据类工具
  const context: AgentContext = body.context ?? {
    session: { sessionId: 'anonymous', startedAt: Date.now() },
    page: { path: '/', pageType: 'other' },
    permissions: { canReadUserData: false, canWriteUserData: false, canUseAI: false },
  };

  if (body.action === 'tool') {
    if (!body.tool) return NextResponse.json({ error: 'tool 必填' }, { status: 400 });
    const result = await executeTool(body.tool, body.input ?? {}, context);
    return NextResponse.json(result, { status: result.ok ? 200 : 400 });
  }

  if (body.action === 'chat') {
    const provider = getProvider();
    if (!provider.isConfigured()) {
      // 明确告知未配置而非伪造回答 —— 不把 AI 能力伪装成已实现
      return NextResponse.json(
        { error: 'AI 服务尚未接入，接口契约已就绪。', aiConfigured: false },
        { status: 501 },
      );
    }
    if (!context.permissions.canUseAI) {
      return NextResponse.json({ error: '权限不足: 需要 canUseAI' }, { status: 403 });
    }
    try {
      const result = await runChat(context);
      return NextResponse.json(result);
    } catch (e) {
      return NextResponse.json(
        { error: e instanceof Error ? e.message : 'AI 服务调用失败' },
        { status: 500 },
      );
    }
  }

  return NextResponse.json({ error: '未知 action，支持 tool | chat' }, { status: 400 });
}
