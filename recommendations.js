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

const DEFAULT_PROFILE = {
  budget: 30,
  minRating: 70,
  minDiscount: 20,
  mode: 'all',
  genres: ['RPG', 'Action', 'Indie'],
  likes: {},
  dislikes: {}
};

const STORAGE_KEY = 'lr_recommendation_profile_v2';

let stores = {};
let deals = [];
let catalog = [];
let profile = loadProfile();

function loadProfile() {
  try { return { ...DEFAULT_PROFILE, ...(JSON.parse(localStorage.getItem(STORAGE_KEY)) || {}) }; }
  catch { return { ...DEFAULT_PROFILE }; }
}
function saveProfile() { localStorage.setItem(STORAGE_KEY, JSON.stringify(profile)); }
function itemKey(x) { return x.dealID || `app-${x.steamAppID || x.appid || x.id}`; }

function inferGenres(text = '') {
  const t = text.toLowerCase();
  const out = [];
  for (const [genre, kws] of Object.entries(GENRE_KEYWORDS)) {
    if (kws.some(k => t.includes(k))) out.push(genre);
  }
  return out;
}

function getGenres(game) {
  const g = game.rawg?.genres || game.genres || [];
  return g.length ? g : inferGenres(`${game.title || ''} ${game.steamRatingText || ''}`);
}

function getTags(game) {
  return game.rawg?.tags || game.tags || inferGenres(game.title || '');
}

function scoreGame(game) {
  const rawSale = game.salePrice ?? game.price_usd ?? game.price ?? null;
  const sale = rawSale == null ? null : Number(rawSale);
  const savings = Number(game.savings ?? game.discount ?? 0);
  const rating = Number(game.steamRatingPercent ?? game.rating ?? game.userscore ?? 0);
  const isOnSale = Number(game.savings || 0) > 0 || !!game.dealID;

  if (sale != null && !Number.isNaN(sale) && sale > profile.budget) return -999;
  if (rating < profile.minRating) return -999;
  if (profile.mode === 'on-sale' && !isOnSale) return -999;
  if (profile.mode === 'on-sale' && savings < profile.minDiscount) return -999;

  const genres = getGenres(game);
  const genreMatches = genres.filter(g => profile.genres.includes(g)).length;
  const key = itemKey(game);

  let score = 0;
  score += Math.min(1, genreMatches / Math.max(1, profile.genres.length)) * 0.35;
  score += Math.min(1, savings / 100) * 0.25;
  score += Math.min(1, rating / 100) * 0.25;
  const effectivePrice = (sale == null || Number.isNaN(sale)) ? profile.budget : sale;
  score += Math.max(0, 1 - effectivePrice / Math.max(1, profile.budget)) * 0.15;

  if (profile.likes[key]) score += 0.2;
  if (profile.dislikes[key]) score -= 1;

  return Number(score.toFixed(4));
}

function getConfidenceLabel(game) {
  const rating = Number(game.steamRatingPercent ?? game.rating ?? game.userscore ?? 0);
  const reviews = Number(game.steamRatingCount ?? game.positive ?? 0);
  const discount = Number(game.savings ?? game.discount ?? 0);
  let points = 0;
  if (rating >= 85) points += 2; else if (rating >= 75) points += 1;
  if (reviews >= 1000) points += 2; else if (reviews >= 250) points += 1;
  if (discount >= 60) points += 1;
  if (points >= 4) return 'High Confidence';
  if (points >= 2) return 'Medium Confidence';
  return 'Low Confidence';
}

function buildWhyChip(game, topGenres = [], topTags = []) {
  const genres = getGenres(game);
  const tags = getTags(game).map(String);
  const savings = Math.round(Number(game.savings ?? game.discount ?? 0));

  const mg = genres.find(g => topGenres.includes(g));
  const mt = tags.find(t => topTags.map(z => z.toLowerCase()).includes(t.toLowerCase()));
  const parts = [];
  if (mg) parts.push(mg);
  if (mt) parts.push(mt);
  if (savings > 0) parts.push(`${savings}% off`);
  return parts.length ? `Why: ${parts.join(' · ')}` : null;
}

function cardLink(game) {
  if (game.dealID) return `https://www.cheapshark.com/redirect?dealID=${encodeURIComponent(game.dealID)}`;
  const app = game.steamAppID || game.appid;
  if (app) return `https://store.steampowered.com/app/${app}`;
  return '#';
}

