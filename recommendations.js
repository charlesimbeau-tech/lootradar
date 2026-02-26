const GENRES = [
  'RPG','Souls-like','Metroidvania','Roguelike','FPS','Action','Strategy','Horror','Racing','Sports','Simulation','Adventure','Indie','Survival','Puzzle','Open World','Multiplayer','Platformer','Fighting','Stealth'
];

const GENRE_KEYWORDS = {
  'RPG': ['rpg', 'fantasy', 'quest', 'witcher', 'dragon', 'final fantasy', 'baldur'],
  'Souls-like': ['souls', 'elden ring', 'sekiro', 'nioh', 'lies of p'],
  'Metroidvania': ['metroidvania', 'hollow knight', 'ori', 'dead cells', 'blasphemous'],
  'Roguelike': ['roguelike', 'roguelite', 'hades', 'slay the spire', 'risk of rain'],
  'FPS': ['shooter', 'doom', 'battlefield', 'counter-strike', 'halo', 'overwatch'],
  'Action': ['action', 'assassin', 'tomb raider', 'hitman', 'devil may cry'],
  'Strategy': ['strategy', 'civilization', 'xcom', 'total war', 'stellaris'],
  'Horror': ['horror', 'resident evil', 'dead space', 'outlast', 'alan wake'],
  'Racing': ['racing', 'forza', 'need for speed', 'f1', 'dirt'],
  'Sports': ['sports', 'fifa', 'nba', 'madden', 'wwe'],
  'Simulation': ['simulator', 'simulation', 'farming', 'flight', 'tycoon'],
  'Adventure': ['adventure', 'life is strange', 'firewatch', 'walking dead'],
  'Indie': ['indie', 'stardew', 'undertale', 'cuphead', 'celeste'],
  'Survival': ['survival', 'rust', 'dayz', 'forest', 'subnautica', 'valheim'],
  'Puzzle': ['puzzle', 'portal', 'tetris', 'witness'],
  'Open World': ['open world', 'gta', 'cyberpunk', 'red dead', 'skyrim'],
  'Multiplayer': ['multiplayer', 'co-op', 'online', 'pvp', 'battle royale'],
  'Platformer': ['platformer', 'mario', 'sonic', 'rayman'],
  'Fighting': ['fighting', 'street fighter', 'tekken', 'mortal kombat'],
  'Stealth': ['stealth', 'dishonored', 'thief', 'splinter cell', 'deus ex']
};

const STORE_ICONS = {
  '1':'https://www.cheapshark.com/img/stores/icons/0.png','2':'https://www.cheapshark.com/img/stores/icons/1.png','3':'https://www.cheapshark.com/img/stores/icons/2.png','4':'https://www.cheapshark.com/img/stores/icons/3.png','5':'https://www.cheapshark.com/img/stores/icons/4.png','6':'https://www.cheapshark.com/img/stores/icons/5.png','7':'https://www.cheapshark.com/img/stores/icons/6.png','8':'https://www.cheapshark.com/img/stores/icons/7.png','9':'https://www.cheapshark.com/img/stores/icons/8.png','10':'https://www.cheapshark.com/img/stores/icons/9.png'
};

const DEFAULT_PROFILE = {
  budget: 30,
  minRating: 70,
  minDiscount: 20,
  genres: ['RPG', 'Action', 'Indie'],
  likes: {},
  dislikes: {}
};

const STORAGE_KEY = 'lr_recommendation_profile_v1';

let deals = [];
let stores = {};
let profile = loadProfile();

function loadProfile() {
  try {
    return { ...DEFAULT_PROFILE, ...(JSON.parse(localStorage.getItem(STORAGE_KEY)) || {}) };
  } catch {
    return { ...DEFAULT_PROFILE };
  }
}

function saveProfile() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(profile));
}

function inferGenres(text) {
  const t = text.toLowerCase();
  const tags = [];
  for (const [genre, kws] of Object.entries(GENRE_KEYWORDS)) {
    if (kws.some(k => t.includes(k))) tags.push(genre);
  }
  return tags;
}

