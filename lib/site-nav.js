(function () {
  'use strict';

  function init() {
    var nav = document.querySelector('.site-nav');
    if (!nav) return;
    var toggle = nav.querySelector('[data-nav-toggle]');
    var links = nav.querySelector('.nav-links');
    if (!toggle || !links) return;

    function setOpen(open) {
      nav.classList.toggle('nav-open', open);
      toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
    }

    toggle.addEventListener('click', function () {
      setOpen(!nav.classList.contains('nav-open'));
    });

    links.addEventListener('click', function (event) {
      if (event.target.closest('a')) setOpen(false);
    });

    document.addEventListener('keydown', function (event) {
      if (event.key === 'Escape' && nav.classList.contains('nav-open')) {
        setOpen(false);
        toggle.focus();
      }
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
})();
