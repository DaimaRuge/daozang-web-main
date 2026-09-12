/**
 * pi-agent 运行时：用 @earendil-works/pi-ai 做供应商无关的模型解析。
 *
 * 问道与审核都走这里，切换 LLM 只改环境变量，不改业务代码。
 * 不引入 providers/all，按 DZ_LLM_PROVIDER 动态加载单个供应商，避免把所有 SDK 打进 Serverless 包。
 */

import type { Api, Model, Models, MutableModels } from '@earendil-works/pi-ai';

export type LlmTier = 'fast' | 'pro';

const DEFAULT_BASE_URL = 'https://api.deepseek.com';
const DEFAULT_MODEL_PRO = 'deepseek-v4-pro';
const DEFAULT_MODEL_FAST = 'deepseek-v4-flash';

export function readLlmApiKey(): string | undefined {
  return (
    process.env.DZ_LLM_API_KEY ||
    process.env.DEEPSEEK_API_KEY ||
    process.env.OPENAI_API_KEY ||
    process.env.ANTHROPIC_API_KEY ||
    process.env.GEMINI_API_KEY ||
    process.env.OPENROUTER_API_KEY ||
    process.env.MOONSHOT_API_KEY ||
    undefined
  );
}

export function llmProviderId(): string {
  return (process.env.DZ_LLM_PROVIDER || 'openai-compatible').trim().toLowerCase();
}

export function llmModelId(tier: LlmTier): string {
  const pro = process.env.DZ_LLM_MODEL || DEFAULT_MODEL_PRO;
  const fast = process.env.DZ_LLM_MODEL_FAST || DEFAULT_MODEL_FAST;
  return tier === 'fast' ? fast : pro;
}

function llmBaseUrl(): string {
  return (process.env.DZ_LLM_BASE_URL || DEFAULT_BASE_URL).replace(/\/+$/, '');
}

export interface PiRuntime {
  models: Models;
  model: Model<Api>;
  apiKey: string;
  providerId: string;
  modelId: string;
}

let cached: { key: string; runtime: PiRuntime } | null = null;

function cacheKey(tier: LlmTier): string {
  return [llmProviderId(), llmBaseUrl(), llmModelId('pro'), llmModelId('fast'), tier].join('|');
}

async function registerBuiltin(
  models: MutableModels,
  providerId: string,
): Promise<void> {
  switch (providerId) {
    case 'openai': {
      const { openaiProvider } = await import('@earendil-works/pi-ai/providers/openai');
      models.setProvider(openaiProvider());
      return;
    }
    case 'anthropic': {
      const { anthropicProvider } = await import('@earendil-works/pi-ai/providers/anthropic');
      models.setProvider(anthropicProvider());
      return;
    }
    case 'google': {
      const { googleProvider } = await import('@earendil-works/pi-ai/providers/google');
      models.setProvider(googleProvider());
      return;
    }
    case 'deepseek': {
      const { deepseekProvider } = await import('@earendil-works/pi-ai/providers/deepseek');
      models.setProvider(deepseekProvider());
      return;
    }
    case 'openrouter': {
      const { openrouterProvider } = await import('@earendil-works/pi-ai/providers/openrouter');
      models.setProvider(openrouterProvider());
      return;
    }
    case 'moonshot':
    case 'moonshotai': {
      const { moonshotaiProvider } = await import('@earendil-works/pi-ai/providers/moonshotai');
      models.setProvider(moonshotaiProvider());
      return;
    }
    default:
      throw new Error(`未知的 DZ_LLM_PROVIDER：${providerId}`);
  }
}

async function registerCompatible(models: MutableModels, modelIds: string[]): Promise<void> {
  const { createProvider, envApiKeyAuth } = await import('@earendil-works/pi-ai');
  const { openAICompletionsApi } = await import('@earendil-works/pi-ai/api/openai-completions.lazy');
  const baseUrl = llmBaseUrl();
  const unique = [...new Set(modelIds)];
  models.setProvider(
    createProvider({
      id: 'openai-compatible',
      name: 'OpenAI Compatible',
      baseUrl,
      auth: {
        apiKey: envApiKeyAuth('LLM API key', ['DZ_LLM_API_KEY', 'DEEPSEEK_API_KEY', 'OPENAI_API_KEY']),
      },
      models: unique.map(id => ({
        id,
        name: id,
        api: 'openai-completions' as const,
        provider: 'openai-compatible',
        baseUrl,
        reasoning: false,
        input: ['text' as const],
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
        contextWindow: 128_000,
        maxTokens: 8192,
      })),
      api: openAICompletionsApi(),
    }),
  );
}

/**
 * 解析当前环境对应的 pi Models + 具体模型。
 * 结果按环境变量缓存：同一进程里改 env 后需重启才生效，与 Serverless 实例生命周期一致。
 */
export async function resolvePiRuntime(tier: LlmTier): Promise<PiRuntime> {
  const apiKey = readLlmApiKey();
  if (!apiKey) throw new Error('LLM API key 未配置');

  const key = cacheKey(tier);
  if (cached?.key === key) return cached.runtime;

  const { createModels } = await import('@earendil-works/pi-ai');
  const models = createModels();
  const providerId = llmProviderId();
  const modelId = llmModelId(tier);
  const lookupId =
    providerId === 'compatible' || providerId === 'openai-compatible'
      ? 'openai-compatible'
      : providerId === 'moonshot'
        ? 'moonshotai'
        : providerId;

  if (lookupId === 'openai-compatible') {
    await registerCompatible(models, [llmModelId('pro'), llmModelId('fast')]);
  } else {
    await registerBuiltin(models, providerId);
  }

  const model = models.getModel(lookupId, modelId);
  if (!model) {
    throw new Error(`模型 ${modelId} 不在供应商 ${providerId} 的目录中，请核对 DZ_LLM_MODEL / DZ_LLM_PROVIDER`);
  }

  const runtime: PiRuntime = {
    models,
    model,
    apiKey,
    providerId: model.provider,
    modelId: model.id,
  };
  cached = { key, runtime };
  return runtime;
}
