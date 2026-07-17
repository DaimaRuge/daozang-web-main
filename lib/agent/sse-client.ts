'use client';

/** 解析 Agent SSE 响应为文本与元数据 */
export async function consumeAgentSse(
  response: Response,
  onChunk: (text: string) => void,
): Promise<{ citations?: unknown[]; quotaRemaining?: number; error?: string }> {
  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error((err as { error?: string }).error || `请求失败 (${response.status})`);
  }

  const ct = response.headers.get('content-type') ?? '';
  if (!ct.includes('text/event-stream') || !response.body) {
    const data = await response.json();
    if (data.error) throw new Error(data.error);
    const text =
      data.reply ??
      data.result?.explanation ??
      '';
    if (text) onChunk(text);
    return { citations: data.citations, quotaRemaining: data.quotaRemaining };
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let meta: { citations?: unknown[]; quotaRemaining?: number; error?: string } = {};

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const parts = buffer.split('\n\n');
    buffer = parts.pop() ?? '';

    for (const part of parts) {
      let event = 'message';
      let dataStr = '';
      for (const line of part.split('\n')) {
        if (line.startsWith('event:')) event = line.slice(6).trim();
        if (line.startsWith('data:')) dataStr += line.slice(5).trim();
      }
      if (!dataStr) continue;
      try {
        const data = JSON.parse(dataStr) as Record<string, unknown>;
        if (event === 'chunk' && typeof data.text === 'string') {
          onChunk(data.text);
        } else if (event === 'done') {
          meta = {
            citations: data.citations as unknown[] | undefined,
            quotaRemaining: data.quotaRemaining as number | undefined,
          };
        } else if (event === 'error') {
          meta.error = String(data.error ?? '未知错误');
        }
      } catch {
        // 忽略解析失败块
      }
    }
  }

  if (meta.error) throw new Error(meta.error);
  return meta;
}
