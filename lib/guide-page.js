(function guidePageModule(global) {
  'use strict';

  const reducedMotion = global.matchMedia
    ? global.matchMedia('(prefers-reduced-motion: reduce)')
    : { matches: false };

  function slugify(value) {
    return value
      .toLowerCase()
      .replace(/&/g, ' and ')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 72);
  }

  function uniqueId(base, usedIds) {
    let id = base || 'guide-section';
    let suffix = 2;
    while (usedIds.has(id)) {
      id = `${base}-${suffix}`;
      suffix += 1;
    }
    usedIds.add(id);
    return id;
  }

  function addReadingTime(article) {
    const words = (article.textContent.match(/\S+/g) || []).length;
    const minutes = Math.max(1, Math.ceil(words / 220));
    const meta = article.querySelector(':scope > .meta');
    if (!meta) return;

    const readingTime = document.createElement('span');
    readingTime.className = 'guide-reading-time';
    readingTime.textContent = `${minutes} min read`;
    meta.append(readingTime);
  }

  function prepareArticleHeader(article) {
    article.id = 'guide-content';
    article.classList.add('guide-article');

    const heading = article.querySelector(':scope > h1');
    const existingKicker = article.querySelector(':scope > .section-kicker');
    if (heading && !existingKicker) {
      const kicker = document.createElement('p');
      kicker.className = 'section-kicker guide-kicker';
      kicker.textContent = 'LootRadar buying guide';
      article.insertBefore(kicker, heading);
    } else if (existingKicker) {
      existingKicker.classList.add('guide-kicker');
    }

    const meta = article.querySelector(':scope > .meta');
    let lede = meta ? meta.nextElementSibling : heading?.nextElementSibling;
    while (lede && lede.tagName !== 'P') lede = lede.nextElementSibling;
    if (lede) lede.classList.add('guide-lede');

    const directParagraphs = Array.from(article.children).filter(
      element => element.tagName === 'P'
    );
    const related = directParagraphs.find(element =>
      element.textContent.trim().toLowerCase().startsWith('related:')
    );
    if (related) related.classList.add('guide-related');
  }

  function prepareHeadings(article) {
    const usedIds = new Set(
      Array.from(document.querySelectorAll('[id]'))
        .map(element => element.id)
        .filter(Boolean)
    );

    return Array.from(article.querySelectorAll('h2')).map(heading => {
      if (!heading.id) {
        heading.id = uniqueId(slugify(heading.textContent), usedIds);
      }
      return heading;
    });
  }

  function buildSidebar(headings) {
    const sidebar = document.createElement('aside');
    sidebar.className = 'guide-sidebar';
    sidebar.setAttribute('aria-label', 'Guide navigation');

    const back = document.createElement('a');
    back.className = 'guide-back';
    back.href = '../blog.html';
    back.innerHTML = '<span aria-hidden="true">←</span> All guides';

    const label = document.createElement('p');
    label.className = 'guide-toc-label';
    label.textContent = 'In this guide';

    const nav = document.createElement('nav');
    nav.className = 'guide-toc';
    nav.setAttribute('aria-label', 'In this guide');

    for (const heading of headings) {
      const link = document.createElement('a');
      link.href = `#${heading.id}`;
      link.textContent = heading.textContent;
      link.dataset.section = heading.id;
      nav.append(link);
    }

    const note = document.createElement('div');
    note.className = 'guide-sidebar-note';
    note.innerHTML = '<strong>LootRadar rule</strong><p>Compare the exact edition and confirm the final price with the retailer.</p>';

    sidebar.append(back, label, nav, note);
    return { sidebar, nav };
  }

  function watchCurrentSection(headings, nav) {
    if (!('IntersectionObserver' in global) || headings.length === 0) return;

    const links = new Map(
      Array.from(nav.querySelectorAll('a[data-section]'))
        .map(link => [link.dataset.section, link])
    );

    const observer = new IntersectionObserver(entries => {
      const visible = entries
        .filter(entry => entry.isIntersecting)
        .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
      if (visible.length === 0) return;

      for (const link of links.values()) link.removeAttribute('aria-current');
      links.get(visible[0].target.id)?.setAttribute('aria-current', 'true');
    }, {
      rootMargin: '-18% 0px -68% 0px',
      threshold: 0
    });

    for (const heading of headings) observer.observe(heading);
  }

  function addProgress(article) {
    const progress = document.createElement('div');
    progress.className = 'guide-progress';
    progress.setAttribute('aria-hidden', 'true');
    progress.innerHTML = '<span></span>';
    document.body.prepend(progress);

    let scheduled = false;
    const update = () => {
      scheduled = false;
      const start = article.offsetTop;
      const distance = Math.max(1, article.offsetHeight - global.innerHeight);
      const amount = Math.min(1, Math.max(0, (global.scrollY - start) / distance));
      progress.style.setProperty('--guide-progress', `${amount * 100}%`);
    };

    const requestUpdate = () => {
      if (scheduled) return;
      scheduled = true;
      global.requestAnimationFrame(update);
    };

    global.addEventListener('scroll', requestUpdate, { passive: true });
    global.addEventListener('resize', requestUpdate);
    update();
  }

  function enableSmoothToc(nav) {
    if (reducedMotion.matches) return;
    nav.addEventListener('click', event => {
      const link = event.target.closest('a[href^="#"]');
      if (!link) return;
      const target = document.querySelector(link.getAttribute('href'));
      if (!target) return;
      event.preventDefault();
      target.scrollIntoView({ behavior: 'smooth', block: 'start' });
      global.history.replaceState(null, '', link.getAttribute('href'));
    });
  }

  function init() {
    const article = document.querySelector('.blog-content');
    if (!article || article.closest('.guide-layout')) return;

    prepareArticleHeader(article);
    addReadingTime(article);
    const headings = prepareHeadings(article);
    const { sidebar, nav } = buildSidebar(headings);

    const layout = document.createElement('main');
    layout.className = 'guide-layout';
    article.before(layout);
    layout.append(sidebar, article);

    enableSmoothToc(nav);
    watchCurrentSection(headings, nav);
    addProgress(article);
  }

  global.LootRadarGuidePage = { init };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
}(window));
