/**
 * WeGO - Chat Client
 * Sprint 4.8/4.9：优先 SSE（POST /chat/stream），失败则回退 JSON /chat。
 */

window.WeGOChatClient = (function () {
  'use strict';

  const STREAM_URL = '/chat/stream';
  const FALLBACK_URL = '/chat';

  function parseSseText(text) {
    let assembled = '';
    const lines = text.split(/\n/);
    for (const line of lines) {
      if (!line.startsWith('data: ')) continue;
      const payload = line.slice(6).trim();
      if (payload === '[DONE]') break;
      try {
        const j = JSON.parse(payload);
        if (j && typeof j.chunk === 'string') assembled += j.chunk;
      } catch {
        /* ignore partial lines */
      }
    }
    return assembled;
  }

  async function readSseResponse(res) {
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buf = '';
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
    }
    return parseSseText(buf);
  }

  class ChatClient {
    constructor(eventBus) {
      this.eventBus = eventBus;
      this.threadId = 'user_thread_' + Date.now();
    }

    /**
     * Send a message to the Agent（SSE → JSON 解析 → EventBus）
     */
    async sendMessage(query, lat = null, lng = null, extra = {}) {
      if (this.eventBus) {
        this.eventBus.emit('chat:sending', { query, ...extra });
      }

      const payload = {
        user_query: query,
        lat,
        lng,
        thread_id: this.threadId,
        ...extra,
      };

      try {
        const res = await fetch(STREAM_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });

        if (res.ok && res.body) {
          const assembled = await readSseResponse(res);
          if (assembled) {
            try {
              const data = JSON.parse(assembled);
              if (this.eventBus) this.eventBus.emit('chat:receive', data);
              return data;
            } catch (parseErr) {
              console.warn('[chat-client] SSE 解析失败，回退 JSON:', parseErr);
            }
          }
        }
      } catch (e) {
        console.warn('[chat-client] SSE 失败，回退 JSON:', e);
      }

      try {
        const res = await fetch(FALLBACK_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });

        if (!res.ok) throw new Error('网络异常');

        const data = await res.json();
        if (this.eventBus) this.eventBus.emit('chat:receive', data);
        return data;
      } catch (e) {
        console.error('Chat error:', e);
        const errorData = {
          role: 'ai',
          content:
            '抱歉，对话服务暂时不可用。请确认 Agent 已启动，且 Nginx 已将 /chat 反代到 Agent（生产环境勿直连 localhost:8000）。',
          inserts: [],
        };
        if (this.eventBus) this.eventBus.emit('chat:receive', errorData);
        return errorData;
      }
    }
  }

  return ChatClient;
})();