function scoreDeal(deal) {
  const sale = parseFloat(deal.salePrice || 0);
  const savings = parseFloat(deal.savings || 0);
  const rating = parseInt(deal.steamRatingPercent || 0, 10);
  const title = deal.title || '';
  const genres = (deal.rawg?.genres && deal.rawg.genres.length)
    ? deal.rawg.genres
    : inferGenres(title + ' ' + (deal.steamRatingText || ''));

  if (sale > profile.budget) return -999;
  if (rating < profile.minRating) return -999;
  if (savings < profile.minDiscount) return -999;

  const genreMatches = genres.filter(g => profile.genres.includes(g)).length;
  const likeBoost = profile.likes[deal.dealID] ? 0.25 : 0;
  const dislikePenalty = profile.dislikes[deal.dealID] ? 1 : 0;

  let score = 0;
  score += Math.min(1, genreMatches / Math.max(1, profile.genres.length)) * 0.35;
  score += Math.min(1, savings / 100) * 0.25;
  score += Math.min(1, rating / 100) * 0.25;
  score += Math.max(0, 1 - sale / Math.max(1, profile.budget)) * 0.15;
  score += likeBoost;
  score -= dislikePenalty;

  return Number(score.toFixed(4));
}

function buildGenrePills() {
  const wrap = document.getElementById('genrePills');
  wrap.innerHTML = '';

  GENRES.forEach(genre => {
    const btn = document.createElement('button');
    btn.className = 'genre-pill' + (profile.genres.includes(genre) ? ' active' : '');
    btn.type = 'button';
    btn.textContent = genre;
    btn.addEventListener('click', () => {
      if (profile.genres.includes(genre)) {
        profile.genres = profile.genres.filter(g => g !== genre);
      } else {
        profile.genres.push(genre);
      }
      btn.classList.toggle('active');
      renderRecommendations();
    });
    wrap.appendChild(btn);
  });
}

function dealCardHtml(d) {
  const sale = parseFloat(d.salePrice || 0);
  const normal = parseFloat(d.normalPrice || 0);
  const savings = Math.round(parseFloat(d.savings || 0));
  const rating = parseInt(d.steamRatingPercent || 0, 10);
  const storeName = stores[d.storeID]?.name || `Store ${d.storeID}`;
  const storeIcon = stores[d.storeID]?.icon || STORE_ICONS[d.storeID] || '';
  const link = `https://www.cheapshark.com/redirect?dealID=${encodeURIComponent(d.dealID)}`;

  return `
  <div class="card">
    <div class="card-thumb">
      <img src="${d.thumb}" alt="${d.title}" loading="lazy" referrerpolicy="no-referrer" onerror="this.src='icons/icon.png'">
      <span class="badge">-${savings}%</span>
    </div>
    <div class="card-body">
      <div class="card-meta">
        <span class="store-tag">${storeIcon ? `<img class="store-icon" src="${storeIcon}" alt="" onerror="this.style.display='none'">` : ''} ${storeName}</span>
        <div><span class="rating">⭐ ${rating || 'N/A'}%</span></div>
      </div>
      <div class="card-title">${d.title}</div>
      <div class="pricing">
        <span class="price-old">$${normal.toFixed(2)}</span><span class="price-new">$${sale.toFixed(2)}</span>
      </div>
      <a class="deal-link" href="${link}" target="_blank" rel="noopener noreferrer" data-dealid="${d.dealID}">View Deal →</a>
      <div class="card-actions" style="margin-top:8px;display:flex;gap:8px;">
        <button class="feedback-btn" data-fb="like" data-id="${d.dealID}">👍 Like</button>
        <button class="feedback-btn" data-fb="dislike" data-id="${d.dealID}">👎 Skip</button>
      </div>
    </div>
  </div>`;
}

function getDealGenres(deal) {
  return (deal.rawg?.genres && deal.rawg.genres.length)
    ? deal.rawg.genres
    : inferGenres((deal.title || '') + ' ' + (deal.steamRatingText || ''));
}

function getDealTags(deal) {
  if (deal.rawg?.tags && deal.rawg.tags.length) return deal.rawg.tags;
  return inferGenres((deal.title || '') + ' ' + (deal.steamRatingText || ''));
}

