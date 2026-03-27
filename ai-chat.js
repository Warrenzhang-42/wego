/* ====================================================
   WeGO — AI Chat Page · ai-chat.js
   ==================================================== */

(function () {
  'use strict';

  const KNOWLEDGE_DETAILS = {
    dzl_gate: {
      title: '大栅栏知识点：门钉与等级礼制',
      body: '明清时期北京街区建筑中，大门上的门钉数量与排布常带有礼制含义。大栅栏一带商号门面在改造中仍保留了部分传统门饰语言，体现“商号身份+街区秩序”的历史痕迹。'
    }
  };

  // Back button functionality
  const backBtn = document.getElementById('ac-back-btn');
  if (backBtn) {
    backBtn.addEventListener('click', () => {
      // Navigate back to the route detail page
      window.location.href = 'route-detail.html';
    });
  }

  // Long press end button
  const endBtn = document.getElementById('ac-end-btn');
  if (endBtn) {
    const HOLD_MS = 1200;
    let holdStartAt = 0;
    let holdRafId = null;
    let holdCompleted = false;

    const resetEndBtn = () => {
      endBtn.style.setProperty('--hold-progress', '0');
      endBtn.classList.remove('is-pressing');
      endBtn.classList.remove('is-complete');
      endBtn.textContent = '结束';
      holdStartAt = 0;
      holdCompleted = false;
      if (holdRafId) {
        cancelAnimationFrame(holdRafId);
        holdRafId = null;
      }
    };

    const completeEndHold = () => {
      holdCompleted = true;
      endBtn.classList.remove('is-pressing');
      endBtn.classList.add('is-complete');
      endBtn.style.setProperty('--hold-progress', '100');
      endBtn.textContent = '已结束';
      setTimeout(() => {
        window.location.href = 'trip-end.html';
      }, 180);
    };

    const tickHoldProgress = () => {
      if (!holdStartAt || holdCompleted) return;
      const elapsed = performance.now() - holdStartAt;
      const progress = Math.min(100, (elapsed / HOLD_MS) * 100);
      endBtn.style.setProperty('--hold-progress', progress.toFixed(1));
      if (progress >= 100) {
        completeEndHold();
        return;
      }
      holdRafId = requestAnimationFrame(tickHoldProgress);
    };

    const startHold = (e) => {
      if (e) e.preventDefault();
      if (holdStartAt || holdCompleted) return;
      holdStartAt = performance.now();
      endBtn.classList.add('is-pressing');
      holdRafId = requestAnimationFrame(tickHoldProgress);
    };

    const cancelHold = () => {
      if (holdCompleted || !holdStartAt) return;
      resetEndBtn();
    };

    endBtn.addEventListener('pointerdown', startHold);
    endBtn.addEventListener('pointerup', cancelHold);
    endBtn.addEventListener('pointerleave', cancelHold);
    endBtn.addEventListener('pointercancel', cancelHold);
    endBtn.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  // Handle "Change Guide"
  const changeGuideBtn = document.querySelector('.ac-change-guide');
  if (changeGuideBtn) {
    changeGuideBtn.addEventListener('click', (e) => {
      e.preventDefault();
      alert('即将打开导游选择列表，敬请期待！');
    });
  }

  // Mock messages for display based on the request
  const MOCK_MESSAGES = [
    {
      sender: 'ai',
      text: '欢迎开启大栅栏胡同探秘之旅！我是你的专属AI导游小go。我们现在正位于大栅栏商业街的入口。准备好出发了吗？',
      inserts: [
        {
          type: 'knowledge',
          id: 'dzl_gate',
          title: '大栅栏知识点',
          summary: '老字号门头与门饰保留了明清商业街的礼制与审美线索。',
          cta: '点击查看详情'
        }
      ]
    },
    { sender: 'user', text: '准备好啦！' },
    { sender: 'ai', text: '太棒了！沿着前面的步道往前走，第一站我们将经过百年老字号“同仁堂”。那里的建筑非常有特色，你可以留意一下牌匾。' },
    { sender: 'user', text: '我看到了，牌匾好气派。' },
    { sender: 'ai', text: '没错！同仁堂不仅是药店，更是中国传统建筑艺术的展现。接下来我们向南走，前往梅兰芳故居。' },
    { sender: 'user', text: '距离远吗？' },
    {
      sender: 'ai',
      text: '不远，大约步行5分钟就能到达。一路上还能看看两旁的老北京四合院风貌呢。',
      inserts: [
        {
          type: 'distance',
          spotName: '梅兰芳故居',
          distanceText: '距你约 180 米，步行约 3 分钟',
          nearHint: '已非常接近，请注意右侧岔路口指引牌。',
          ticketNotice: '需购票入内（建议现场扫码或公众号提前预约）',
          ticketPrice: '参考票价：10元/人'
        }
      ]
    },
    { sender: 'user', text: '好的，我这就过去。' },
    { sender: 'ai', text: '到了梅兰芳故居，你可以扫一扫门口的标牌，我会为你详细讲述梅先生在这里创作经典剧目的故事。' },
    { sender: 'user', text: '迫不及待想听了！' }
  ];

  const chatContainer = document.getElementById('ac-chat-messages');

  function escapeHtml(str) {
    return String(str)
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#39;');
  }

  function renderInsertBlock(insert) {
    if (!insert || !insert.type) return '';
    if (insert.type === 'knowledge') {
      return `
        <button class="ac-rich-card ac-knowledge-card" data-knowledge-id="${escapeHtml(insert.id || '')}">
          <div class="ac-card-badge">📚 知识点</div>
          <div class="ac-card-title">${escapeHtml(insert.title || '知识点')}</div>
          <div class="ac-card-desc">${escapeHtml(insert.summary || '')}</div>
          <div class="ac-card-link">${escapeHtml(insert.cta || '查看详情')}</div>
        </button>
      `;
    }

    if (insert.type === 'distance') {
      return `
        <div class="ac-rich-card ac-distance-card">
          <div class="ac-card-badge">📍 距离提醒</div>
          <div class="ac-card-title">${escapeHtml(insert.spotName || '下一景点')}</div>
          <div class="ac-distance-main">${escapeHtml(insert.distanceText || '')}</div>
          <div class="ac-distance-near">${escapeHtml(insert.nearHint || '')}</div>
          <div class="ac-distance-ticket">${escapeHtml(insert.ticketNotice || '')}</div>
          <div class="ac-distance-price">${escapeHtml(insert.ticketPrice || '')}</div>
        </div>
      `;
    }

    return '';
  }

  function renderMessages() {
    if (!chatContainer) return;

    chatContainer.innerHTML = MOCK_MESSAGES.map(msg => {
      const isAI = msg.sender === 'ai';
      const avatarName = isAI ? '小go' : '我';
      const insertsHtml = isAI && Array.isArray(msg.inserts)
        ? msg.inserts.map(renderInsertBlock).join('')
        : '';
      return `
        <div class="message-row ${msg.sender}">
          <div class="avatar">${avatarName}</div>
          <div class="bubble">
            <div>${escapeHtml(msg.text)}</div>
            ${insertsHtml ? `<div class="ac-rich-blocks">${insertsHtml}</div>` : ''}
          </div>
        </div>
      `;
    }).join('');

    // Scroll to the bottom of the chat
    setTimeout(() => {
      chatContainer.scrollTop = chatContainer.scrollHeight;
    }, 50);
  }

  function openKnowledgeDetail(knowledgeId) {
    const data = KNOWLEDGE_DETAILS[knowledgeId];
    if (!data) return;

    const existed = document.querySelector('.ac-knowledge-modal');
    if (existed) existed.remove();

    const modal = document.createElement('div');
    modal.className = 'ac-knowledge-modal';
    modal.innerHTML = `
      <div class="ac-knowledge-dialog">
        <h3>${escapeHtml(data.title)}</h3>
        <p>${escapeHtml(data.body)}</p>
        <button class="ac-knowledge-close-btn">我知道了</button>
      </div>
    `;

    modal.addEventListener('click', (e) => {
      if (e.target === modal || e.target.closest('.ac-knowledge-close-btn')) {
        modal.remove();
      }
    });

    document.body.appendChild(modal);
  }

  // Input button handlers (just for interactive feel)
  const btnVoice = document.querySelector('.ac-btn-voice');
  const btnKeyboard = document.querySelector('.ac-btn-keyboard');

  if (btnVoice) {
    let isRecording = false;
    btnVoice.addEventListener('touchstart', (e) => {
      e.preventDefault(); // prevent mouse events firing
      btnVoice.textContent = '松开发送';
      btnVoice.style.transform = 'scale(0.96)';
      isRecording = true;
    });
    btnVoice.addEventListener('touchend', (e) => {
      e.preventDefault();
      btnVoice.textContent = '按住说话';
      btnVoice.style.transform = 'scale(1)';
      if (isRecording) {
        addMessage('user', '好的（语音转换文本）。');
        addMessage('ai', '收到！继续前行吧。');
        isRecording = false;
      }
    });
    
    // For mouse interaction on desktop test
    btnVoice.addEventListener('mousedown', () => {
      btnVoice.textContent = '松开发送';
    });
    btnVoice.addEventListener('mouseup', () => {
      btnVoice.textContent = '按住说话';
      addMessage('user', '好的（通过麦克风输入）。');
      setTimeout(() => { addMessage('ai', '收到！有问题随时叫我。'); }, 600);
    });
    btnVoice.addEventListener('mouseleave', () => {
      if (btnVoice.textContent !== '按住说话') {
         btnVoice.textContent = '按住说话';
      }
    });
  }

  if (btnKeyboard) {
    btnKeyboard.addEventListener('click', () => {
      const text = prompt('请输入您要发送的内容：');
      if (text && text.trim()) {
        addMessage('user', text.trim());
        setTimeout(() => {
           addMessage('ai', '我已经收到你的消息！');
        }, 800);
      }
    });
  }

  function addMessage(sender, text) {
    MOCK_MESSAGES.push({ sender, text });
    renderMessages();
  }

  if (chatContainer) {
    chatContainer.addEventListener('click', (e) => {
      const knowledgeBtn = e.target.closest('.ac-knowledge-card');
      if (knowledgeBtn) {
        openKnowledgeDetail(knowledgeBtn.getAttribute('data-knowledge-id'));
      }
    });
  }

  // Initialize
  renderMessages();

})();