function cardHtml(game, why = null) {
  const sale = Number(game.salePrice ?? game.price_usd ?? game.price ?? 0);
  const normal = Number(game.normalPrice ?? game.initial_price_usd ?? sale || 0);
  const savings = Math.round(Number(game.savings ?? game.discount ?? 0));
  const rating = Number(game.steamRatingPercent ?? game.rating ?? game.userscore ?? 0);
  const key = itemKey(game);
  const confidence = getConfidenceLabel(game);
  const title = game.title || game.rawg?.name || 'Untitled';
  const thumb = game.thumb || game.rawg?.backgroundImage || 'icons/icon.png';
  const onSale = !!game.dealID || savings > 0;

  return `
  <div class="card">
    <div class="card-thumb">
      <img src="${thumb}" alt="${title}" loading="lazy" referrerpolicy="no-referrer" onerror="this.src='icons/icon.png'">
      <span class="badge">${onSale ? `-${savings}%` : 'REC'}</span>
    </div>
    <div class="card-body">
      <div class="card-meta">
        <span class="store-tag">${onSale ? 'On Sale' : 'Catalog Pick'}</span>
        <div><span class="rating">⭐ ${rating || 'N/A'}%</span></div>
      </div>
      <div class="card-title">${title}</div>
      <div class="confidence-chip">${confidence}</div>
      ${why ? `<div class="why-chip">${why}</div>` : ''}
      <div class="pricing">
        ${onSale ? `<span class="price-old">$${normal.toFixed(2)}</span><span class="price-new">$${sale.toFixed(2)}</span>` : `<span class="price-new">$${sale.toFixed(2) || 'N/A'}</span>`}
      </div>
      <a class="deal-link" href="${cardLink(game)}" target="_blank" rel="noopener noreferrer">${onSale ? 'View Deal →' : 'View on Steam →'}</a>
      <div class="card-actions" style="margin-top:8px;display:flex;gap:8px;">
        <button class="feedback-btn" data-fb="like" data-id="${key}">👍 Like</button>
        <button class="feedback-btn" data-fb="dislike" data-id="${key}">👎 Skip</button>
      </div>
    </div>
  </div>`;
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
      if (profile.genres.includes(genre)) profile.genres = profile.genres.filter(g => g !== genre);
      else profile.genres.push(genre);
      btn.classList.toggle('active');
      renderRecommendations();
    });
    wrap.appendChild(btn);
  });
}

function renderBecause(scored) {
  const becauseGrid = document.getElementById('becauseGrid');
  const becauseReason = document.getElementById('becauseReason');
  const likedIds = Object.keys(profile.likes || {});

  if (!likedIds.length) {
    becauseReason.textContent = 'Like a few games and this section will learn your taste.';
    becauseGrid.innerHTML = '';
    return;
  }

  const likedGames = catalog.filter(g => likedIds.includes(itemKey(g)));
  const likedGenres = new Map();
  const likedTags = new Map();
  likedGames.forEach(g => {
    getGenres(g).forEach(x => likedGenres.set(x, (likedGenres.get(x) || 0) + 1));
    getTags(g).forEach(x => likedTags.set(String(x).toLowerCase(), (likedTags.get(String(x).toLowerCase()) || 0) + 1));
  });

  const topGenres = [...likedGenres.entries()].sort((a,b)=>b[1]-a[1]).slice(0,3).map(([g])=>g);
  const topTags = [...likedTags.entries()].sort((a,b)=>b[1]-a[1]).slice(0,6).map(([t])=>t);

  const picks = scored
    .filter(x => !profile.likes[itemKey(x.g)] && !profile.dislikes[itemKey(x.g)])
    .map(x => {
      const g = getGenres(x.g);
      const t = getTags(x.g).map(v => String(v).toLowerCase());
      const boost = g.filter(v => topGenres.includes(v)).length * 0.12 + t.filter(v => topTags.includes(v)).length * 0.04;
      return { ...x, blendScore: x.score + boost };
    })
    .sort((a,b)=>b.blendScore-a.blendScore)
    .slice(0,8);

  becauseReason.textContent = `Based on your likes in: ${topGenres.join(', ') || 'your favorites'}.`;
  becauseGrid.innerHTML = picks.map(x => cardHtml(x.g, buildWhyChip(x.g, topGenres, topTags))).join('');
}

