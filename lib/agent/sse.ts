/**
 * SSE 辅助：Agent 流式响应编码。
 */

export function sseEvent(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

export function sseStream(
  generator: AsyncGenerator<{ event: string; data: unknown }, void, unknown>,
): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream({
    async start(controller) {
      try {
        for await (const chunk of generator) {
          controller.enqueue(encoder.encode(sseEvent(chunk.event, chunk.data)));
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : '流式响应异常';
        controller.enqueue(encoder.encode(sseEvent('error', { error: msg })));
      } finally {
        controller.close();
      }
    },
  });
}

export function sseResponse(stream: ReadableStream<Uint8Array>): Response {
  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
    },
  });
}
