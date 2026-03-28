(function () {
  const track = document.getElementById('personality-track');
  const dots = document.querySelectorAll('#personality-dots .personality-dot');
  const slides = document.querySelectorAll('.personality-slide');
  const back = document.getElementById('personality-back');
  const pickMe = document.getElementById('personality-pick-me');

  let current = 0;
  let startX = 0;
  let dragging = false;

  function syncPickMeWithSlide() {
    if (!pickMe || !slides.length) return;
    const slide = slides[current];
    const id = slide && slide.dataset.id;
    if (id) pickMe.dataset.personality = id;
  }

  function goTo(idx) {
    const n = slides.length;
    current = ((idx % n) + n) % n;
    track.style.transform = `translateX(-${current * 100}%)`;

    dots.forEach((d, i) => {
      d.classList.toggle('active', i === current);
      d.setAttribute('aria-selected', i === current ? 'true' : 'false');
    });
    syncPickMeWithSlide();
  }

  dots.forEach((d) => {
    d.addEventListener('click', () => goTo(parseInt(d.dataset.idx, 10)));
  });

  track.addEventListener(
    'touchstart',
    (e) => {
      startX = e.touches[0].clientX;
      dragging = true;
    },
    { passive: true }
  );

  track.addEventListener(
    'touchend',
    (e) => {
      if (!dragging) return;
      const diff = startX - e.changedTouches[0].clientX;
      if (Math.abs(diff) > 40) {
        goTo(diff > 0 ? current + 1 : current - 1);
      }
      dragging = false;
    },
    { passive: true }
  );

  track.addEventListener('mousedown', (e) => {
    startX = e.clientX;
    dragging = true;
  });

  track.addEventListener('mouseup', (e) => {
    if (!dragging) return;
    const diff = startX - e.clientX;
    if (Math.abs(diff) > 40) {
      goTo(diff > 0 ? current + 1 : current - 1);
    }
    dragging = false;
  });

  function markPersonalityOnboardingDone() {
    try {
      sessionStorage.setItem('wegoPersonalityOnboardingDone', '1');
      localStorage.setItem('wegoPersonalityOnboardingDone', '1');
    } catch (e) {
      /* ignore */
    }
  }

  document.querySelectorAll('.personality-cta').forEach((btn) => {
    btn.addEventListener('click', () => {
      const id = btn.dataset.chat || 'local';
      markPersonalityOnboardingDone();
      window.location.href = `ai-chat.html?personality=${encodeURIComponent(id)}`;
    });
  });

  function exitPersonalityPage() {
    if (window.history.length > 1) {
      window.history.back();
    } else {
      window.location.href = 'index.html';
    }
  }

  if (back) {
    back.addEventListener('click', exitPersonalityPage);
  }

  document.querySelectorAll('.personality-pick-me').forEach((btn) => {
    btn.addEventListener('click', () => {
      const id = btn.dataset.personality;
      if (id) {
        try {
          sessionStorage.setItem('wegoPersonality', id);
        } catch (e) {
          /* ignore */
        }
      }
      markPersonalityOnboardingDone();
      exitPersonalityPage();
    });
  });

  const params = new URLSearchParams(window.location.search);
  const initial = params.get('p');
  const map = { scholar: 0, local: 1, curator: 2 };
  if (initial && map[initial] !== undefined) {
    goTo(map[initial]);
  }
})();
