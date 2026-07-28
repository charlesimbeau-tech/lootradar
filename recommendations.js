/* LootRadar Recommendations Engine v7 — clean rebuild */

const GENRES = [
  'RPG','Action','Adventure','Indie','FPS','Strategy','Horror','Racing',
  'Sports','Simulation','Survival','Puzzle','Open World','Multiplayer',
  'Platformer','Fighting','Stealth','Roguelike','Souls-like','Metroidvania'
];

const GENRE_KEYWORDS = {
  'RPG':['rpg','fantasy','quest','witcher','dragon','final fantasy','baldur'],
  'Action':['action','assassin','tomb raider','hitman','devil may cry'],
  'Adventure':['adventure','life is strange','firewatch','walking dead'],
  'Indie':['indie','stardew','undertale','cuphead','celeste'],
  'FPS':['shooter','doom','battlefield','counter-strike','halo','overwatch'],
  'Strategy':['strategy','civilization','xcom','total war','stellaris'],
  'Horror':['horror','resident evil','dead space','outlast','alan wake'],
  'Racing':['racing','forza','need for speed','f1','dirt'],
  'Sports':['sports','fifa','nba','madden','wwe'],
  'Simulation':['simulator','simulation','farming','flight','tycoon'],
  'Survival':['survival','rust','dayz','forest','subnautica','valheim'],
  'Puzzle':['puzzle','portal','tetris','witness'],
  'Open World':['open world','gta','cyberpunk','red dead','skyrim'],
  'Multiplayer':['multiplayer','co-op','online','pvp','battle royale'],
  'Platformer':['platformer','mario','sonic','rayman'],
  'Fighting':['fighting','street fighter','tekken','mortal kombat'],
  'Stealth':['stealth','dishonored','thief','splinter cell','deus ex'],
  'Roguelike':['roguelike','roguelite','hades','slay the spire','risk of rain'],
  'Souls-like':['souls','elden ring','sekiro','nioh','lies of p'],
  'Metroidvania':['metroidvania','hollow knight','ori','dead cells','blasphemous']
};

const DEFAULT_PROFILE = {
  budget: 70, minRating: 0, minDiscount: 0, mode: 'all',
  popularityMin: 0,
  genreMatchMode: 'any',
  preset: 'custom',
  genres: ['RPG','Action','Indie'], likes: {}, dislikes: {}
};
const STORAGE_KEY = 'lr_rec_profile_v3';

var stores = {};
var deals = [];
var catalog = [];
var profile = loadProfile();
var account = null;
var accountUser = null;