function renderBecauseYouLiked(scoredDeals) {
  const becauseGrid = document.getElementById('becauseGrid');
  const becauseReason = document.getElementById('becauseReason');
  const likedIds = Object.keys(profile.likes || {});

  if (!likedIds.length) {
    becauseReason.textContent = 'Like a few games and this section will learn your taste.';
    becauseGrid.innerHTML = '';
    return;
  }

  const likedDeals = deals.filter(d => likedIds.includes(d.dealID));
  const likedGenres = new Map();
  const likedTags = new Map();

  likedDeals.forEach(d => {
    getDealGenres(d).forEach(g => likedGenres.set(g, (likedGenres.get(g) || 0) + 1));
    getDealTags(d).forEach(t => likedTags.set(t, (likedTags.get(t) || 0) + 1));
  });

  const topGenres = [...likedGenres.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([g]) => g);

  const topTags = [...likedTags.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([t]) => t.toLowerCase());

  const blended = scoredDeals
    .filter(x => !profile.likes[x.d.dealID] && !profile.dislikes[x.d.dealID])
    .map(x => {
      const g = getDealGenres(x.d);
      const t = getDealTags(x.d).map(v => String(v).toLowerCase());
      const genreOverlap = g.filter(v => topGenres.includes(v)).length;
      const tagOverlap = t.filter(v => topTags.includes(v)).length;
      const blendBoost = (genreOverlap * 0.12) + (tagOverlap * 0.04);
      return { ...x, blendScore: x.score + blendBoost };
    })
    .filter(x => x.blendScore > 0)
    .sort((a, b) => b.blendScore - a.blendScore)
    .slice(0, 8);

  const reasonGenres = topGenres.length ? topGenres.join(', ') : 'your favorites';
  becauseReason.textContent = `Based on your likes in: ${reasonGenres}.`;
  becauseGrid.innerHTML = blended.map(x => dealCardHtml(x.d)).join('');
}

function renderRecommendations() {
  const scored = deals
    .map(d => ({ d, score: scoreDeal(d) }))
    .filter(x => x.score > 0)
    .sort((a, b) => b.score - a.score);

  const grid = document.getElementById('recommendationGrid');
  const empty = document.getElementById('emptyState');
  const count = document.getElementById('recCount');

  const filtered = scored
    .filter(x => !profile.dislikes[x.d.dealID])
    .slice(0, 36);

  if (!filtered.length) {
    grid.innerHTML = '';
    empty.style.display = 'block';
    count.textContent = '';
    renderBecauseYouLiked([]);
    return;
  }

  empty.style.display = 'none';
  count.textContent = `${filtered.length} personalized deals found`;
  grid.innerHTML = filtered.map(x => dealCardHtml(x.d)).join('');
  renderBecauseYouLiked(scored);
}

function bindControls() {
  const budgetRange = document.getElementById('budgetRange');
  const budgetVal = document.getElementById('budgetVal');
  const minRating = document.getElementById('minRating');
  const minDiscount = document.getElementById('minDiscount');

  budgetRange.value = profile.budget;
  budgetVal.textContent = `$${profile.budget}`;
  minRating.value = String(profile.minRating);
  minDiscount.value = String(profile.minDiscount);

  budgetRange.addEventListener('input', () => {
    profile.budget = parseInt(budgetRange.value, 10);
    budgetVal.textContent = `$${profile.budget}`;
    renderRecommendations();
  });
  minRating.addEventListener('change', () => {
    profile.minRating = parseInt(minRating.value, 10);
    renderRecommendations();
  });
  minDiscount.addEventListener('change', () => {
    profile.minDiscount = parseInt(minDiscount.value, 10);
    renderRecommendations();
  });

  document.getElementById('savePrefs').addEventListener('click', () => {
    saveProfile();
    alert('Preferences saved.');
  });

  document.getElementById('resetPrefs').addEventListener('click', () => {
    if (!confirm('Reset your recommendation profile?')) return;
    profile = { ...DEFAULT_PROFILE };
    saveProfile();
    bindControls();
    buildGenrePills();
    renderRecommendations();
  });

  document.addEventListener('click', (e) => {
    const btn = e.target.closest('.feedback-btn');
    if (!btn) return;
    const id = btn.dataset.id;
    const type = btn.dataset.fb;
    if (!id || !type) return;

    if (type === 'like') {
      profile.likes[id] = true;
      delete profile.dislikes[id];
    } else {
      profile.dislikes[id] = true;
      delete profile.likes[id];
    }

    saveProfile();
    renderRecommendations();
  });
}

async function init() {
  try {
    const v = Math.floor(Date.now() / 3600000);
    let data = null;

    try {
      const enriched = await fetch('enriched-deals.json?v=' + v);
      if (enriched.ok) {
        const ej = await enriched.json();
        stores = ej.stores || {};
        deals = (ej.games || []).map(g => ({
          ...g,
          title: g.rawg?.name || g.title,
          steamRatingPercent: g.steamRatingPercent,
          steamRatingText: g.steamRatingText
        }));
        data = ej;
      }
    } catch (_) {}

    if (!data) {
      const fallback = await fetch('deals.json?v=' + v).then(r => r.json());
      stores = fallback.stores || {};
      deals = fallback.deals || [];
    }

    bindControls();
    buildGenrePills();
    renderRecommendations();
  } catch (err) {
    console.error(err);
    document.getElementById('emptyState').style.display = 'block';
    document.getElementById('emptyState').innerHTML = '<p>Could not load deals right now. Please refresh.</p>';
  }
}

init();
