/**
 * WeGO - Chat Client
 * Connects to the local FastAPI Agent or Supabase Edge Function to get responses.
 */

window.WeGOChatClient = (function () {
  'use strict';

  // For Sprint 4 local testing, direct to FastAPI
  const API_URL = 'http://localhost:8000/chat/stream';
  const FALLBACK_URL = 'http://localhost:8000/chat';

  class ChatClient {
    constructor(eventBus) {
      this.eventBus = eventBus;
      this.threadId = 'user_thread_' + Date.now();
    }

    /**
     * Send a message to the Agent.
     */
    async sendMessage(query, lat = null, lng = null, extra = {}) {
      // Announce we started sending
      if (this.eventBus) {
        this.eventBus.emit('chat:sending', { query, ...extra });
      }

      try {
        // We use the regular POST endpoint to fetch the JSON for now.
        // True SSE streaming of JSON from our backend may require parsing fragments.
        // For standard WeGO functionality, we'll fetch the JSON first.
        const res = await fetch(FALLBACK_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            user_query: query,
            lat,
            lng,
            thread_id: this.threadId,
            ...extra
          })
        });

        if (!res.ok) {
          throw new Error('网络异常');
        }

        const data = await res.json();
        
        // Emitting the received message event
        if (this.eventBus) {
          this.eventBus.emit('chat:receive', data);
        }
        return data;
      } catch (e) {
        console.error('Chat error:', e);
        const errorData = {
          role: 'ai',
          content: '抱歉，本地 Agent 服务好像没开启 (需执行 uvicorn server:app --host 0.0.0.0)。',
          inserts: []
        };
        if (this.eventBus) {
          this.eventBus.emit('chat:receive', errorData);
        }
        return errorData;
      }
    }
  }

  return ChatClient;
})();
