/* ====================================================
   WeGO — AI Chat Page · ai-chat.js
   ==================================================== */

(function () {
  'use strict';

  // Back button functionality
  const backBtn = document.getElementById('ac-back-btn');
  if (backBtn) {
    backBtn.addEventListener('click', () => {
      // Navigate back to the route detail page
      window.location.href = 'route-detail.html';
    });
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
    { sender: 'ai', text: '欢迎开启大栅栏胡同探秘之旅！我是你的专属AI导游小go。我们现在正位于大栅栏商业街的入口。准备好出发了吗？' },
    { sender: 'user', text: '准备好啦！' },
    { sender: 'ai', text: '太棒了！沿着前面的步道往前走，第一站我们将经过百年老字号“同仁堂”。那里的建筑非常有特色，你可以留意一下牌匾。' },
    { sender: 'user', text: '我看到了，牌匾好气派。' },
    { sender: 'ai', text: '没错！同仁堂不仅是药店，更是中国传统建筑艺术的展现。接下来我们向南走，前往梅兰芳故居。' },
    { sender: 'user', text: '距离远吗？' },
    { sender: 'ai', text: '不远，大约步行5分钟就能到达。一路上还能看看两旁的老北京四合院风貌呢。' },
    { sender: 'user', text: '好的，我这就过去。' },
    { sender: 'ai', text: '到了梅兰芳故居，你可以扫一扫门口的标牌，我会为你详细讲述梅先生在这里创作经典剧目的故事。' },
    { sender: 'user', text: '迫不及待想听了！' }
  ];

  const chatContainer = document.getElementById('ac-chat-messages');

  function renderMessages() {
    if (!chatContainer) return;

    chatContainer.innerHTML = MOCK_MESSAGES.map(msg => {
      const isAI = msg.sender === 'ai';
      const avatarName = isAI ? '小go' : '我';
      return `
        <div class="message-row ${msg.sender}">
          <div class="avatar">${avatarName}</div>
          <div class="bubble">${msg.text}</div>
        </div>
      `;
    }).join('');

    // Scroll to the bottom of the chat
    setTimeout(() => {
      chatContainer.scrollTop = chatContainer.scrollHeight;
    }, 50);
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

  // Initialize
  renderMessages();

})();
