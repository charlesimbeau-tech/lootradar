(function () {
  'use strict';

  const API = 'https://www.cheapshark.com/api/1.0';
  const PAGE_SIZE = 24;
  const WATCH_KEY = 'lr_watchlist_v1';
  const cheapShark = window.LootRadarCheapShark.createCheapSharkClient({
    baseUrl: API,
    maxRetries: 2,
    baseDelayMs: 750
  });
  const { calculateDealScore } = window.LootRadarScoring;
  const { DEFAULT_FILTERS, normalizeFilters, filterDeals, sortDeals, readFiltersFromUrl, filtersToSearchParams } = window.LootRadarFilters;
  const { buildDealDataset } = window.LootRadarDataset;
  const analytics = window.LootRadarAnalytics;
  const config = window.LootRadarEditorialConfig;
  let account = null;

  try {
    const supabaseClient = window.supabase && window.LR_SUPABASE_URL && window.LR_SUPABASE_ANON_KEY
      ? window.supabase.createClient(window.LR_SUPABASE_URL, window.LR_SUPABASE_ANON_KEY)
      : null;
    account = supabaseClient && window.LootRadarAccountClient
      ? window.LootRadarAccountClient.createAccountClient({
        client: supabaseClient,
        storage: window.localStorage
      })
      : null;
  } catch (error) {
    console.warn('Account sync is unavailable:', error);
    account = null;
  }

  const state = {
    allDeals: [],
    visibleDeals: [],
    stores: {},
    filters: readFiltersFromUrl(window.location.href),
    shown: PAGE_SIZE,
    selectedDeal: null,
    watchlist: loadWatchlist(),
    lastFocused: null,
    detailController: null
  };

  const collections = {
    best: { label: 'Best right now', title: 'The best of what is live right now', summary: 'Games people actually rate, at prices that actually moved.' },
    fresh: { label: 'New arrivals', title: 'Out recently, already loved', summary: 'Released in the last year, already discounted, already carrying real reviews.' },
    under10: { label: 'Under $10', title: 'Great games under $10', summary: 'Single-digit prices with thousands of happy players behind them.' },
    deep: { label: 'Deep discounts', title: 'Deep discounts worth a look', summary: 'Enormous price cuts that still survived the quality checks.' },
    indie: { label: 'Indie standouts', title: 'Indie deals worth discovering', summary: 'Small studios, big ideas, prices that make the risk basically free.' },
    multiplayer: { label: 'Co-op & multiplayer', title: 'Games worth dragging a friend into', summary: 'Well-reviewed games built for a couch, a party, or a squad.' },
    hidden: { label: 'Hidden gems', title: 'Adored by everyone who found them', summary: 'Smaller crowds, unusually happy ones, and enough reviews to trust.' },
    all: { label: 'All deals', title: 'Everything that qualifies', summary: 'Every listing that clears the filters you have set.' }
  };

  const $ = selector => document.querySelector(selector);
  const $$ = selector => [...document.querySelectorAll(selector)];

  function escapeHTML(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function safeDealID(value) {
    const dealID = String(value || '');
    return /^[A-Za-z0-9%._~-]+$/.test(dealID) ? dealID : '';
  }

  function money(value) {
    const number = Number(value || 0);
    return number === 0 ? 'Free' : new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(number);
  }

  function compact(value) {
    return new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 }).format(Number(value || 0));
  }

  function safeImage(value) {
    const url = String(value || '');
    return /^https?:\/\//i.test(url) ? url.replace(/"/g, '&quot;') : '';
  }

  function loadWatchlist() {
    try {
      return JSON.parse(localStorage.getItem(WATCH_KEY) || '{}') || {};
    } catch (_) {
      return {};
    }
  }

  function saveWatchlist() {
    localStorage.setItem(WATCH_KEY, JSON.stringify(state.watchlist));
    updateWatchCount();
    if (account) account.syncWatchlist(state.watchlist);
  }

  function loadRecommendationProfile() {
    try {
      return JSON.parse(localStorage.getItem('lr_rec_profile_v3') || '{}') || {};
    } catch (_) {
      return {};
    }
  }

  function accountStatusText(status) {
    if (status === 'syncing') return 'Syncing…';
    if (status === 'synced') return 'Synced';
    if (status === 'delayed') return 'Sync delayed';
    return 'Saved on this device';
  }

  function renderAccountStatus(snapshot) {
    const status = $('#accountSyncStatus');
    const link = $('#accountSyncLink');
    if (status) status.textContent = accountStatusText(snapshot?.status);
    if (!link) return;
    if (snapshot?.user) {
      link.href = 'account.html';
      link.textContent = 'Account';
    } else {
      const next = `${window.location.pathname || '/'}${window.location.search || ''}`;
      link.href = `login.html?next=${encodeURIComponent(next)}`;
      link.textContent = 'Sign in to sync';
    }
  }

  function initAccountSync() {
    if (!account) {
      renderAccountStatus({ status: 'guest', user: null });
      return;
    }

    account.subscribe(renderAccountStatus);
    account.loadAndMerge(loadRecommendationProfile(), state.watchlist).then(result => {
      if (!result || !result.watchlist || result.cancelled) return;
      state.watchlist = result.watchlist;
      localStorage.setItem(WATCH_KEY, JSON.stringify(state.watchlist));
      updateWatchCount();
      if (state.allDeals.length) render();
      if ($('#watchDialog')?.open) renderWatchlist();
    }).catch(() => {
      renderAccountStatus({ status: 'delayed', user: account.state().user });
    });
  }

  function showToast(message) {
    const toast = $('#toast');
    toast.textContent = message;
    toast.classList.add('show');
    clearTimeout(showToast.timer);
    showToast.timer = setTimeout(() => toast.classList.remove('show'), 2400);
  }

  function track(eventName, properties) {
    analytics?.track(eventName, properties);
  }

  async function fetchJSON(url, optional = false) {
    try {
      const response = await fetch(url, { headers: { Accept: 'application/json' } });
      if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
      return response.json();
    } catch (error) {
      if (optional) return null;
      throw error;
    }
  }

  async function loadDeals() {
    $('#loading').hidden = false;
    $('#errorState').hidden = true;
    $('#deals').innerHTML = '';
    try {
      const bucket = Math.floor(Date.now() / 3600000);
      const [base, enriched] = await Promise.all([
        fetchJSON(`deals.json?v=${bucket}`),
        fetchJSON(`enriched-deals.json?v=${bucket}`, true)
      ]);
      state.stores = base.stores || enriched?.stores || {};
      state.allDeals = buildDealDataset(base, enriched, config);
      populateFilters();
      renderCollections();
      syncFormFromState();
      render();
      renderHero();
      const updated = new Date(base.updatedAt);
      $('#lastUpdated').textContent = Number.isNaN(updated.getTime())
        ? 'Saved price snapshot'
        : `Prices checked ${updated.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} at ${updated.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}`;
      $('#statQualified').textContent = compact(state.allDeals.filter(deal => deal.eligible).length);
      $('#statStores').textContent = Object.keys(state.stores).length;
    } catch (error) {
      console.error('LootRadar failed to load deal data:', error);
      $('#errorState').hidden = false;
    } finally {
      $('#loading').hidden = true;
    }
  }

  function populateFilters() {
    const storeSelect = $('#storeSelect');
    storeSelect.innerHTML = '<option value="all">All stores</option>' + Object.entries(state.stores)
      .sort((a, b) => a[1].name.localeCompare(b[1].name))
      .map(([id, store]) => `<option value="${escapeHTML(id)}">${escapeHTML(store.name)}</option>`).join('');

    const genres = new Set();
    state.allDeals.forEach(deal => deal.genres.forEach(genre => genres.add(genre)));
    $('#genreSelect').innerHTML = '<option value="all">All genres</option>' + [...genres]
      .sort((a, b) => a.localeCompare(b))
      .map(genre => `<option value="${escapeHTML(genre)}">${escapeHTML(genre)}</option>`).join('');
  }

  function renderCollections() {
    $('#collectionTabs').innerHTML = Object.entries(collections).map(([id, item]) => {
      const count = filterDeals(state.allDeals, { ...state.filters, q: '', collection: id }).length;
      return `<button type="button" role="tab" data-collection="${id}" aria-selected="${state.filters.collection === id}">
        ${escapeHTML(item.label)} <span>${count}</span>
      </button>`;
    }).join('');
  }

  function syncFormFromState() {
    const filters = state.filters;
    $('#searchInput').value = filters.q;
    $('#sortSelect').value = filters.sort;
    $('#storeSelect').value = filters.store;
    $('#genreSelect').value = filters.genre;
    $('#priceSelect').value = String(filters.maxPrice);
    $('#discountSelect').value = String(filters.minDiscount);
    $('#ratingSelect').value = String(filters.minRating);
    $('#reviewsSelect').value = String(filters.minReviews);
    $('#relaxQuality').checked = filters.quality === 'all';
    $('#includeEarlyAccess').checked = filters.includeEarlyAccess;
    $('#includeBundles').checked = filters.includeBundles;
    $('#includeDlc').checked = filters.includeDlc;
    $$('[data-collection]').forEach(button => button.setAttribute('aria-selected', String(button.dataset.collection === filters.collection)));
    updateActiveFilterCount();
  }

  function readFormIntoState() {
    const previousQuery = state.filters.q;
    state.filters = normalizeFilters({
      ...state.filters,
      q: $('#searchInput').value.trim(),
      sort: $('#sortSelect').value,
      store: $('#storeSelect').value,
      genre: $('#genreSelect').value,
      maxPrice: Number($('#priceSelect').value),
      minDiscount: Number($('#discountSelect').value),
      minRating: Number($('#ratingSelect').value),
      minReviews: Number($('#reviewsSelect').value),
      quality: $('#relaxQuality').checked ? 'all' : 'recommended',
      includeEarlyAccess: $('#includeEarlyAccess').checked,
      includeBundles: $('#includeBundles').checked,
      includeDlc: $('#includeDlc').checked
    });
    state.shown = PAGE_SIZE;
    syncUrl();
    updateActiveFilterCount();
    render();
    if (state.filters.q && state.filters.q !== previousQuery) {
      track('search_used', {
        surface: 'homepage_search',
        resultBucket: analytics?.resultBucket(state.visibleDeals.length)
      });
    }
  }

  function syncUrl() {
    const params = filtersToSearchParams(state.filters);
    const url = `${window.location.pathname}${params.toString() ? `?${params}` : ''}${window.location.hash}`;
    history.replaceState(null, '', url);
  }

  function updateActiveFilterCount() {
    const filters = state.filters;
    let count = 0;
    if (filters.store !== DEFAULT_FILTERS.store) count++;
    if (filters.genre !== DEFAULT_FILTERS.genre) count++;
    if (filters.maxPrice !== DEFAULT_FILTERS.maxPrice) count++;
    if (filters.minDiscount !== DEFAULT_FILTERS.minDiscount) count++;
    if (filters.minRating !== DEFAULT_FILTERS.minRating) count++;
    if (filters.minReviews !== DEFAULT_FILTERS.minReviews) count++;
    if (filters.quality !== DEFAULT_FILTERS.quality) count++;
    if (filters.includeDlc || filters.includeEarlyAccess || filters.includeBundles) count++;
    $('#activeFilterCount').textContent = count;
    $('#filterToggle').classList.toggle('has-filters', count > 0);
  }

  function scoreTone(score) {
    if (score >= 80) return 'elite';
    if (score >= 65) return 'strong';
    if (score >= 50) return 'fair';
    return 'weak';
  }

  function scoreLabel(score) {
    if (score >= 85) return 'Excellent value';
    if (score >= 75) return 'Great deal';
    if (score >= 65) return 'Strong value';
    if (score >= 55) return 'Worth a look';
    return 'Low confidence';
  }

  function reviewMarkup(deal) {
    if (!deal.userRating) return '<span class="muted">Limited review data</span>';
    return `<span class="review-score">${deal.userRating}% positive</span><span>${compact(deal.reviewCount)} reviews</span>`;
  }

  function cardMarkup(deal, index) {
    const watched = Boolean(state.watchlist[deal.key]);
    const image = safeImage(deal.image);
    const priceLabel = deal.historicalLow
      ? (deal.salePrice <= deal.historicalLow * 1.01 ? 'Historical low' : `${money(deal.salePrice - deal.historicalLow)} above low`)
      : `${Math.round(deal.scoreBreakdown.components.priceValue)} price-value signal`;
    return `<article class="deal-card" data-key="${escapeHTML(deal.key)}" style="--delay:${Math.min(index, 12) * 28}ms">
      <button class="card-image" type="button" data-details="${escapeHTML(deal.key)}" aria-label="View details for ${escapeHTML(deal.title)}">
        ${image ? `<img src="${image}" alt="${escapeHTML(deal.title)} cover art" loading="lazy" decoding="async">` : '<span class="image-fallback">LR</span>'}
        <span class="discount-badge">−${deal.discount}%</span>
        ${deal.isEarlyAccess ? '<span class="content-badge">Early Access</span>' : ''}
      </button>
      <div class="card-content">
        <div class="card-overline"><span>${escapeHTML(deal.storeName)}</span><span>${escapeHTML((deal.genres[0] || 'PC game'))}</span></div>
        <button class="card-title" type="button" data-details="${escapeHTML(deal.key)}">${escapeHTML(deal.title)}</button>
        <div class="card-reviews">${reviewMarkup(deal)}</div>
        <div class="card-price-row">
          <div><span class="old-price">${money(deal.normalPrice)}</span><strong>${money(deal.salePrice)}</strong></div>
          <span class="history-note">${escapeHTML(priceLabel)}</span>
        </div>
        <div class="score-row">
          <div class="score-ring ${scoreTone(deal.dealScore)}" style="--score:${deal.dealScore}" aria-label="Deal Score ${deal.dealScore} out of 100">
            <strong>${deal.dealScore}</strong><span>score</span>
          </div>
          <div><strong>${scoreLabel(deal.dealScore)}</strong><p>${escapeHTML(deal.recommendation)}</p></div>
        </div>
        <div class="card-actions">
          <a class="button button-card" href="https://www.cheapshark.com/redirect?dealID=${escapeHTML(safeDealID(deal.dealID))}" target="_blank" rel="noopener noreferrer sponsored" data-track-deal="homepage_card" data-store="${escapeHTML(deal.storeName)}" data-price="${deal.salePrice}">View at ${escapeHTML(deal.storeName)}</a>
          <button class="watch-button ${watched ? 'watched' : ''}" type="button" data-watch="${escapeHTML(deal.key)}" aria-label="${watched ? 'Remove from' : 'Add to'} watchlist">
            <span aria-hidden="true">${watched ? '✓' : '+'}</span>
          </button>
        </div>
      </div>
    </article>`;
  }

  function render() {
    const filtered = filterDeals(state.allDeals, state.filters);
    state.visibleDeals = sortDeals(filtered, state.filters.sort);
    const shown = state.visibleDeals.slice(0, state.shown);
    const collection = collections[state.filters.collection] || collections.best;
    $('#collectionTitle').textContent = state.filters.q ? `Results for “${state.filters.q}”` : collection.title;
    $('#resultSummary').textContent = collection.summary;
    $('#resultCount').textContent = `${state.visibleDeals.length} ${state.visibleDeals.length === 1 ? 'deal' : 'deals'}`;
    $('#deals').innerHTML = shown.map(cardMarkup).join('');
    $('#emptyState').hidden = state.visibleDeals.length > 0 || state.allDeals.length === 0;
    $('#loadMore').hidden = state.shown >= state.visibleDeals.length;
  }

  function renderHero() {
    const top = sortDeals(state.allDeals.filter(deal => deal.eligible), 'recommended')[0];
    if (!top) return;
    const image = safeImage(top.image);
    $('#heroPick').innerHTML = `
      <div class="pick-image">${image ? `<img src="${image}" alt="${escapeHTML(top.title)} cover art" loading="eager" decoding="async">` : ''}<span>Pick of the day</span></div>
      <div class="pick-content">
        <div class="pick-head"><div><p>${escapeHTML(top.storeName)}</p><h2>${escapeHTML(top.title)}</h2></div>
          <div class="score-ring ${scoreTone(top.dealScore)}" style="--score:${top.dealScore}"><strong>${top.dealScore}</strong><span>score</span></div>
        </div>
        <p>${escapeHTML(top.recommendation)}</p>
        <div class="pick-price"><span><s>${money(top.normalPrice)}</s><strong>${money(top.salePrice)}</strong></span><span>−${top.discount}%</span></div>
        <button type="button" class="button button-primary button-full" data-details="${escapeHTML(top.key)}">See why it beat everything else</button>
      </div>`;
  }

  function findDeal(key) {
    return state.allDeals.find(deal => deal.key === key);
  }

  function toggleWatch(key) {
    const deal = findDeal(key);
    if (!deal) return;
    if (state.watchlist[key]) {
      delete state.watchlist[key];
      showToast(`${deal.title} removed from your watchlist.`);
      track('watchlist_remove', { surface: 'homepage' });
    } else {
      const now = new Date().toISOString();
      state.watchlist[key] = {
        key,
        title: deal.title,
        targetPrice: deal.salePrice,
        lastKnownPrice: deal.salePrice,
        lastKnownStore: deal.storeName || '',
        addedAt: now,
        updatedAt: now
      };
      showToast(`${deal.title} saved. Target set to ${money(deal.salePrice)}.`);
      track('watchlist_add', { surface: 'homepage' });
    }
    saveWatchlist();
    render();
    if ($('#watchDialog').open) renderWatchlist();
  }

  function updateWatchCount() {
    const items = Object.values(state.watchlist);
    $('#watchCount').textContent = items.length;
    const reached = items.filter(item => {
      const deal = findDeal(item.key);
      return deal && deal.salePrice <= Number(item.targetPrice);
    }).length;
    $('#openWatchlist').classList.toggle('has-alerts', reached > 0);
    $('#openWatchlist').setAttribute('aria-label', reached ? `Open watchlist, ${reached} target prices reached` : 'Open watchlist');
  }

  function renderWatchlist() {
    const items = Object.values(state.watchlist);
    if (!items.length) {
      $('#watchlistContent').innerHTML = '<div class="watch-empty"><span>◎</span><h3>Nothing on the watchlist yet</h3><p>Save a game with a target price and we will check it against the latest sweep next time you drop by.</p></div>';
      return;
    }
    $('#watchlistContent').innerHTML = items.map(item => {
      const deal = findDeal(item.key);
      const current = deal?.salePrice;
      const reached = deal && current <= Number(item.targetPrice);
      return `<article class="watch-row ${reached ? 'target-reached' : ''}">
        <div><span>${reached ? 'At or below target' : 'Watching'}</span><h3>${escapeHTML(item.title)}</h3><p>${deal ? `${money(current)} at ${escapeHTML(deal.storeName)} in this snapshot` : 'No qualifying listing in the current snapshot'}</p></div>
        <label>Target price <input type="number" min="0" step="0.01" value="${Number(item.targetPrice).toFixed(2)}" data-target-price="${escapeHTML(item.key)}"></label>
        ${deal ? `<button type="button" class="text-button" data-details="${escapeHTML(deal.key)}">Details</button>` : ''}
        <button type="button" class="remove-watch" data-watch="${escapeHTML(item.key)}" aria-label="Remove ${escapeHTML(item.title)}">×</button>
      </article>`;
    }).join('');
  }

  function componentRow(label, value, weight) {
    return `<div class="component-row"><div><span>${escapeHTML(label)}</span><small>${weight}% weight</small></div><div class="component-track"><i style="width:${Math.round(value)}%"></i></div><strong>${Math.round(value)}</strong></div>`;
  }

  function basicDetailMarkup(deal) {
    const image = safeImage(deal.image);
    const watched = state.watchlist[deal.key];
    return `<div class="detail-hero">
      ${image ? `<img src="${image}" alt="${escapeHTML(deal.title)} cover art" decoding="async">` : ''}
      <div class="detail-overlay"></div>
      <div class="detail-title"><p>${escapeHTML(deal.storeName)} · ${escapeHTML(deal.genres.join(' / ') || 'PC game')}</p><h2>${escapeHTML(deal.title)}</h2></div>
    </div>
    <div class="detail-body">
      <div class="detail-summary">
        <div class="score-ring score-ring-large ${scoreTone(deal.dealScore)}" style="--score:${deal.dealScore}"><strong>${deal.dealScore}</strong><span>Deal Score</span></div>
        <div><p class="detail-verdict">${scoreLabel(deal.dealScore)}</p><p>${escapeHTML(deal.recommendation)}</p></div>
        <div class="detail-price"><s>${money(deal.normalPrice)}</s><strong>${money(deal.salePrice)}</strong><span>−${deal.discount}%</span></div>
      </div>
      <section class="detail-section">
        <div class="detail-section-head"><div><p class="section-kicker">Deal Score</p><h3>Here is exactly how it got that number</h3></div><a href="methodology.html">Read the methodology ↗</a></div>
        <div class="score-components">
          ${componentRow('Game quality', deal.scoreBreakdown.components.quality, deal.scoreBreakdown.weights.quality)}
          ${componentRow('Price value', deal.scoreBreakdown.components.priceValue, deal.scoreBreakdown.weights.priceValue)}
          ${componentRow('Discount strength', deal.scoreBreakdown.components.discount, deal.scoreBreakdown.weights.discount)}
          ${componentRow('Review confidence', deal.scoreBreakdown.components.confidence, deal.scoreBreakdown.weights.confidence)}
          ${componentRow('Player interest', deal.scoreBreakdown.components.interest, deal.scoreBreakdown.weights.interest)}
        </div>
        ${deal.scoreBreakdown.penalties.length ? `<div class="penalty-note"><strong>Score adjustments</strong><span>${deal.scoreBreakdown.penalties.map(p => `${escapeHTML(p.label)} (−${p.amount})`).join(' · ')}</span></div>` : ''}
      </section>
      <section class="detail-section" id="livePriceContext"><div class="detail-loading"><span></span><p>Checking current price context&hellip;</p></div></section>
      <section class="detail-section watch-target">
        <div><p class="section-kicker">Target price</p><h3>Name the price you would actually pay</h3><p>Saved on this device. We check your target against the newest sweep when you come back. No alerts yet, so no inbox to dread.</p></div>
        <label><span>Target price</span><div><span>$</span><input id="targetPriceInput" type="number" min="0" step="0.01" value="${Number(watched?.targetPrice ?? deal.salePrice).toFixed(2)}"></div></label>
        <button class="button button-secondary" type="button" data-save-target="${escapeHTML(deal.key)}">${watched ? 'Update target' : 'Add to watchlist'}</button>
      </section>
      <div class="detail-actions">
        <a class="button button-primary button-full" href="https://www.cheapshark.com/redirect?dealID=${escapeHTML(safeDealID(deal.dealID))}" target="_blank" rel="noopener noreferrer sponsored" data-track-deal="detail_primary" data-store="${escapeHTML(deal.storeName)}" data-price="${deal.salePrice}">View deal at ${escapeHTML(deal.storeName)} · ${money(deal.salePrice)}</a>
        <p>This link routes through the pricing provider, which may earn a commission from the store. That has never moved a Deal Score and never will.</p>
      </div>
    </div>`;
  }

  async function openDetails(key) {
    const deal = findDeal(key);
    if (!deal) return;
    state.selectedDeal = deal;
    state.lastFocused = document.activeElement;
    $('#dealDialogContent').innerHTML = basicDetailMarkup(deal);
    $('#dealDialog').showModal();
    document.body.classList.add('dialog-open');
    if (state.detailController) state.detailController.abort();
    state.detailController = new AbortController();
    try {
      const lookup = await cheapShark.get(`/deals?id=${encodeURIComponent(deal.dealID)}`, {
        signal: state.detailController.signal,
        cacheTtlMs: 5 * 60 * 1000
      });
      renderLiveContext(deal, lookup);
    } catch (error) {
      if (error.name === 'AbortError') return;
      const target = $('#livePriceContext');
      if (target) target.innerHTML = '<div class="inline-error"><strong>Could not pull the live price details.</strong><p>The saved listing above still stands. Confirm the final price at the store.</p></div>';
    }
  }

  function renderLiveContext(deal, lookup) {
    const target = $('#livePriceContext');
    if (!target) return;
    const historical = Number(lookup?.cheapestPrice?.price || 0);
    const livePrice = Number(lookup?.gameInfo?.salePrice || deal.salePrice);
    const retail = Number(lookup?.gameInfo?.retailPrice || deal.normalPrice);
    const updatedDeal = { ...deal, salePrice: livePrice, normalPrice: retail, historicalLow: historical || null };
    const liveScore = calculateDealScore(updatedDeal, config);
    const difference = historical ? livePrice - historical : null;
    const alternateRows = (lookup?.cheaperStores || []).map(item => {
      const store = state.stores[item.storeID] || { name: `Store ${item.storeID}` };
      return `<a href="https://www.cheapshark.com/redirect?dealID=${escapeHTML(safeDealID(item.dealID))}" target="_blank" rel="noopener noreferrer sponsored" data-track-deal="detail_alternate" data-store="${escapeHTML(store.name)}" data-price="${Number(item.salePrice)}"><span>${escapeHTML(store.name)}</span><strong>${money(item.salePrice)}</strong></a>`;
    }).join('');
    const fullWidth = 100;
    const lowWidth = retail ? Math.max(4, Math.min(100, (historical / retail) * 100)) : 0;
    const currentWidth = retail ? Math.max(4, Math.min(100, (livePrice / retail) * 100)) : 0;
    target.innerHTML = `
      <div class="detail-section-head"><div><p class="section-kicker">Current price context</p><h3>${historical ? (difference <= 0.01 ? 'At its recorded historical low' : `${money(difference)} above the recorded low`) : 'No recorded historical low returned'}</h3></div><span class="confidence-pill">${liveScore.confidence} confidence</span></div>
      <div class="price-chart" role="img" aria-label="Recorded low ${historical ? money(historical) : 'unavailable'}, current price ${money(livePrice)}, retail price ${money(retail)}">
        <div><span>Recorded low</span><i style="width:${lowWidth}%"></i><strong>${historical ? money(historical) : '—'}</strong></div>
        <div><span>Current price</span><i class="current" style="width:${currentWidth}%"></i><strong>${money(livePrice)}</strong></div>
        <div><span>Full retail</span><i class="retail" style="width:${fullWidth}%"></i><strong>${money(retail)}</strong></div>
      </div>
      <p class="source-note">Recorded-low coverage has gaps in it. Useful context, not a full price history.</p>
      ${alternateRows ? `<div class="alternate-stores"><h4>Cheaper elsewhere right now</h4>${alternateRows}</div>` : '<p class="best-store-note">Nowhere cheaper turned up for this one.</p>'}`;
  }

  function closeDialog(dialog, controller) {
    if (controller) controller.abort();
    dialog.close();
    document.body.classList.remove('dialog-open');
    if (state.lastFocused && typeof state.lastFocused.focus === 'function') state.lastFocused.focus();
  }

  function resetFilters() {
    state.filters = { ...DEFAULT_FILTERS };
    state.shown = PAGE_SIZE;
    syncFormFromState();
    syncUrl();
    renderCollections();
    render();
  }

  function bindEvents() {
    let searchTimer;
    $('#dealFilters').addEventListener('input', event => {
      if (event.target.id === 'searchInput') {
        clearTimeout(searchTimer);
        searchTimer = setTimeout(readFormIntoState, 160);
      } else {
        readFormIntoState();
      }
    });
    $('#dealFilters').addEventListener('change', readFormIntoState);
    $('#filterPanel').addEventListener('change', event => {
      if (event.target.id === 'relaxQuality' && event.target.checked) {
        $('#ratingSelect').value = '0';
        $('#reviewsSelect').value = '0';
      }
      readFormIntoState();
    });
    $('#collectionTabs').addEventListener('click', event => {
      const button = event.target.closest('[data-collection]');
      if (!button) return;
      state.filters.collection = button.dataset.collection;
      state.shown = PAGE_SIZE;
      syncFormFromState();
      syncUrl();
      render();
    });
    $('#filterToggle').addEventListener('click', () => {
      const panel = $('#filterPanel');
      const open = panel.hidden;
      panel.hidden = !open;
      $('#filterToggle').setAttribute('aria-expanded', String(open));
    });
    $('#closeFilters').addEventListener('click', () => {
      $('#filterPanel').hidden = true;
      $('#filterToggle').setAttribute('aria-expanded', 'false');
      $('#deals').scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
    $('#resetFilters').addEventListener('click', resetFilters);
    $('#clearEmpty').addEventListener('click', resetFilters);
    $('#retryLoad').addEventListener('click', loadDeals);
    $('#loadMore').addEventListener('click', () => {
      state.shown += PAGE_SIZE;
      render();
    });
    document.addEventListener('click', event => {
      const detail = event.target.closest('[data-details]');
      const watch = event.target.closest('[data-watch]');
      const target = event.target.closest('[data-save-target]');
      const outbound = event.target.closest('[data-track-deal]');
      if (outbound) {
        track('deal_click', {
          surface: outbound.dataset.trackDeal,
          store: outbound.dataset.store,
          priceBucket: analytics?.priceBucket(outbound.dataset.price)
        });
      }
      if (detail) openDetails(detail.dataset.details);
      if (watch) toggleWatch(watch.dataset.watch);
      if (target) {
        const deal = findDeal(target.dataset.saveTarget);
        const price = Number($('#targetPriceInput')?.value);
        if (deal && Number.isFinite(price) && price >= 0) {
          const now = new Date().toISOString();
          state.watchlist[deal.key] = {
            key: deal.key,
            title: deal.title,
            targetPrice: price,
            lastKnownPrice: deal.salePrice,
            lastKnownStore: deal.storeName || '',
            addedAt: state.watchlist[deal.key]?.addedAt || now,
            updatedAt: now
          };
          saveWatchlist();
          showToast(`Watching ${deal.title} at ${money(price)}.`);
          target.textContent = 'Target saved';
          track('watchlist_target_update', { surface: 'detail' });
          render();
        }
      }
    });
    $('#openWatchlist').addEventListener('click', () => {
      track('watchlist_open', { surface: 'homepage' });
      state.lastFocused = document.activeElement;
      renderWatchlist();
      $('#watchDialog').showModal();
      document.body.classList.add('dialog-open');
    });
    $('#watchlistContent').addEventListener('change', event => {
      const input = event.target.closest('[data-target-price]');
      if (!input) return;
      const item = state.watchlist[input.dataset.targetPrice];
      const price = Number(input.value);
      if (item && Number.isFinite(price) && price >= 0) {
        item.targetPrice = price;
        item.updatedAt = new Date().toISOString();
        saveWatchlist();
        renderWatchlist();
        showToast('Target price updated.');
        track('watchlist_target_update', { surface: 'watchlist' });
      }
    });
    $('[data-close-dialog]').addEventListener('click', () => closeDialog($('#dealDialog'), state.detailController));
    $('[data-close-watch]').addEventListener('click', () => closeDialog($('#watchDialog')));
    [$('#dealDialog'), $('#watchDialog')].forEach(dialog => {
      dialog.addEventListener('click', event => {
        if (event.target === dialog) closeDialog(dialog, dialog === $('#dealDialog') ? state.detailController : null);
      });
      dialog.addEventListener('cancel', event => {
        event.preventDefault();
        closeDialog(dialog, dialog === $('#dealDialog') ? state.detailController : null);
      });
    });
  }

  bindEvents();
  updateWatchCount();
  initAccountSync();
  loadDeals();
})();
