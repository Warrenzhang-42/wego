(function () {
  'use strict';

  const link = document.getElementById('mh-back-link');
  if (!link) return;

  try {
    const q = sessionStorage.getItem('wego_chat_return_query');
    if (q != null && q !== '') {
      link.setAttribute('href', 'ai-chat.html' + q);
    }
  } catch (e) {
    /* ignore */
  }
})();
