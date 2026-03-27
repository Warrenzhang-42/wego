/* ====================================================
   WeGO — Trip End Page · trip-end.js
   ==================================================== */

(function () {
  'use strict';

  const tabs = document.querySelectorAll('.te-harvest-tab');
  const cards = document.querySelectorAll('.te-reward-card');
  const shareBtn = document.getElementById('te-share-btn');
  const homeBtn = document.getElementById('te-home-btn');
  const scrollArea = document.getElementById('te-scroll-area');
  const harvestSticky = document.querySelector('.te-harvest-sticky');
  const harvestSentinel = document.querySelector('.te-harvest-sticky-sentinel');

  function setActiveTab(activeBtn) {
    tabs.forEach((tab) => {
      const isActive = tab === activeBtn;
      tab.classList.toggle('is-active', isActive);
      tab.setAttribute('aria-selected', isActive ? 'true' : 'false');
    });
  }

  function formatDateTime(date) {
    const mm = String(date.getMonth() + 1).padStart(2, '0');
    const dd = String(date.getDate()).padStart(2, '0');
    const hh = String(date.getHours()).padStart(2, '0');
    const min = String(date.getMinutes()).padStart(2, '0');
    return `${mm}-${dd} ${hh}:${min}`;
  }

  function injectCardTimes() {
    const baseDate = new Date();
    cards.forEach((card, index) => {
      const head = card.querySelector('.te-reward-card-head');
      if (!head || head.querySelector('.te-reward-time')) return;
      const date = new Date(baseDate.getTime() - index * 16 * 60 * 1000);
      const timeEl = document.createElement('span');
      timeEl.className = 'te-reward-time';
      timeEl.textContent = formatDateTime(date);
      head.appendChild(timeEl);
    });
  }

  function filterCards(type) {
    cards.forEach((card) => {
      const cardType = card.getAttribute('data-type');
      const shouldShow = type === 'all' || cardType === type;
      card.classList.toggle('is-hidden', !shouldShow);
    });
  }

  tabs.forEach((tab) => {
    tab.addEventListener('click', () => {
      const type = tab.getAttribute('data-type');
      if (!type) return;
      setActiveTab(tab);
      filterCards(type);
    });
  });

  injectCardTimes();
  filterCards('all');

  if (scrollArea && harvestSticky && harvestSentinel) {
    const stickyObserver = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (!entry) return;
        harvestSticky.classList.toggle('is-stuck', !entry.isIntersecting);
      },
      { root: scrollArea, threshold: 0, rootMargin: '0px' }
    );
    stickyObserver.observe(harvestSentinel);
  }

  if (shareBtn) {
    shareBtn.addEventListener('click', () => {
      shareBtn.style.transform = 'scale(0.96)';
      setTimeout(() => {
        shareBtn.style.transform = '';
      }, 150);
    });
  }

  if (homeBtn) {
    homeBtn.addEventListener('click', () => {
      window.location.href = 'index.html';
    });
  }
})();