try {
  var supabaseClient = window.supabase && window.LR_SUPABASE_URL && window.LR_SUPABASE_ANON_KEY
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

function freshDefaultProfile() {
  return Object.assign({}, DEFAULT_PROFILE, {
    genres: DEFAULT_PROFILE.genres.slice(),
    likes: {},
    dislikes: {}
  });
}

function loadProfile() {
  try {
    var saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (saved && typeof saved === 'object') {
      var merged = Object.assign({}, DEFAULT_PROFILE, saved);
      if (!Array.isArray(merged.genres)) merged.genres = DEFAULT_PROFILE.genres.slice();
      else merged.genres = merged.genres.slice();
      merged.likes = Object.assign({}, merged.likes || {});
      merged.dislikes = Object.assign({}, merged.dislikes || {});
      return merged;
    }
  } catch(e) { /* ignore */ }
  return freshDefaultProfile();
}

function saveProfile(syncFeedback) {
  profile.updatedAt = new Date().toISOString();
  localStorage.setItem(STORAGE_KEY, JSON.stringify(profile));
  if (account) {
    account.syncProfile(profile);
    if (syncFeedback) account.syncFeedback(profile);
  }
}

function loadWatchlistForSync() {
  try {
    return JSON.parse(localStorage.getItem('lr_watchlist_v1') || '{}') || {};
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

function reflectAccountState(snapshot) {
  var statusEl = document.getElementById('authStatus');
  var accountLink = document.getElementById('authAccountLink');
  var signOutBtn = document.getElementById('authSignOut');
  accountUser = snapshot && snapshot.user ? snapshot.user : null;
  if (statusEl) statusEl.textContent = accountStatusText(snapshot && snapshot.status);
  if (accountLink) {
    if (accountUser) {
      accountLink.href = 'account.html';
      accountLink.textContent = 'Account';
    } else {
      var next = (window.location.pathname || '/recommendations.html') + (window.location.search || '');
      accountLink.href = 'login.html?next=' + encodeURIComponent(next);
      accountLink.textContent = 'Sign in to sync';
    }
  }
  if (signOutBtn) signOutBtn.style.display = accountUser ? 'inline-block' : 'none';
}

function reflectProfileInControls() {
  var budgetRange = document.getElementById('budgetRange');
  var budgetVal = document.getElementById('budgetVal');
  var minRating = document.getElementById('minRating');
  var minDiscount = document.getElementById('minDiscount');
  var recMode = document.getElementById('recMode');
  var popularityMin = document.getElementById('popularityMin');
  var presetMode = document.getElementById('presetMode');
  var genreMatchMode = document.getElementById('genreMatchMode');
  if (budgetRange) budgetRange.value = profile.budget;
  if (budgetVal) budgetVal.textContent = '$' + profile.budget;
  if (minRating) minRating.value = String(profile.minRating);
  if (minDiscount) minDiscount.value = String(profile.minDiscount);
  if (recMode) recMode.value = profile.mode || 'all';
  if (popularityMin) popularityMin.value = String(profile.popularityMin || 0);
  if (presetMode) presetMode.value = profile.preset || 'custom';
  if (genreMatchMode) genreMatchMode.value = profile.genreMatchMode || 'any';
  updateGenreHint();
}

function initAccountSync() {
  var signOutBtn = document.getElementById('authSignOut');
  if (!account) {
    reflectAccountState({ status: 'guest', user: null });
    return;
  }

  account.subscribe(reflectAccountState);
  if (signOutBtn) {
    signOutBtn.addEventListener('click', function() {
      account.signOut().then(function(signedOut) {
        if (signedOut) window.location.reload();
      });
    });
  }

  account.loadAndMerge(profile, loadWatchlistForSync()).then(function(result) {
    if (!result || !result.profile || result.cancelled) return;
    profile = Object.assign({}, DEFAULT_PROFILE, result.profile);
    if (!Array.isArray(profile.genres)) profile.genres = DEFAULT_PROFILE.genres.slice();
    localStorage.setItem(STORAGE_KEY, JSON.stringify(profile));
    reflectProfileInControls();
    buildGenrePills();
    if (catalog.length || deals.length) renderRecommendations();
  }).catch(function() {
    reflectAccountState({ status: 'delayed', user: account.state().user });
  });
}

function itemKey(x) {
  return x.dealID || ('app-' + (x.steamAppID || x.appid || x.id || 'unknown'));
}

function inferGenres(text) {
  var t = (text || '').toLowerCase();
  var out = [];
  for (var genre in GENRE_KEYWORDS) {
    var kws = GENRE_KEYWORDS[genre];
    for (var i = 0; i < kws.length; i++) {
      if (t.indexOf(kws[i]) !== -1) { out.push(genre); break; }
    }
  }
  return out;
}

function normalizeLabel(v) {
  return String(v || '').toLowerCase().trim();
}

function getGenres(game) {
  var g = (game.rawg && game.rawg.genres) || game.genres || [];
  if (g.length) return g;
  return inferGenres((game.title || '') + ' ' + (game.steamRatingText || ''));
}

function hasGenreMatch(gameGenres, selectedGenres, mode) {
  if (!selectedGenres || !selectedGenres.length) return true;
  var gs = gameGenres.map(normalizeLabel);
  if (mode === 'all') {
    for (var j = 0; j < selectedGenres.length; j++) {
      if (gs.indexOf(normalizeLabel(selectedGenres[j])) === -1) return false;
    }
    return true;
  }
  for (var i = 0; i < selectedGenres.length; i++) {
    if (gs.indexOf(normalizeLabel(selectedGenres[i])) !== -1) return true;
  }
  return false;
}

function getTags(game) {
  return (game.rawg && game.rawg.tags) || game.tags || inferGenres(game.title || '');
}

function applyPreset(preset) {
  profile.preset = preset || 'custom';
  if (profile.preset === 'trending') {
    profile.minRating = 70; profile.minDiscount = 20; profile.mode = 'all'; profile.popularityMin = 1000;
  } else if (profile.preset === 'new') {
    profile.minRating = 65; profile.minDiscount = 0; profile.mode = 'all'; profile.popularityMin = 0;
  } else if (profile.preset === 'aaa') {
    profile.minRating = 80; profile.minDiscount = 10; profile.mode = 'all'; profile.popularityMin = 5000;
    profile.genres = ['Action','Adventure','Open World','RPG','FPS'];
  } else if (profile.preset === 'indie') {
    profile.minRating = 75; profile.minDiscount = 0; profile.mode = 'all'; profile.popularityMin = 300;
    profile.genres = ['Indie','Roguelike','Metroidvania','Puzzle','Platformer'];
  }
}

function titleFamilyKey(title) {
  var t = String(title || '').toLowerCase();
  t = t.split(':')[0];
  t = t.replace(/\b(remastered|definitive|ultimate|edition|complete|collection|gold)\b/g, '');
  t = t.replace(/\b[ivx]+\b/g, '');
  t = t.replace(/\d+/g, '');
  t = t.replace(/[^a-z\s]/g, ' ').replace(/\s+/g, ' ').trim();
  var parts = t.split(' ').filter(Boolean);
  return parts.slice(0, 2).join(' ');
}

function ownersUpperBound(owners) {
  var s = String(owners || '0');
  var parts = s.split('..').map(function(x){ return Number(String(x).trim()) || 0; });
  return parts.length > 1 ? Math.max(parts[0], parts[1]) : (parts[0] || 0);
}

function popularitySignal(game) {
  var reviews = Number(game.steamRatingCount || 0) + Number(game.positive || 0) + Number(game.negative || 0);
  var owners = ownersUpperBound(game.owners);
  var active = Number(game.avg_2weeks || 0);
  return Math.max(reviews, owners / 1000, active * 10);
}

function scoreGame(game) {
  var saleRaw = game.salePrice != null ? game.salePrice : (game.price_usd != null ? game.price_usd : game.price);
  var sale = saleRaw != null ? Number(saleRaw) : null;
  var savings = Number(game.savings || game.discount || 0);
  var rating = Number(game.steamRatingPercent || game.rating || game.userscore || 0);
  var isOnSale = savings > 0 || !!game.dealID;

  if (sale != null && !isNaN(sale) && sale > profile.budget) return -999;
  if (rating < profile.minRating) return -999;
  if (savings < profile.minDiscount) return -999;
  if (popularitySignal(game) < Number(profile.popularityMin || 0)) return -999;
  if (profile.mode === 'on-sale' && !isOnSale) return -999;

  var genres = getGenres(game);
  if (!hasGenreMatch(genres, profile.genres, profile.genreMatchMode || 'any')) return -999;

  var genreMatches = 0;
  for (var i = 0; i < genres.length; i++) {
    if (profile.genres.map(normalizeLabel).indexOf(normalizeLabel(genres[i])) !== -1) genreMatches++;
  }
  var key = itemKey(game);

  var score = 0;
  score += Math.min(1, genreMatches / Math.max(1, profile.genres.length)) * 0.35;
  score += Math.min(1, savings / 100) * 0.25;
  score += Math.min(1, rating / 100) * 0.25;
  var ep = (sale == null || isNaN(sale)) ? profile.budget : sale;
  score += Math.max(0, 1 - ep / Math.max(1, profile.budget)) * 0.15;
  if (profile.likes[key]) score += 0.2;
  if (profile.dislikes[key]) score -= 1;

  if (profile.preset === 'new') {
    score += Math.min(1, Number(game.avg_2weeks || 0) / 500) * 0.2;
  } else if (profile.preset === 'trending') {
    score += Math.min(1, Number(game.avg_2weeks || 0) / 300) * 0.2;
  } else if (profile.preset === 'aaa') {
    score += Math.min(1, Number(game.positive || 0) / 50000) * 0.15;
  } else if (profile.preset === 'indie') {
    if (normalizeLabel((game.genres || []).join(' ')).indexOf('indie') !== -1) score += 0.25;
  }

  return Math.round(score * 10000) / 10000;
}

function confidenceLabel(game) {
  var rating = Number(game.steamRatingPercent || game.rating || game.userscore || 0);
  var reviews = Number(game.steamRatingCount || game.positive || 0);
  var discount = Number(game.savings || game.discount || 0);
  var pts = 0;
  if (rating >= 85) pts += 2; else if (rating >= 75) pts += 1;
  if (reviews >= 1000) pts += 2; else if (reviews >= 250) pts += 1;
  if (discount >= 60) pts += 1;
  if (pts >= 4) return 'High confidence';
  if (pts >= 2) return 'Moderate confidence';
  return 'Limited confidence';
}

function whyChip(game, topGenres, topTags) {
  var genres = getGenres(game);
  var tags = getTags(game);
  var savings = Math.round(Number(game.savings || game.discount || 0));
  var parts = [];
  for (var i = 0; i < genres.length; i++) {
    if (topGenres.indexOf(genres[i]) !== -1) { parts.push(genres[i]); break; }
  }
  for (var j = 0; j < tags.length; j++) {
    var tl = String(tags[j]).toLowerCase();
    for (var k = 0; k < topTags.length; k++) {
      if (tl === topTags[k].toLowerCase()) { parts.push(tags[j]); break; }
    }
    if (parts.length >= 2) break;
  }
  if (savings > 0) parts.push(savings + '% off');
  return parts.length ? parts.join(' \u00b7 ') : '';
}

function gameLink(game) {
  var dealID = safeDealID(game.dealID);
  if (dealID) return 'https://www.cheapshark.com/redirect?dealID=' + dealID;
  var app = game.steamAppID || game.appid;
  if (app) return 'https://store.steampowered.com/app/' + app;
  return '#';
}

function gameStoreName(game) {
  var entry = stores[String(game.storeID || '')];
  if (entry && entry.name) return entry.name;
  if (entry && entry.storeName) return entry.storeName;
  return game.dealID ? 'Participating store' : 'Steam';
}

function escapeAttribute(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function safeDealID(value) {
  var dealID = String(value || '');
  return /^[A-Za-z0-9%._~-]+$/.test(dealID) ? dealID : '';
}

function safeImageUrl(value) {
  try {
    var url = new URL(String(value || ''), window.location.href);
    if (url.protocol === 'https:' || (url.origin === window.location.origin && url.protocol === window.location.protocol)) {
      return url.href;
    }
  } catch (_) {
    // Fall through to the local placeholder.
  }
  return new URL('icons/icon.png', window.location.href).href;
}

function cardHtml(game, why) {
  var sale = Number(game.salePrice || game.price_usd || game.price || 0);
  var normal = Number(game.normalPrice || game.initial_price_usd || sale || 0);
  var savings = Math.round(Number(game.savings || game.discount || 0));
  var rating = Number(game.steamRatingPercent || game.rating || game.userscore || 0);
  var key = escapeAttribute(itemKey(game));
  var conf = escapeAttribute(confidenceLabel(game));
  var title = escapeAttribute(game.title || (game.rawg && game.rawg.name) || 'Title unavailable');
  var thumb = escapeAttribute(safeImageUrl(game.thumb || (game.rawg && game.rawg.backgroundImage)));
  var onSale = !!game.dealID || savings > 0;
  var badge = onSale ? ('-' + savings + '%') : 'CATALOG';
  var storeLabel = onSale ? 'On sale' : 'Catalog';
  var linkText = onSale ? 'See current deal \u2192' : 'View on Steam \u2192';
  var outboundStore = escapeAttribute(gameStoreName(game));
  var outboundLink = escapeAttribute(gameLink(game));
  var trackingAttributes = onSale
    ? ' data-track-deal data-track-surface="recommendations" data-track-store="' + outboundStore
      + '" data-track-price="' + sale + '"'
    : '';
  var priceHtml = onSale
    ? '<span class="price-old">$' + normal.toFixed(2) + '</span><span class="price-new">' + (sale === 0 ? 'Free' : '$' + sale.toFixed(2)) + '</span>'
    : '<span class="price-new">' + (sale > 0 ? '$' + sale.toFixed(2) : 'Price unavailable') + '</span>';
  var whyHtml = why ? '<div class="why-chip">' + escapeAttribute(why) + '</div>' : '';

  return '<div class="card">'
    + '<div class="card-thumb">'
    + '<img src="' + thumb + '" alt="' + title + ' cover" loading="lazy" referrerpolicy="no-referrer">'
    + '<span class="badge">' + badge + '</span>'
    + '</div>'
    + '<div class="card-body">'
    + '<div class="card-meta"><span class="store-tag">' + storeLabel + '</span><span class="rating">\u2B50 ' + (rating || 'N/A') + '%</span></div>'
    + '<div class="card-title">' + title + '</div>'
    + '<div class="confidence-chip">' + conf + '</div>'
    + whyHtml
    + '<div class="pricing">' + priceHtml + '</div>'
    + '<a class="deal-link" href="' + outboundLink + '" target="_blank" rel="noopener noreferrer sponsored"' + trackingAttributes + '>' + linkText + '</a>'
    + '<div class="card-actions" style="margin-top:8px;display:flex;gap:8px;">'
    + '<button class="feedback-btn" data-fb="like" data-id="' + key + '">More like this</button>'
    + '<button class="feedback-btn" data-fb="dislike" data-id="' + key + '">Not for me</button>'
    + '</div></div></div>';
}

function updateGenreHint() {
  var hint = document.getElementById('genreHint');
  if (!hint) return;
  if (!profile.genres.length) {
    hint.textContent = 'No genres selected. Showing matches from every genre.';
    return;
  }
  if (profile.genres.length === GENRES.length) {
    hint.textContent = 'All genres selected.';
    return;
  }
  hint.textContent = profile.genres.length === 1
    ? '1 genre selected.'
    : profile.genres.length + ' genres selected.';
}

function buildGenrePills() {
  var wrap = document.getElementById('genrePills');
  if (!wrap) return;
  wrap.innerHTML = '';
  for (var i = 0; i < GENRES.length; i++) {
    var genre = GENRES[i];
    var btn = document.createElement('button');
    btn.className = 'genre-pill' + (profile.genres.indexOf(genre) !== -1 ? ' active' : '');
    btn.type = 'button';
    btn.textContent = genre;
    btn.setAttribute('data-genre', genre);
    btn.addEventListener('click', function() {
      var g = this.getAttribute('data-genre');
      var idx = profile.genres.indexOf(g);
      if (idx !== -1) profile.genres.splice(idx, 1);
      else profile.genres.push(g);
      profile.preset = 'custom';
      var pm = document.getElementById('presetMode'); if (pm) pm.value = 'custom';
      this.classList.toggle('active');
      saveProfile();
      updateGenreHint();
      renderRecommendations();
    });
    wrap.appendChild(btn);
  }
}

function renderBecause(scored) {
  var grid = document.getElementById('becauseGrid');
  var reason = document.getElementById('becauseReason');
  if (!grid || !reason) return;
  var likedIds = Object.keys(profile.likes || {});
  if (!likedIds.length) {
    reason.textContent = 'Like a few games to make these recommendations more relevant.';
    grid.innerHTML = '';
    return;
  }
  var likedGames = catalog.filter(function(g) { return likedIds.indexOf(itemKey(g)) !== -1; });
  var gMap = {}, tMap = {};
  likedGames.forEach(function(g) {
    getGenres(g).forEach(function(x) { gMap[x] = (gMap[x] || 0) + 1; });
    getTags(g).forEach(function(x) { var k = String(x).toLowerCase(); tMap[k] = (tMap[k] || 0) + 1; });
  });
  var topG = Object.keys(gMap).sort(function(a,b) { return gMap[b] - gMap[a]; }).slice(0,3);
  var topT = Object.keys(tMap).sort(function(a,b) { return tMap[b] - tMap[a]; }).slice(0,6);

  var picks = scored
    .filter(function(x) { var k = itemKey(x.g); return !profile.likes[k] && !profile.dislikes[k]; })
    .map(function(x) {
      var gg = getGenres(x.g), tt = getTags(x.g).map(function(v){return String(v).toLowerCase();});
      var boost = gg.filter(function(v){return topG.indexOf(v)!==-1;}).length * 0.12
               + tt.filter(function(v){return topT.indexOf(v)!==-1;}).length * 0.04;
      return { g: x.g, score: x.score, blend: x.score + boost };
    })
    .sort(function(a,b){return b.blend - a.blend;})
    .slice(0, 8);

  reason.textContent = topG.length
    ? 'Your likes point to ' + topG.join(', ') + '.'
    : 'These games are related to your recent likes.';
  grid.innerHTML = picks.map(function(x) { return cardHtml(x.g, whyChip(x.g, topG, topT)); }).join('');
}

function renderRecommendations() {
  var scored = [];
  for (var i = 0; i < catalog.length; i++) {
    var s = scoreGame(catalog[i]);
    if (s > 0) scored.push({ g: catalog[i], score: s });
  }
  scored.sort(function(a,b) { return b.score - a.score; });

  var matched = [];
  for (var j = 0; j < scored.length; j++) {
    if (!profile.dislikes[itemKey(scored[j].g)]) matched.push(scored[j]);
  }
  var filtered = [];
  var familySeen = {};
  for (var m = 0; m < matched.length && filtered.length < 36; m++) {
    var fam = titleFamilyKey(matched[m].g.title || '');
    if (fam && familySeen[fam]) continue;
    if (fam) familySeen[fam] = true;
    filtered.push(matched[m]);
  }

  var grid = document.getElementById('recommendationGrid');
  var empty = document.getElementById('emptyState');
  var count = document.getElementById('recCount');

  if (!filtered.length) {
    if (grid) grid.innerHTML = '';
    if (empty) empty.style.display = 'block';
    if (count) count.textContent = '';
    renderBecause([]);
    return;
  }

  if (empty) empty.style.display = 'none';
  var label = profile.mode === 'on-sale' ? 'current deals' : 'matches';
  if (count) count.textContent = 'Showing ' + filtered.length + ' of ' + matched.length + ' ' + label;
  if (grid) grid.innerHTML = filtered.map(function(x) {
    return cardHtml(x.g, whyChip(x.g, profile.genres, profile.genres));
  }).join('');
  renderBecause(scored);
}

function openQuiz() {
  var modal = document.getElementById('quizModal');
  if (!modal) return;
  modal.style.display = 'grid';
}

function closeQuiz() {
  var modal = document.getElementById('quizModal');
  if (!modal) return;
  modal.style.display = 'none';
}

function setupQuiz() {
  var apply = document.getElementById('quizApply');
  var skip = document.getElementById('quizSkip');
  var budget = document.getElementById('quizBudget');
  var style = document.getElementById('quizStyle');
  var rating = document.getElementById('quizRating');

  if (skip) skip.addEventListener('click', function() {
    localStorage.setItem('lr_quiz_done', '1');
    closeQuiz();
  });

  if (apply) apply.addEventListener('click', function() {
    profile.budget = Number((budget && budget.value) || 70);
    profile.minRating = Number((rating && rating.value) || 0);
    applyPreset((style && style.value) || 'trending');
    profile.preset = (style && style.value) || 'trending';
    saveProfile();
    buildGenrePills();
    updateGenreHint();

    var br = document.getElementById('budgetRange');
    var bv = document.getElementById('budgetVal');
    var mr = document.getElementById('minRating');
    var pm = document.getElementById('presetMode');
    if (br) br.value = profile.budget;
    if (bv) bv.textContent = '$' + profile.budget;
    if (mr) mr.value = String(profile.minRating);
    if (pm) pm.value = profile.preset;

    renderRecommendations();
    localStorage.setItem('lr_quiz_done', '1');
    closeQuiz();
  });

  if (!localStorage.getItem('lr_quiz_done')) {
    setTimeout(openQuiz, 650);
  }
}

function bindControls() {
  var budgetRange = document.getElementById('budgetRange');
  var budgetVal = document.getElementById('budgetVal');
  var minRating = document.getElementById('minRating');
  var minDiscount = document.getElementById('minDiscount');
  var recMode = document.getElementById('recMode');
  var popularityMin = document.getElementById('popularityMin');
  var presetMode = document.getElementById('presetMode');
  var genreMatchMode = document.getElementById('genreMatchMode');
  var selectAllGenres = document.getElementById('selectAllGenres');
  var clearGenres = document.getElementById('clearGenres');
  var launchQuiz = document.getElementById('launchQuiz');

  reflectProfileInControls();

  if (budgetRange) budgetRange.addEventListener('input', function() {
    profile.budget = parseInt(budgetRange.value, 10);
    profile.preset = 'custom'; if (presetMode) presetMode.value = 'custom';
    budgetVal.textContent = '$' + profile.budget;
    saveProfile(); renderRecommendations();
  });
  if (minRating) minRating.addEventListener('change', function() {
    profile.minRating = parseInt(minRating.value, 10);
    profile.preset = 'custom'; if (presetMode) presetMode.value = 'custom';
    saveProfile(); renderRecommendations();
  });
  if (minDiscount) minDiscount.addEventListener('change', function() {
    profile.minDiscount = parseInt(minDiscount.value, 10);
    profile.preset = 'custom'; if (presetMode) presetMode.value = 'custom';
    saveProfile(); renderRecommendations();
  });
  if (recMode) recMode.addEventListener('change', function() {
    profile.mode = recMode.value;
    profile.preset = 'custom';
    if (presetMode) presetMode.value = 'custom';
    saveProfile(); renderRecommendations();
  });
  if (popularityMin) popularityMin.addEventListener('change', function() {
    profile.popularityMin = Number(popularityMin.value || 0);
    profile.preset = 'custom'; if (presetMode) presetMode.value = 'custom';
    saveProfile(); renderRecommendations();
  });
  if (presetMode) presetMode.addEventListener('change', function() {
    applyPreset(presetMode.value);
    if (budgetRange) budgetRange.value = profile.budget;
    if (budgetVal) budgetVal.textContent = '$' + profile.budget;
    if (minRating) minRating.value = String(profile.minRating);
    if (minDiscount) minDiscount.value = String(profile.minDiscount);
    if (recMode) recMode.value = profile.mode;
    if (popularityMin) popularityMin.value = String(profile.popularityMin || 0);
    saveProfile(); buildGenrePills(); updateGenreHint(); renderRecommendations();
  });
  if (genreMatchMode) genreMatchMode.addEventListener('change', function() {
    profile.genreMatchMode = genreMatchMode.value;
    saveProfile(); renderRecommendations();
  });
  if (selectAllGenres) selectAllGenres.addEventListener('click', function() {
    profile.genres = GENRES.slice();
    profile.preset = 'custom'; if (presetMode) presetMode.value = 'custom';
    saveProfile(); buildGenrePills(); updateGenreHint(); renderRecommendations();
  });
  if (clearGenres) clearGenres.addEventListener('click', function() {
    profile.genres = [];
    profile.preset = 'custom'; if (presetMode) presetMode.value = 'custom';
    saveProfile(); buildGenrePills(); updateGenreHint(); renderRecommendations();
  });
  if (launchQuiz) launchQuiz.addEventListener('click', function() { openQuiz(); });

  var saveBtn = document.getElementById('savePrefs');
  if (saveBtn) saveBtn.addEventListener('click', function() {
    saveProfile();
    alert(accountUser ? 'Changes saved. Account sync will continue in the background.' : 'Preferences saved on this device.');
  });

  var resetBtn = document.getElementById('resetPrefs');
  if (resetBtn) resetBtn.addEventListener('click', function() {
    if (!confirm('Reset your saved preferences?')) return;
    profile = freshDefaultProfile();
    saveProfile(); reflectProfileInControls(); buildGenrePills(); renderRecommendations();
  });

  document.addEventListener('click', function(e) {
    var dealLink = e.target.closest('[data-track-deal]');
    if (dealLink && window.LootRadarAnalytics) {
      window.LootRadarAnalytics.track('deal_click', {
        surface: dealLink.dataset.trackSurface,
        store: dealLink.dataset.trackStore,
        priceBucket: window.LootRadarAnalytics.priceBucket(dealLink.dataset.trackPrice)
      });
    }

    var btn = e.target.closest('.feedback-btn');
    if (!btn) return;
    var id = btn.dataset.id, type = btn.dataset.fb;
    if (!id || (type !== 'like' && type !== 'dislike')) return;
    var feedbackTimestamp = new Date().toISOString();
    if (type === 'like') { profile.likes[id] = feedbackTimestamp; delete profile.dislikes[id]; }
    else { profile.dislikes[id] = feedbackTimestamp; delete profile.likes[id]; }
    if (window.LootRadarAnalytics) {
      window.LootRadarAnalytics.track(type === 'like' ? 'recommendation_like' : 'recommendation_skip', {
        surface: 'recommendations',
        action: type,
        signedIn: Boolean(accountUser)
      });
    }
    saveProfile(true); renderRecommendations();
  });
}

function init() {
  initAccountSync();
  var v = Math.floor(Date.now() / 3600000);

  // Load enriched deals first, fallback to plain deals
  var dealsPromise = fetch('enriched-deals.json?v=' + v)
      .then(function(r) { return r.ok ? r.json() : null; })
      .catch(function() { return null; })
      .then(function(enriched) {
        if (enriched && enriched.games && enriched.games.length) {
          stores = enriched.stores || {};
          deals = enriched.games.map(function(d) {
            return Object.assign({}, d, {
              steamAppID: d.steamAppID || d.appid,
              title: (d.rawg && d.rawg.name) || d.title
            });
          });
        } else {
          return fetch('deals.json?v=' + v).then(function(r) { return r.json(); }).then(function(data) {
            stores = data.stores || {};
            deals = (data.deals || []).map(function(d) {
              return Object.assign({}, d, { steamAppID: d.steamAppID || d.appid });
            });
          });
        }
      });

  // Load umbrella catalog
  var catalogPromise = fetch('games-catalog.json?v=' + v)
      .then(function(r) { return r.ok ? r.json() : null; })
      .catch(function() { return null; });

  Promise.all([dealsPromise, catalogPromise]).then(function(results) {
      var catData = results[1];

      if (catData && catData.games && catData.games.length) {
        var dealByApp = {};
        deals.forEach(function(d) {
          var app = String(d.steamAppID || d.appid || '');
          if (app && !dealByApp[app]) dealByApp[app] = d;
        });
        catalog = catData.games.map(function(g) {
          var app = String(g.appid || '');
          var deal = dealByApp[app];
          return deal ? Object.assign({}, g, deal, { steamAppID: app }) : Object.assign({}, g, { steamAppID: app });
        });
      }

      if (!catalog.length) catalog = deals;

      console.log('LootRadar: loaded ' + catalog.length + ' games, ' + deals.length + ' deals');
      bindControls();
      buildGenrePills();
      renderRecommendations();
      setupQuiz();
  }).catch(function(err) {
      console.error('LootRadar init error:', err);
      var empty = document.getElementById('emptyState');
      if (empty) {
        empty.style.display = 'block';
        empty.innerHTML = '<p>Recommendations could not be loaded. Please refresh the page.</p>';
      }
  });
}

init();
