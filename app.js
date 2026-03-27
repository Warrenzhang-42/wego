/* ====================================================
   WeGO · app.js — Mobile Homepage Interactions
   ==================================================== */

// ---- Carousel ----------------------------------------
(function initCarousel() {
  const track   = document.getElementById('carousel-track');
  const dots    = document.querySelectorAll('.carousel-dots .dot');
  const slides  = document.querySelectorAll('.carousel-slide');
  let current   = 0;
  let autoTimer = null;
  let startX    = 0;
  let isDragging = false;

  function goTo(idx) {
    current = (idx + slides.length) % slides.length;
    track.style.transform = `translateX(-${current * 100}%)`;
    dots.forEach((d, i) => d.classList.toggle('active', i === current));
    // Trigger subtle zoom on active slide
    slides.forEach((s, i) => s.classList.toggle('active', i === current));
  }

  function next() { goTo(current + 1); }

  function startAuto() {
    clearInterval(autoTimer);
    autoTimer = setInterval(next, 4000);
  }

  // Dot click
  dots.forEach(d => {
    d.addEventListener('click', () => {
      goTo(parseInt(d.dataset.idx, 10));
      startAuto();
    });
  });

  // Swipe support
  track.addEventListener('touchstart', e => {
    startX = e.touches[0].clientX;
    isDragging = true;
    clearInterval(autoTimer);
  }, { passive: true });

  track.addEventListener('touchend', e => {
    if (!isDragging) return;
    const diff = startX - e.changedTouches[0].clientX;
    if (Math.abs(diff) > 40) diff > 0 ? next() : goTo(current - 1);
    isDragging = false;
    startAuto();
  }, { passive: true });

  // Mouse drag (desktop preview)
  track.addEventListener('mousedown', e => { startX = e.clientX; isDragging = true; clearInterval(autoTimer); });
  track.addEventListener('mouseup',   e => {
    if (!isDragging) return;
    const diff = startX - e.clientX;
    if (Math.abs(diff) > 40) diff > 0 ? next() : goTo(current - 1);
    isDragging = false;
    startAuto();
  });

  // CTA click
  document.querySelectorAll('.slide-cta-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      window.location.href = 'route-detail.html';
    });
  });

  goTo(0);
  startAuto();
})();


// ---- Category Chips ----------------------------------
(function initChips() {
  const chips = document.querySelectorAll('.chip');
  chips.forEach(chip => {
    chip.addEventListener('click', () => {
      chips.forEach(c => { c.classList.remove('active'); c.setAttribute('aria-selected', 'false'); });
      chip.classList.add('active');
      chip.setAttribute('aria-selected', 'true');

      // Toggle tab content
      const tabId = chip.dataset.tab;
      document.querySelectorAll('.route-group').forEach(group => {
        group.style.display = 'none';
      });
      const targetGroup = document.getElementById('tab-content-' + tabId);
      if (targetGroup) {
        targetGroup.style.display = 'block';
      }

      // Micro-animation feedback
      chip.style.transform = 'scale(0.93)';
      setTimeout(() => { chip.style.transform = ''; }, 160);
    });
  });
})();


// ---- Bottom Nav--------------------------------------
(function initBottomNav() {
  const items = document.querySelectorAll('.bottom-nav-item');
  const navContainer = document.getElementById('bottom-nav');
  items.forEach(item => {
    item.addEventListener('click', () => {
      const tabId = item.dataset.nav;
      if (tabId === 'destinations') {
        window.location.href = 'my-destinations.html';
        return;
      }
      items.forEach(i => i.classList.remove('active'));
      item.classList.add('active');
      navContainer.classList.remove('tab-destinations');
      navContainer.classList.add('tab-explore');
    });
  });
})();


// ---- Route Cards: ripple tap effect & navigation ----
(function initRouteCards() {
  const cards = document.querySelectorAll('.route-card');
  cards.forEach(card => {
    card.addEventListener('click', () => {
      card.style.transition = 'transform 0.12s';
      card.style.transform  = 'scale(0.97)';
      
      // Navigate after a short delay to let the ripple effect be seen
      setTimeout(() => {
        card.style.transform = '';
        window.location.href = 'route-detail.html';
      }, 150);
    });
    card.addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === ' ') card.click();
    });
  });
})();





// ---- Search bar click --------------------------------
document.getElementById('search-input').addEventListener('focus', () => {
  document.getElementById('search-bar').style.borderColor = 'var(--clr-primary)';
});
document.getElementById('search-input').addEventListener('blur', () => {
  document.getElementById('search-bar').style.borderColor = '';
});


// ---- Toast utility -----------------------------------
function showToast(msg) {
  const existing = document.querySelector('.wego-toast');
  if (existing) existing.remove();

  const toast = document.createElement('div');
  toast.className = 'wego-toast';
  toast.textContent = msg;
  Object.assign(toast.style, {
    position:     'fixed',
    bottom:       '90px',
    left:         '50%',
    transform:    'translateX(-50%) translateY(20px)',
    background:   'rgba(26,35,50,0.92)',
    color:        'white',
    padding:      '10px 20px',
    borderRadius: '24px',
    fontSize:     '13px',
    fontWeight:   '700',
    fontFamily:   "'Nunito', sans-serif",
    whiteSpace:   'nowrap',
    zIndex:       '9999',
    boxShadow:    '0 4px 20px rgba(0,0,0,0.25)',
    transition:   'all 0.3s cubic-bezier(0.34,1.56,0.64,1)',
    opacity:      '0',
    maxWidth:     '360px',
    textAlign:    'center',
  });
  document.body.appendChild(toast);
  requestAnimationFrame(() => {
    toast.style.opacity   = '1';
    toast.style.transform = 'translateX(-50%) translateY(0)';
  });
  setTimeout(() => {
    toast.style.opacity   = '0';
    toast.style.transform = 'translateX(-50%) translateY(10px)';
    setTimeout(() => toast.remove(), 350);
  }, 2800);
}


