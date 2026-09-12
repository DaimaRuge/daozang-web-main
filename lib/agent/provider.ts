/**
 * 模型供应商抽象层。
 *
 * 业务代码只依赖 LLMProvider；具体供应商由 @earendil-works/pi-ai 解析，
 * 切换 DeepSeek / Anthropic / OpenAI / Gemini / OpenRouter 只改环境变量。
 * 本文件只允许在服务端使用，密钥不得进入客户端 bundle。
 */

import type { Message, Model, Api } from '@earendil-works/pi-ai';
import { AgentMessage } from './context';
import { llmModelId, llmProviderId, readLlmApiKey, resolvePiRuntime, type LlmTier } from './pi';

export interface LLMProvider {
  readonly name: string;
  isConfigured(): boolean;
  chat(messages: AgentMessage[], options?: ChatOptions): Promise<string>;
  chatStream(messages: AgentMessage[], options?: ChatOptions): AsyncGenerator<string, void, unknown>;
}

export interface ChatOptions {
  temperature?: number;
  maxTokens?: number;
}

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

function toPiMessages(messages: AgentMessage[], model: Model<Api>): Message[] {
  return messages
    .filter(m => m.role !== 'system')
    .map(m => {
      if (m.role === 'assistant') {
        return {
          role: 'assistant' as const,
          content: [{ type: 'text' as const, text: m.content }],
          api: model.api,
          provider: model.provider,
          model: model.id,
          usage: {
            input: 0,
            output: 0,
            cacheRead: 0,
            cacheWrite: 0,
            totalTokens: 0,
            cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
          },
          stopReason: 'stop' as const,
          timestamp: Date.now(),
        };
      }
      return {
        role: 'user' as const,
        content: m.content,
        timestamp: Date.now(),
      };
    });
}

class PiProvider implements LLMProvider {
  readonly name: string;
  private tier: LlmTier;

  constructor(tier: LlmTier) {
    this.tier = tier;
    this.name = `pi(${llmProviderId()}/${llmModelId(tier)})`;
  }

  isConfigured(): boolean {
    return Boolean(readLlmApiKey());
  }

  async chat(messages: AgentMessage[], options?: ChatOptions): Promise<string> {
    const { models, model, apiKey } = await resolvePiRuntime(this.tier);
    const systemPrompt = messages.find(m => m.role === 'system')?.content;
    const result = await models.completeSimple(
      model,
      { systemPrompt, messages: toPiMessages(messages, model) },
      {
        apiKey,
        temperature: options?.temperature ?? 0.3,
        maxTokens: options?.maxTokens ?? 1024,
        signal: AbortSignal.timeout(60_000),
      },
    );
    if (result.stopReason === 'error' || result.stopReason === 'aborted') {
      console.error('[llm-provider]', result.errorMessage);
      throw new Error('AI 服务调用失败');
    }
    const { contentText } = await import('@earendil-works/pi-ai');
    const text = contentText(result.content).trim();
    if (!text) throw new Error('AI 服务返回格式异常');
    return text;
  }

  async *chatStream(messages: AgentMessage[], options?: ChatOptions): AsyncGenerator<string, void, unknown> {
    const { models, model, apiKey } = await resolvePiRuntime(this.tier);
    const systemPrompt = messages.find(m => m.role === 'system')?.content;
    const stream = models.streamSimple(
      model,
      { systemPrompt, messages: toPiMessages(messages, model) },
      {
        apiKey,
        temperature: options?.temperature ?? 0.3,
        maxTokens: options?.maxTokens ?? 1024,
        signal: AbortSignal.timeout(120_000),
      },
    );
    for await (const event of stream) {
      if (event.type === 'text_delta' && event.delta) yield event.delta;
      if (event.type === 'error') {
        console.error('[llm-provider stream]', event.error.errorMessage);
        throw new Error('AI 服务调用失败');
      }
    }
  }
}

/**
 * 供应商工厂：由环境变量决定实现。
 *   DZ_LLM_PROVIDER   openai-compatible（默认）| deepseek | openai | anthropic | google | openrouter | moonshot
 *   DZ_LLM_API_KEY    通用密钥（也接受各厂官方变量名）
 *   DZ_LLM_MODEL / DZ_LLM_MODEL_FAST
 *   DZ_LLM_BASE_URL   仅 openai-compatible 需要
 */
export function getProvider(tier: LlmTier = 'pro'): LLMProvider {
  if (readLlmApiKey()) return new PiProvider(tier);
  return new NullProvider();
}