function renderRecommendations() {
  const scored = catalog.map(g => ({ g, score: scoreGame(g) })).filter(x => x.score > 0).sort((a,b)=>b.score-a.score);
  const filtered = scored.filter(x => !profile.dislikes[itemKey(x.g)]).slice(0, 36);

  const grid = document.getElementById('recommendationGrid');
  const empty = document.getElementById('emptyState');
  const count = document.getElementById('recCount');

  if (!filtered.length) {
    grid.innerHTML = '';
    empty.style.display = 'block';
    count.textContent = '';
    renderBecause([]);
    return;
  }

  empty.style.display = 'none';
  const modeLabel = profile.mode === 'on-sale' ? 'on-sale recommendations' : 'umbrella recommendations';
  count.textContent = `${filtered.length} ${modeLabel} found`;
  grid.innerHTML = filtered.map(x => cardHtml(x.g, buildWhyChip(x.g, profile.genres, profile.genres))).join('');
  renderBecause(scored);
}

function bindControls() {
  const budgetRange = document.getElementById('budgetRange');
  const budgetVal = document.getElementById('budgetVal');
  const minRating = document.getElementById('minRating');
  const minDiscount = document.getElementById('minDiscount');
  const recMode = document.getElementById('recMode');

  budgetRange.value = profile.budget;
  budgetVal.textContent = `$${profile.budget}`;
  minRating.value = String(profile.minRating);
  minDiscount.value = String(profile.minDiscount);
  recMode.value = profile.mode || 'all';

  budgetRange.addEventListener('input', () => { profile.budget = parseInt(budgetRange.value, 10); budgetVal.textContent = `$${profile.budget}`; renderRecommendations(); });
  minRating.addEventListener('change', () => { profile.minRating = parseInt(minRating.value, 10); renderRecommendations(); });
  minDiscount.addEventListener('change', () => { profile.minDiscount = parseInt(minDiscount.value, 10); renderRecommendations(); });
  recMode.addEventListener('change', () => { profile.mode = recMode.value; renderRecommendations(); });

  document.getElementById('savePrefs').addEventListener('click', () => { saveProfile(); alert('Preferences saved.'); });
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

    if (type === 'like') { profile.likes[id] = true; delete profile.dislikes[id]; }
    else { profile.dislikes[id] = true; delete profile.likes[id]; }

    saveProfile();
    renderRecommendations();
  });
}

async function init() {
  try {
    const v = Math.floor(Date.now() / 3600000);

    let enriched = null;
    try {
      const r = await fetch('enriched-deals.json?v=' + v);
      if (r.ok) enriched = await r.json();
    } catch (_) {}

    let dealsData = null;
    if (enriched?.games?.length) {
      dealsData = { stores: enriched.stores || {}, deals: enriched.games };
    } else {
      const fallback = await fetch('deals.json?v=' + v).then(r => r.json());
      dealsData = { stores: fallback.stores || {}, deals: fallback.deals || [] };
    }

    stores = dealsData.stores;
    deals = dealsData.deals.map(d => ({ ...d, steamAppID: d.steamAppID || d.appid, title: d.rawg?.name || d.title }));

    // Try umbrella catalog first
    try {
      const c = await fetch('games-catalog.json?v=' + v);
      if (c.ok) {
        const j = await c.json();
        const dealByApp = new Map();
        deals.forEach(d => {
          const app = String(d.steamAppID || d.appid || '');
          if (app && !dealByApp.has(app)) dealByApp.set(app, d);
        });

        catalog = (j.games || []).map(g => {
          const app = String(g.appid || '');
          const deal = dealByApp.get(app);
          return deal ? { ...g, ...deal, steamAppID: app } : { ...g, steamAppID: app };
        });
      }
    } catch (_) {}

    if (!catalog.length) catalog = deals;

    bindControls();
    buildGenrePills();
    renderRecommendations();
  } catch (err) {
    console.error(err);
    document.getElementById('emptyState').style.display = 'block';
    document.getElementById('emptyState').innerHTML = '<p>Could not load recommendations right now. Please refresh.</p>';
  }
}

init();
