/**
 * 模型供应商抽象层。
 *
 * 为什么要这一层：Agent 能力必须与具体模型供应商（OpenAI / Anthropic / 本地模型）
 * 解耦 —— 站点是公益项目，供应商与成本策略随时可能调整，
 * 业务代码只依赖 LLMProvider 接口，切换供应商只改这里的实现与环境变量。
 *
 * 安全约束：本文件只允许在服务端使用（读取环境变量密钥），
 * 任何情况下不得把密钥或本文件逻辑暴露到客户端 bundle。
 */

import { AgentMessage } from './context';

/** 供应商无关的对话补全接口 */
export interface LLMProvider {
  /** 供应商标识，用于日志与调试 */
  readonly name: string;
  /** 是否已正确配置（有可用密钥） */
  isConfigured(): boolean;
  /** 对话补全：输入通用消息格式，返回助手回复文本 */
  chat(messages: AgentMessage[], options?: ChatOptions): Promise<string>;
  /** 流式对话补全：逐块 yield 文本 delta */
  chatStream(messages: AgentMessage[], options?: ChatOptions): AsyncGenerator<string, void, unknown>;
}

export interface ChatOptions {
  temperature?: number;
  maxTokens?: number;
}

/**
 * 空实现：AI 服务尚未接入时的占位供应商。
 * 让上层调用路径（API 路由、工具执行）在无密钥环境下也能完整走通并返回明确提示，
 * 而不是在各处散落 if (没有AI) 的判断。
 */
export class NullProvider implements LLMProvider {
  readonly name = 'null';

  isConfigured(): boolean {
    return false;
  }

  async chat(): Promise<string> {
    throw new AgentNotConfiguredError();
  }

  async *chatStream(): AsyncGenerator<string, void, unknown> {
    throw new AgentNotConfiguredError();
  }
}

export class AgentNotConfiguredError extends Error {
  constructor() {
    super('AI 服务尚未配置。请在环境变量中设置模型供应商密钥后重试。');
    this.name = 'AgentNotConfiguredError';
  }
}

/**
 * OpenAI 兼容供应商：适配所有提供 /chat/completions 接口的服务
 * （OpenAI、DeepSeek、Moonshot、通义、本地 vLLM/Ollama 等）。
 *
 * 为什么用原生 fetch 而不引入官方 SDK：公益项目依赖越少越好，
 * chat/completions 是事实标准，一个 fetch 即可覆盖全部兼容服务，
 * 且避免 SDK 版本与 Next.js 打包的耦合。
 */
export class OpenAICompatibleProvider implements LLMProvider {
  readonly name: string;
  private baseUrl: string;
  private apiKey: string;
  private model: string;

  constructor(baseUrl: string, apiKey: string, model: string) {
    this.baseUrl = baseUrl.replace(/\/+$/, '');
    this.apiKey = apiKey;
    this.model = model;
    this.name = `openai-compatible(${model})`;
  }

  isConfigured(): boolean {
    return Boolean(this.baseUrl && this.apiKey && this.model);
  }

  async chat(messages: AgentMessage[], options?: ChatOptions): Promise<string> {
    const res = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: this.model,
        messages: messages.map(m => ({ role: m.role, content: m.content })),
        temperature: options?.temperature ?? 0.3,
        max_tokens: options?.maxTokens ?? 1024,
      }),
      // 生成类请求上限 60 秒，避免函数超时前无响应
      signal: AbortSignal.timeout(60_000),
    });

    if (!res.ok) {
      // 不把上游错误详情透传给客户端（可能含敏感信息），只记录日志
      const detail = await res.text().catch(() => '');
      console.error('[llm-provider]', res.status, detail.slice(0, 500));
      throw new Error(`AI 服务调用失败（${res.status}）`);
    }

    const data = await res.json();
    const content = data?.choices?.[0]?.message?.content;
    if (typeof content !== 'string') throw new Error('AI 服务返回格式异常');
    return content;
  }

  async *chatStream(messages: AgentMessage[], options?: ChatOptions): AsyncGenerator<string, void, unknown> {
    const res = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: this.model,
        messages: messages.map(m => ({ role: m.role, content: m.content })),
        temperature: options?.temperature ?? 0.3,
        max_tokens: options?.maxTokens ?? 1024,
        stream: true,
      }),
      signal: AbortSignal.timeout(120_000),
    });

    if (!res.ok || !res.body) {
      const detail = await res.text().catch(() => '');
      console.error('[llm-provider stream]', res.status, detail.slice(0, 500));
      throw new Error(`AI 服务调用失败（${res.status}）`);
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith('data:')) continue;
        const payload = trimmed.slice(5).trim();
        if (payload === '[DONE]') return;
        try {
          const json = JSON.parse(payload);
          const delta = json?.choices?.[0]?.delta?.content;
          if (typeof delta === 'string' && delta) yield delta;
        } catch {
          // 忽略不完整 JSON 行
        }
      }
    }
  }
}

/** DeepSeek OpenAI 兼容默认值（见 https://api-docs.deepseek.com） */
const DEFAULT_BASE_URL = 'https://api.deepseek.com';
const DEFAULT_MODEL_PRO = 'deepseek-v4-pro';
const DEFAULT_MODEL_FAST = 'deepseek-v4-flash';

/**
 * 供应商工厂：由环境变量决定实现，业务代码不感知具体供应商。
 * 所需环境变量（仅服务端，切勿暴露到前端）：
 *   DZ_LLM_API_KEY / DEEPSEEK_API_KEY  密钥（二选一，必填）
 *   DZ_LLM_BASE_URL  默认 https://api.deepseek.com
 *   DZ_LLM_MODEL     主模型，默认 deepseek-v4-pro（问道/复杂问答）
 *   DZ_LLM_MODEL_FAST 快速模型，默认 deepseek-v4-flash（划词释义/译文）
 */
export function getProvider(tier: 'fast' | 'pro' = 'pro'): LLMProvider {
  const baseUrl = (process.env.DZ_LLM_BASE_URL || DEFAULT_BASE_URL).replace(/\/+$/, '');
  const apiKey = process.env.DZ_LLM_API_KEY || process.env.DEEPSEEK_API_KEY;
  const proModel = process.env.DZ_LLM_MODEL || DEFAULT_MODEL_PRO;
  const fastModel = process.env.DZ_LLM_MODEL_FAST || DEFAULT_MODEL_FAST;
  const model = tier === 'fast' ? fastModel : proModel;
  // 仅密钥必填；base / model 有官方默认，避免漏配模型名导致整站 AI 不可用
  if (apiKey && model) {
    return new OpenAICompatibleProvider(baseUrl, apiKey, model);
  }
  return new NullProvider();
}
