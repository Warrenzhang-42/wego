/* ====================================================
   WeGO — 我的目的地 · 状态 tab（与 trip-end 收获区一致）
   ==================================================== */

(function () {
  'use strict';

  const tabs = document.querySelectorAll('.te-harvest-tab[data-status]');
  const cards = document.querySelectorAll('.md-route-card[data-status]');
  const scrollArea = document.getElementById('md-scroll');
  const harvestSticky = document.querySelector('.md-harvest-sticky');
  const harvestSentinel = document.querySelector('.te-harvest-sticky-sentinel');

  function setActiveTab(activeBtn) {
    tabs.forEach((tab) => {
      const isActive = tab === activeBtn;
      tab.classList.toggle('is-active', isActive);
      tab.setAttribute('aria-selected', isActive ? 'true' : 'false');
    });
  }

  function filterByStatus(status) {
    cards.forEach((card) => {
      const match = card.getAttribute('data-status') === status;
      card.classList.toggle('is-hidden', !match);
    });
  }

  tabs.forEach((tab) => {
    tab.addEventListener('click', () => {
      const status = tab.getAttribute('data-status');
      if (!status) return;
      setActiveTab(tab);
      filterByStatus(status);
    });
  });

  const initial = document.querySelector('.te-harvest-tab.is-active[data-status]');
  if (initial) {
    filterByStatus(initial.getAttribute('data-status'));
  }

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

  cards.forEach((card) => {
    card.addEventListener('click', () => {
      card.style.transition = 'transform 0.12s';
      card.style.transform = 'scale(0.97)';
      setTimeout(() => {
        card.style.transform = '';
        window.location.href = 'route-detail.html';
      }, 150);
    });
    card.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        card.click();
      }
    });
  });
})();
