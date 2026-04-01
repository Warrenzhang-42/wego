import { MapAdapterFactory } from './lib/map-adapter.js';
import { apiClient }         from './lib/api-client.js';

'use strict';

let mapAdapter = null;
let currentSpots = [];
let userMarker = null;

  const params = new URLSearchParams(window.location.search);
  const isConsult = params.get('consult') === '1';
  if (isConsult) {
    document.body.classList.add('ac-consult-mode');
  }

  const KNOWLEDGE_DETAILS = {
    rabbit_history: {
      title: '兔儿爷的历史脉络',
      cover: 'assets/knowledge-rabbit-history.png',
      coverAlt: '传统兔儿爷泥塑形象',
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
      covers: [
        { src: 'assets/knowledge-ich-1.png', alt: '非遗传承人张忠强在工作室创作兔儿爷' },
        { src: 'assets/knowledge-ich-2.png', alt: '非遗传承人在兔儿爷陈列工作间' }
      ],
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
      cover: 'assets/knowledge-mount-symbolism.png',
      coverAlt: '兔儿爷与坐骑（麒麟等）传统泥塑',
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

  /** REAL AI INTEGRATION */
  const chatClient = window.WeGOChatClient ? new window.WeGOChatClient() : null;

  let MOCK_MESSAGES = [
    { sender: 'ai', text: '嗨！您吉祥啊！我是AI导游小go，今儿想去哪儿玩，或者有什么关于老北京的疑问，随时问我！' }
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
      const detailId = insert.detail_id || '';
      const hasDetail = Boolean(detailId && (window.KNOWLEDGE_DETAILS?.[detailId]));
      
      const title = insert.title || (hasDetail ? window.KNOWLEDGE_DETAILS[detailId].title : '为您推荐');
      const summary = insert.summary || (hasDetail ? window.KNOWLEDGE_DETAILS[detailId].summary : '');
      
      return `
        <button class="ac-rich-card ac-knowledge-card" ${detailId ? `data-knowledge-id="${escapeHtml(detailId)}"` : ''}>
          <div class="ac-card-badge">📚 知识点</div>
          <div class="ac-card-title">${escapeHtml(title)}</div>
          <div class="ac-card-desc">${escapeHtml(summary)}</div>
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

    let coverBlocks = '';
    if (Array.isArray(data.covers) && data.covers.length > 1) {
      const slides = data.covers.map((c) => `
        <div class="ac-kd-carousel-slide">
          <img src="${escapeHtml(c.src || '')}" alt="${escapeHtml(c.alt || data.title || '知识点配图')}" loading="lazy" decoding="async" />
        </div>
      `).join('');
      const dots = data.covers.map((_, i) => `
        <button type="button" class="ac-kd-dot${i === 0 ? ' is-active' : ''}" aria-label="第${i + 1}张" data-ac-kd-dot="${i}"></button>
      `).join('');
      coverBlocks = `
        <div class="ac-kd-carousel" data-ac-kd-carousel>
          <div class="ac-kd-carousel-stage">
            <div class="ac-kd-carousel-viewport" tabindex="0" aria-roledescription="carousel" aria-label="配图轮播">
              ${slides}
            </div>
            <div class="ac-kd-carousel-nav">
              <button type="button" class="ac-kd-carousel-btn ac-kd-carousel-prev" aria-label="上一张">‹</button>
              <button type="button" class="ac-kd-carousel-btn ac-kd-carousel-next" aria-label="下一张">›</button>
            </div>
          </div>
          <div class="ac-kd-carousel-dots" role="tablist" aria-label="选择图片">${dots}</div>
        </div>
      `;
    } else if (Array.isArray(data.covers) && data.covers.length === 1) {
      const c = data.covers[0];
      coverBlocks = `
        <div class="ac-kd-cover-wrap">
          <img src="${escapeHtml(c.src || '')}" alt="${escapeHtml(c.alt || data.title || '知识点配图')}" loading="lazy" />
        </div>
      `;
    } else {
      coverBlocks = `
        <div class="ac-kd-cover-wrap">
          <img src="${escapeHtml(data.cover || '')}" alt="${escapeHtml(data.coverAlt || data.title || '知识点封面')}" loading="lazy" />
        </div>
      `;
    }

    const modal = document.createElement('div');
    modal.className = 'ac-knowledge-modal';
    modal.innerHTML = `
      <div class="ac-knowledge-dialog ac-knowledge-page">
        <div class="ac-kd-header">
          <h3 class="ac-kd-header-title">详情</h3>
          <button class="ac-kd-close-btn" type="button" aria-label="关闭">×</button>
        </div>
        ${coverBlocks}
        <h3>${escapeHtml(data.title)}</h3>
        <p class="ac-kd-intro">${escapeHtml(data.intro || '')}</p>
        <div class="ac-kd-content">${detailSections}</div>
      </div>
    `;

    const closeBtn = modal.querySelector('.ac-kd-close-btn');
    if (closeBtn) {
      closeBtn.addEventListener('click', () => modal.remove());
    }

    const kdCarousel = modal.querySelector('[data-ac-kd-carousel]');
    if (kdCarousel) {
      const viewport = kdCarousel.querySelector('.ac-kd-carousel-viewport');
      const dots = kdCarousel.querySelectorAll('[data-ac-kd-dot]');
      const prevBtn = kdCarousel.querySelector('.ac-kd-carousel-prev');
      const nextBtn = kdCarousel.querySelector('.ac-kd-carousel-next');
      let kdActiveIndex = 0;

      function kdSlideWidth() {
        return viewport ? viewport.clientWidth : 0;
      }

      function kdCurrentIndex() {
        const w = kdSlideWidth();
        if (!w) return 0;
        return Math.min(dots.length - 1, Math.max(0, Math.round(viewport.scrollLeft / w)));
      }

      function kdGoTo(index) {
        const w = kdSlideWidth();
        if (!w || !viewport) return;
        const i = Math.min(dots.length - 1, Math.max(0, index));
        kdActiveIndex = i;
        viewport.scrollTo({ left: i * w, behavior: 'smooth' });
        dots.forEach((d, idx) => d.classList.toggle('is-active', idx === i));
      }

      function kdSyncDots() {
        kdActiveIndex = kdCurrentIndex();
        dots.forEach((d, idx) => d.classList.toggle('is-active', idx === kdActiveIndex));
      }

      let kdScrollEndTimer = null;
      viewport.addEventListener('scroll', () => {
        kdSyncDots();
        window.clearTimeout(kdScrollEndTimer);
        kdScrollEndTimer = window.setTimeout(kdSyncDots, 80);
      }, { passive: true });

      dots.forEach((dot) => {
        dot.addEventListener('click', () => {
          const idx = Number(dot.getAttribute('data-ac-kd-dot'));
          if (!Number.isNaN(idx)) kdGoTo(idx);
        });
      });

      if (prevBtn) {
        prevBtn.addEventListener('click', () => kdGoTo(kdActiveIndex - 1));
      }
      if (nextBtn) {
        nextBtn.addEventListener('click', () => kdGoTo(kdActiveIndex + 1));
      }

      let kdResizeRaf = null;
      window.addEventListener(
        'resize',
        () => {
          window.cancelAnimationFrame(kdResizeRaf);
          kdResizeRaf = window.requestAnimationFrame(() => {
            if (!viewport) return;
            const w = kdSlideWidth();
            if (w) viewport.scrollLeft = kdActiveIndex * w;
          });
        },
        { passive: true }
      );
    }

    document.body.appendChild(modal);
  }

  /** --- Audio Narration Simulation (Sprint 7) --- */
  function playAudioNarration(text) {
    if (!text) return;
    console.log(`[Audio] Starting narration: "${text.substring(0, 30)}..."`);
    
    const ui = document.getElementById('ac-nav-status');
    if (ui) {
      ui.innerHTML = `<span class="audio-wave"></span> 播报中...`;
      ui.classList.add('is-active');
      setTimeout(() => {
        ui.innerHTML = '';
        ui.classList.remove('is-active');
      }, 5000);
    }
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
    btnKeyboard.addEventListener('click', async () => {
      const text = prompt('请输入您要发送的内容：');
      if (text && text.trim()) {
        const msg = text.trim();
        addMessage('user', msg);
        
        if (chatClient) {
          btnKeyboard.disabled = true;
          // Add loading state
          const loadingTempId = MOCK_MESSAGES.length;
          MOCK_MESSAGES.push({ sender: 'ai', text: '...', loading: true });
          renderMessages();
          
          try {
            const aiData = await chatClient.sendMessage(msg);
            // Replace loading state with real message
            MOCK_MESSAGES[loadingTempId] = {
              sender: 'ai',
              text: aiData.content || aiData.text || '',
              inserts: aiData.inserts || []
            };
            if(aiData.polyline && window.mapAdapter) {
               // Sprint 7 mapping feature stub hook
               // window.mapAdapter.drawRoute(aiData.polyline);
            }
          } catch(e) {
            MOCK_MESSAGES[loadingTempId] = { sender: 'ai', text: '连接超时，请重试。' };
          }
          renderMessages();
          btnKeyboard.disabled = false;
        } else {
          setTimeout(() => {
            addMessage('ai', '测试环境 MOCK 回复。');
          }, 800);
        }
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

  /* ---- 地图动态同步 (Sprint 6) ----------------------- */
  async function initMapSync() {
    const mapContainer = document.getElementById('rd-map-container');
    if (!mapContainer) return;

    const config = window.__WEGO_MAP_CONFIG__ || {};
    const provider = config.provider || 'amap';
    const activeRouteId = window.__WEGO_ACTIVE_ROUTE_ID__ || 'e4e20790-a521-4f0e-947b-1172a1e1b7f1';

    try {
      // 1. 获取最新路线数据
      const routeData = await apiClient.getRouteWithSpots(activeRouteId);
      currentSpots = routeData.spots;

      // 2. 初始化地图
      mapAdapter = MapAdapterFactory.create(provider, mapContainer, {
        apiKey:         config.apiKey,
        securityJsCode: config.securityJsCode,
        mapOptions: {
          zoom: 17
        }
      });
      window.mapAdapter = mapAdapter; // 导出到全局供调试
      await mapAdapter.init();

      // 3. 绘制点位与线
      currentSpots.forEach((spot, idx) => {
        mapAdapter.addMarker(spot.lng, spot.lat, {
          index:   idx,
          label:   (idx + 1).toString(),
          title:   spot.name
        });
      });

      const coords = currentSpots.map(s => ({ lat: s.lat, lng: s.lng }));
      await mapAdapter.drawRoute(coords);

      // 4. 初次视野调整
      const lats = currentSpots.map(s => s.lat);
      const lngs = currentSpots.map(s => s.lng);
      mapAdapter.fitBounds({
        sw: { lat: Math.min(...lats) - 0.001, lng: Math.min(...lngs) - 0.001 },
        ne: { lat: Math.max(...lats) + 0.001, lng: Math.max(...lngs) + 0.001 },
      });

      console.log(`[ai-chat] ✅ 地图与路线 (${activeRouteId}) 同步完成`);

    } catch (err) {
      console.error('[ai-chat] 地图同步失败:', err);
      const fallback = document.querySelector('.rd-map-fallback');
      if (fallback) fallback.style.display = 'block';
    }
  }

  initMapSync();

  // --- Geofence Integration (Sprint 5) ---
  if (window.eventBus) {
    // 监听地理位置更新，实现“自动跟随”视野 (Sprint 6.4)
    window.eventBus.on('location:update', (pos) => {
      if (mapAdapter) {
        // 1. 更新或创建用户位置标记
        if (!userMarker) {
          userMarker = mapAdapter.addMarker(pos.lng, pos.lat, {
            label: '我',
            isUser: true // 适配器内部可据此切换样式
          });
        } else {
          userMarker.setPosition([pos.lng, pos.lat]);
        }

        // 2. 自动跟随：将地图中心设置为当前位置
        mapAdapter.setCenter(pos.lng, pos.lat);
      }
    });

    window.eventBus.on('geofence:enter', async (spot) => {
      // Avoid triggering multiple times if already loading or if user is busy with another query
      if (chatClient) {
        console.log(`[ai-chat] 监测到进入景点: ${spot.name}, 正在获取主动导游建议...`);
        
        const loadingTempId = MOCK_MESSAGES.length;
        MOCK_MESSAGES.push({ 
          sender: 'ai', 
          text: `嘿！发现您离【${spot.name}】很近了，我来给您讲讲这里的道道...`, 
          loading: true 
        });
        renderMessages();

        try {
          const aiData = await chatClient.sendMessage(`我在${spot.name}附近，介绍一下这里的精彩之处。`, null, null, {
            trigger_type: 'geofence',
            spot_id: spot.id
          });

          // Replace the "thinking" bubble with real content
          const aiMsg = {
            sender: 'ai',
            text: aiData.content || aiData.text || '',
            inserts: aiData.inserts || []
          };
          MOCK_MESSAGES[loadingTempId] = aiMsg;
          
          // Sprint 7: 开始语音播报
          playAudioNarration(aiMsg.text);
        } catch (e) {
          console.error('[ai-chat] 主动触发失败:', e);
          MOCK_MESSAGES[loadingTempId] = { sender: 'ai', text: `哎哟，到了${spot.name}了，可我这会儿突然断网了。` };
        }
        renderMessages();
      }
    });
  }
