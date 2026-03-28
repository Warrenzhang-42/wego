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
    rabbit_history: {
      title: '兔儿爷的历史脉络',
      cover: 'https://images.unsplash.com/photo-1518709268805-4e9042af9f23?w=1200&q=80',
      coverAlt: '传统手工艺展陈',
      intro: '兔儿爷是北京中秋民俗中最具辨识度的形象之一，兼具祭月、祈福与玩具功能。',
      sections: [
        {
          heading: '起源与民俗语境',
          text: '民间常把兔儿爷与月宫玉兔联系在一起。明代以后，北京地区出现用于祭月的泥塑兔儿爷，体现了中秋节令中的信仰与家庭仪式感。'
        },
        {
          heading: '从祭祀到生活化',
          text: '随着城市生活演变，兔儿爷逐步从祭祀器物转向儿童玩具和节庆摆件，功能由单一礼仪用途扩展为“观赏 + 祝愿 + 记忆北京”的文化符号。'
        },
        {
          heading: '典型造型特征',
          text: '传统兔儿爷常见“披甲胄、背护旗、配坐骑”的威武形象，这种拟人化设计让神话角色更贴近日常审美，也强化了护佑与吉庆寓意。'
        }
      ]
    },
    zhang_master: {
      title: '非遗传承人：张忠强老师',
      cover: 'https://images.unsplash.com/photo-1452860606245-08befc0ff44b?w=1200&q=80',
      coverAlt: '传统泥塑工艺细节',
      intro: '张忠强老师长期深耕兔儿爷制作，将传统技法与当代审美结合，持续推动非遗活化传播。',
      sections: [
        {
          heading: '师承与经验积累',
          text: '其制作训练起步早，长期向老一辈手艺人学习，在塑形、开脸、上色等环节形成稳定且成熟的技艺体系。'
        },
        {
          heading: '创作特点',
          text: '作品强调神态与服饰纹样的精细度，在尊重传统造型语言的同时，适度加入新题材与新配色，让作品更适合当代展示和收藏。'
        },
        {
          heading: '传播价值',
          text: '通过参与展览、讲座与文化活动，张老师让更多年轻群体接触并理解兔儿爷工艺，提升了北京民俗非遗的社会可见度。'
        }
      ]
    },
    mount_symbolism: {
      title: '兔儿爷坐骑寓意图鉴',
      cover: 'https://images.unsplash.com/photo-1558104126-cc538a1b6b29?w=1200&q=80',
      coverAlt: '传统吉祥纹样',
      intro: '不同坐骑对应不同祝愿，反映了民间对平安、吉祥与太平生活的期待。',
      sections: [
        {
          heading: '骑虎：镇煞护平安',
          text: '虎在传统观念中有辟邪与守护功能，骑虎兔儿爷常被视作“驱邪避灾”的象征。'
        },
        {
          heading: '骑象：吉祥如意',
          text: '“象”与“祥”在文化联想上紧密相连，骑象形象常表达顺遂、安稳、万事如意。'
        },
        {
          heading: '骑麒麟：太平与好运',
          text: '麒麟是瑞兽意象，常关联太平、祥瑞与福运，适合节庆、乔迁等祝愿场景。'
        }
      ]
    }
  };

  // Back button functionality
  const backBtn = document.getElementById('ac-back-btn');
  if (backBtn) {
    backBtn.addEventListener('click', () => {
      sessionStorage.setItem('wegoRouteDetailReferrer', 'ai-chat.html');
      window.location.href = 'route-detail.html?from=chat';
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

  /** 基于文档更新后的对话（用户与AI导游交替） */
  const DOC_MESSAGES = [
    { sender: 'ai', text: '嗨！您吉祥啊！今儿逛得还开心不？杨梅竹斜街这地儿可有逛头了，你可别错过您左手边这家兔儿爷小店，庙小乾坤大呀！' },
    { sender: 'user', text: '你好呀~' },
    {
      sender: 'ai',
      text: '嘿，您来对地儿啦！这兔儿爷店可是咱老北京的一个特色。要说可看的，那满屋子各式各样的兔儿爷，造型神态都不一样，有的憨态可掬，有的威风凛凛，特有意思。您瞧那色彩，那工艺，都是老手艺人们精心做出来的。可买的就多了去了，您可以挑个经典造型的兔儿爷带回去当摆件，放家里特好看。还有一些小巧的兔儿爷钥匙链、冰箱贴啥的，送朋友倍儿有面儿。要是您喜欢，还能买那种可以自己上色的兔儿爷白胚，回家自己动手创作，也挺有乐趣。怎么样，有看上的没？',
      inserts: [
        {
          type: 'knowledge',
          title: '逛店速览',
          summary: '可看：造型与彩绘；可买：经典摆件、文创小件、可上色白胚。',
          cta: '点击进入详情页'
        }
      ]
    },
    { sender: 'user', text: '先介绍下兔儿爷的历史呗？' },
    {
      sender: 'ai',
      text: '得嘞！兔儿爷的历史可悠久了，咱老北京有个说法，说兔儿爷是月宫玉兔下凡变的。明朝那时候就有兔儿爷了，一开始它是用来祭月的。后来慢慢就变成了孩子们的玩具，还有祈福的寓意呢。您看这兔儿爷的形象，一般都是身披甲胄，插着护背旗，有的还骑着老虎，可威风了。它融合了咱老北京的民俗文化，现在可是咱北京的一个文化符号啦，外地朋友来都喜欢带个兔儿爷回去作纪念。',
      inserts: [
        {
          type: 'knowledge',
          detailId: 'rabbit_history',
          title: '兔儿爷历史脉络',
          summary: '从祭月器物到城市文化符号，完整梳理其演变。',
          cta: '点击进入详情页'
        }
      ]
    },
    { sender: 'ai', text: '我给你介绍一下店主非遗传承人张忠强老师的背景知识吧？' },
    { sender: 'user', text: '太好了。' },
    {
      sender: 'ai',
      text: '张忠强老师啊，那可是咱兔儿爷制作技艺的非遗传承人。他打小就跟老一辈儿手艺人学习制作兔儿爷，这手艺得有几十年了。他的作品那叫一个精致，在传统工艺的基础上还会有创新。他特别注重细节，从兔儿爷的脸部表情到身上的服饰花纹，都处理得一丝不苟。张老师还经常参加各种文化活动，把咱兔儿爷的文化传播到各地，让更多人了解咱老北京这门传统手艺。',
      inserts: [
        {
          type: 'knowledge',
          detailId: 'zhang_master',
          title: '非遗传承人背景',
          summary: '师承脉络、创作特点与文化传播价值。',
          cta: '点击进入详情页'
        }
      ]
    },
    { sender: 'user', text: '兔儿爷的那几个坐骑不同，都有啥不同的含义？' },
    {
      sender: 'ai',
      text: '嘿，这兔儿爷的坐骑学问可大了！骑老虎的兔儿爷，寓意着驱邪避灾；骑大象的，象征着吉祥如意；还有骑麒麟的兔儿爷，代表着太平吉祥、带来好运。不同的坐骑都寄托着咱老百姓不同的美好愿望，您喜欢哪种坐骑的兔儿爷呀？',
      inserts: [
        {
          type: 'knowledge',
          detailId: 'mount_symbolism',
          title: '坐骑寓意图鉴',
          summary: '虎、象、麒麟三类坐骑的民俗含义对照。',
          cta: '点击进入详情页'
        }
      ]
    },
    { sender: 'user', text: '他们店什么东西买的人最多？' },
    {
      sender: 'ai',
      text: '要说这店里买的人最多的，那肯定是中等大小、经典造型的兔儿爷了。价格适中，摆在家里大小也合适，工艺还特精细。再就是兔儿爷的冰箱贴，小巧玲珑，好多人一买就好几个，送亲戚朋友都不错。对了，那种成套的小型兔儿爷摆件也挺受欢迎，一套几个，摆在一起特好看。',
      inserts: [
        {
          type: 'shop',
          name: '热销榜（门店常见）',
          rec: '① 中号经典兔儿爷 ② 冰箱贴/钥匙链 ③ 成套小型摆件。'
        }
      ]
    }
  ];

  /** 进行中旅程（「开始旅程」进入） */
  const JOURNEY_MESSAGES = [
    ...DOC_MESSAGES
  ];

  /** 首次咨询线路（「问问导游」进入）— 约 10 轮对话，含图片 / 景点 / 店铺卡片 */
  const CONSULT_MESSAGES = [
    ...DOC_MESSAGES
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
      const detailId = insert.detailId || '';
      const hasDetail = Boolean(detailId && KNOWLEDGE_DETAILS[detailId]);
      if (!hasDetail) return '';
      const openAttr = ` data-knowledge-id="${escapeHtml(detailId)}"`;
      return `
        <button class="ac-rich-card ac-knowledge-card"${openAttr}>
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
      const insertsHtml = Array.isArray(msg.inserts)
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

    const detailSections = Array.isArray(data.sections)
      ? data.sections.map(item => `
        <section class="ac-kd-section">
          <h4>${escapeHtml(item.heading || '')}</h4>
          <p>${escapeHtml(item.text || '')}</p>
        </section>
      `).join('')
      : '';

    const modal = document.createElement('div');
    modal.className = 'ac-knowledge-modal';
    modal.innerHTML = `
      <div class="ac-knowledge-dialog ac-knowledge-page">
        <div class="ac-kd-header">
          <h3 class="ac-kd-header-title">详情</h3>
          <button class="ac-kd-close-btn" type="button" aria-label="关闭">×</button>
        </div>
        <div class="ac-kd-cover-wrap">
          <img src="${escapeHtml(data.cover || '')}" alt="${escapeHtml(data.coverAlt || data.title || '知识点封面')}" loading="lazy" />
        </div>
        <h3>${escapeHtml(data.title)}</h3>
        <p class="ac-kd-intro">${escapeHtml(data.intro || '')}</p>
        <div class="ac-kd-content">${detailSections}</div>
      </div>
    `;

    const closeBtn = modal.querySelector('.ac-kd-close-btn');
    if (closeBtn) {
      closeBtn.addEventListener('click', () => modal.remove());
    }

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
