/* ====================================================
   WeGO — AI Chat Page · ai-chat.js
   ==================================================== */

(function () {
  'use strict';

  const params = new URLSearchParams(window.location.search);
  const isConsult = params.get('consult') === '1';
  if (isConsult) {
    document.body.classList.add('ac-consult-mode');
  }

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
      window.location.href = 'route-detail.html';
    });
  }

  /* 全屏地图 / 收起底栏 — 与路线详情页 rd-fullscreen-btn 行为一致 */
  const app = document.getElementById('app');
  const chatPanel = document.getElementById('ac-chat-panel');
  const fullscreenBtn = document.getElementById('ac-fullscreen-btn');

  const togglePanelFullscreen = (e) => {
    e.stopPropagation();
    const expanded = app.classList.toggle('rd-map-expanded');
    if (chatPanel) chatPanel.classList.toggle('is-collapsed', expanded);
    if (fullscreenBtn) {
      fullscreenBtn.classList.toggle('is-active', expanded);
      fullscreenBtn.setAttribute('aria-label', expanded ? '收起路线介绍' : '展开地图');
    }
    if (expanded) {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  if (fullscreenBtn) {
    fullscreenBtn.addEventListener('click', togglePanelFullscreen);
  }

  /* 结束旅程：长按约 0.8s 后进入收获页（短按无效；问问导游 consult=1 时按钮已隐藏） */
  const endTourBtn = document.getElementById('ac-end-tour-btn');
  const END_HOLD_MS = 800;
  if (endTourBtn && !isConsult) {
    let holdTimer = null;

    function clearEndHold() {
      if (holdTimer) {
        clearTimeout(holdTimer);
        holdTimer = null;
      }
      endTourBtn.classList.remove('is-holding');
    }

    function startEndHold() {
      clearEndHold();
      endTourBtn.classList.add('is-holding');
      holdTimer = window.setTimeout(() => {
        holdTimer = null;
        endTourBtn.classList.remove('is-holding');
        window.location.href = 'trip-end.html';
      }, END_HOLD_MS);
    }

    endTourBtn.addEventListener('touchstart', (e) => {
      e.preventDefault();
      startEndHold();
    }, { passive: false });

    endTourBtn.addEventListener('touchend', clearEndHold);
    endTourBtn.addEventListener('touchcancel', clearEndHold);

    endTourBtn.addEventListener('mousedown', (e) => {
      e.preventDefault();
      startEndHold();
    });
    endTourBtn.addEventListener('mouseup', clearEndHold);
    endTourBtn.addEventListener('mouseleave', clearEndHold);

    endTourBtn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
    });

    endTourBtn.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  // Handle "Change Guide"
  const changeGuideBtn = document.querySelector('.ac-change-guide');
  if (changeGuideBtn) {
    changeGuideBtn.addEventListener('click', (e) => {
      e.preventDefault();
      alert('即将打开导游选择列表，敬请期待！');
    });
  }

  /** 进行中旅程（「开始旅程」进入） */
  const JOURNEY_MESSAGES = [
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

  /** 首次咨询线路（「问问导游」进入）— 约 10 轮对话，含图片 / 景点 / 店铺卡片 */
  const CONSULT_MESSAGES = [
    {
      sender: 'ai',
      text: '你好，我是 AI 导游小go。看你是第一次了解「大栅栏胡同探秘」这条线，我们可以从整体节奏、必打卡点，或者吃喝购物里任选一个方向开始聊。'
    },
    {
      sender: 'user',
      text: '我第一次来，想先知道大概怎么走、全程要多久？'
    },
    {
      sender: 'ai',
      text: '这条线从大栅栏商业街入口出发，串老字号、胡同与名人故居，正常步行大约 4～5 小时，中途可随停随拍。下面是一张街区氛围示意，方便你先有画面感。',
      inserts: [
        {
          type: 'image',
          src: 'https://images.unsplash.com/photo-1547988342-8720cd9fbb04?w=720&q=80',
          alt: '大栅栏胡同风貌',
          caption: '示意图：青瓦灰墙与步行街交织，适合慢逛。'
        }
      ]
    },
    {
      sender: 'user',
      text: '适合带爸妈一起吗？会不会走得很累？'
    },
    {
      sender: 'ai',
      text: '路况以平路为主，休息点也多，适合家庭慢游。必经点里「前门大街」一带很热闹，你可以先扫一眼介绍和门票信息，再决定要不要进收费景点。',
      inserts: [
        {
          type: 'attraction',
          name: '前门大街 · 步行段',
          desc: '连接大栅栏与正阳门，沿街老字号与文创店集中，适合拍照与短时休息。',
          ticketPrice: '步行街免费开放；沿街小展馆/戏票以现场为准。',
          extra: '节假日人流较大，建议错峰或工作日前往。'
        }
      ]
    },
    {
      sender: 'user',
      text: '路上有什么吃的？不想太油腻。'
    },
    {
      sender: 'ai',
      text: '可以试试「轻食 + 老字号」组合：一碗茶点、一碟小菜，负担不大。下面这家店很多首次来访的朋友反馈不错——',
      inserts: [
        {
          type: 'shop',
          name: '门框胡同百年卤煮（大栅栏附近）',
          rec: '卤煮火烧可点小份，搭配凉菜解腻；若不吃内脏，可改选同街包子铺或杏仁茶。'
        }
      ]
    },
    {
      sender: 'user',
      text: '梅兰芳故居要门票吗？大概多少钱？'
    },
    {
      sender: 'ai',
      text: '故居需购票入内，旺季/淡季可能不同，以现场公示为准。可参考下方卡片提前做预算；线上预约能少排队。',
      inserts: [
        {
          type: 'attraction',
          name: '梅兰芳故居',
          desc: '京剧情境与故居展陈结合，参观约 40～60 分钟。',
          ticketPrice: '参考票价：10 元 / 人（请以景区当日公示为准）',
          extra: '建议提前在公众号或官方渠道预约时段。'
        }
      ]
    },
    {
      sender: 'user',
      text: '明白了，我打算下周末来实地走一趟。'
    },
    {
      sender: 'ai',
      text: '太好了！你回到路线页点「开始旅程」，我就会切换到陪走模式，按节点给你讲解。出发前还有想对比的支线或时段，也可以继续问我。'
    }
  ];

  let MOCK_MESSAGES = isConsult ? [...CONSULT_MESSAGES] : [...JOURNEY_MESSAGES];

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

    if (insert.type === 'image') {
      const cap = insert.caption
        ? `<div class="ac-image-caption">${escapeHtml(insert.caption)}</div>`
        : '';
      return `
        <div class="ac-rich-card ac-image-card">
          <div class="ac-image-card-wrap">
            <img src="${escapeHtml(insert.src || '')}" alt="${escapeHtml(insert.alt || '')}" loading="lazy" width="640" height="360" />
          </div>
          ${cap}
        </div>
      `;
    }

    if (insert.type === 'attraction') {
      const extra = insert.extra
        ? `<div class="ac-distance-ticket">${escapeHtml(insert.extra)}</div>`
        : '';
      return `
        <div class="ac-rich-card ac-attraction-card">
          <div class="ac-card-badge">🏛️ 景点</div>
          <div class="ac-card-title">${escapeHtml(insert.name || '景点')}</div>
          <div class="ac-card-desc">${escapeHtml(insert.desc || '')}</div>
          <div class="ac-attraction-ticket">${escapeHtml(insert.ticketPrice || '')}</div>
          ${extra}
        </div>
      `;
    }

    if (insert.type === 'shop') {
      return `
        <div class="ac-rich-card ac-shop-card">
          <div class="ac-card-badge">🍜 美食推荐</div>
          <div class="ac-card-title">${escapeHtml(insert.name || '')}</div>
          <div class="ac-card-desc">${escapeHtml(insert.rec || '')}</div>
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
        addMessage('ai', isConsult ? '收到！还想了解哪一段，随时问我。' : '收到！继续前行吧。');
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
      setTimeout(() => {
        addMessage('ai', isConsult ? '收到！规划上还有疑问也可以继续聊。' : '收到！有问题随时叫我。');
      }, 600);
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
          addMessage('ai', isConsult ? '我已经收到你的消息，需要我补充景点或路线细节吗？' : '我已经收到你的消息！');
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
