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
  genres: ['RPG','Action','Indie'], likes: {}, dislikes: {}
};
const STORAGE_KEY = 'lr_rec_profile_v3';

var stores = {};
var deals = [];
var catalog = [];
var supabase = null;
var authedUserId = null;
var profile = loadProfile();

function loadProfile() {
  try {
    var saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (saved && typeof saved === 'object') {
      return Object.assign({}, DEFAULT_PROFILE, saved);
    }
  } catch(e) { /* ignore */ }
  return Object.assign({}, DEFAULT_PROFILE);
}

function saveProfile() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(profile));
  if (supabase && authedUserId) {
    supabase.from('lr_profiles').upsert({
      user_id: authedUserId, data: profile, updated_at: new Date().toISOString()
    }).then(function(){}).catch(function(){});
  }
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

function hasGenreMatch(gameGenres, selectedGenres) {
  if (!selectedGenres || !selectedGenres.length) return true;
  var gs = gameGenres.map(normalizeLabel);
  for (var i = 0; i < selectedGenres.length; i++) {
    if (gs.indexOf(normalizeLabel(selectedGenres[i])) !== -1) return true;
  }
  return false;
}

function getTags(game) {
  return (game.rawg && game.rawg.tags) || game.tags || inferGenres(game.title || '');
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
  if (profile.mode === 'on-sale' && !isOnSale) return -999;

  var genres = getGenres(game);
  if (!hasGenreMatch(genres, profile.genres)) return -999;

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
  if (pts >= 4) return 'High';
  if (pts >= 2) return 'Medium';
  return 'Low';
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
  if (game.dealID) return 'https://www.cheapshark.com/redirect?dealID=' + encodeURIComponent(game.dealID);
  var app = game.steamAppID || game.appid;
  if (app) return 'https://store.steampowered.com/app/' + app;
  return '#';
}

function cardHtml(game, why) {
  var sale = Number(game.salePrice || game.price_usd || game.price || 0);
  var normal = Number(game.normalPrice || game.initial_price_usd || sale || 0);
  var savings = Math.round(Number(game.savings || game.discount || 0));
  var rating = Number(game.steamRatingPercent || game.rating || game.userscore || 0);
  var key = itemKey(game);
  var conf = confidenceLabel(game);
  var title = game.title || (game.rawg && game.rawg.name) || 'Untitled';
  var thumb = game.thumb || (game.rawg && game.rawg.backgroundImage) || 'icons/icon.png';
  var onSale = !!game.dealID || savings > 0;
  var badge = onSale ? ('-' + savings + '%') : 'REC';
  var storeLabel = onSale ? 'On Sale' : 'Catalog';
  var linkText = onSale ? 'View Deal \u2192' : 'View on Steam \u2192';
  var priceHtml = onSale
    ? '<span class="price-old">$' + normal.toFixed(2) + '</span><span class="price-new">$' + sale.toFixed(2) + '</span>'
    : '<span class="price-new">' + (sale > 0 ? '$' + sale.toFixed(2) : 'Free / N/A') + '</span>';
  var whyHtml = why ? '<div class="why-chip">' + why + '</div>' : '';

  return '<div class="card">'
    + '<div class="card-thumb">'
    + '<img src="' + thumb + '" alt="' + title.replace(/"/g,'&quot;') + '" loading="lazy" referrerpolicy="no-referrer" onerror="this.src=\'icons/icon.png\'">'
    + '<span class="badge">' + badge + '</span>'
    + '</div>'
    + '<div class="card-body">'
    + '<div class="card-meta"><span class="store-tag">' + storeLabel + '</span><span class="rating">\u2B50 ' + (rating || 'N/A') + '%</span></div>'
    + '<div class="card-title">' + title + '</div>'
    + '<div class="confidence-chip">' + conf + '</div>'
    + whyHtml
    + '<div class="pricing">' + priceHtml + '</div>'
    + '<a class="deal-link" href="' + gameLink(game) + '" target="_blank" rel="noopener noreferrer">' + linkText + '</a>'
    + '<div class="card-actions" style="margin-top:8px;display:flex;gap:8px;">'
    + '<button class="feedback-btn" data-fb="like" data-id="' + key + '">\uD83D\uDC4D Like</button>'
    + '<button class="feedback-btn" data-fb="dislike" data-id="' + key + '">\uD83D\uDC4E Skip</button>'
    + '</div></div></div>';
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
      this.classList.toggle('active');
      saveProfile();
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
    reason.textContent = 'Like a few games and this section will learn your taste.';
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

  reason.textContent = 'Based on your likes in: ' + (topG.join(', ') || 'your favorites') + '.';
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
  var filtered = matched.slice(0, 36);

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
  var label = profile.mode === 'on-sale' ? 'on-sale deals' : 'recommendations';
  if (count) count.textContent = 'Showing ' + filtered.length + ' of ' + matched.length + ' ' + label;
  if (grid) grid.innerHTML = filtered.map(function(x) {
    return cardHtml(x.g, whyChip(x.g, profile.genres, profile.genres));
  }).join('');
  renderBecause(scored);
}

function bindControls() {
  var budgetRange = document.getElementById('budgetRange');
  var budgetVal = document.getElementById('budgetVal');
  var minRating = document.getElementById('minRating');
  var minDiscount = document.getElementById('minDiscount');
  var recMode = document.getElementById('recMode');

  if (budgetRange) { budgetRange.value = profile.budget; budgetVal.textContent = '$' + profile.budget; }
  if (minRating) minRating.value = String(profile.minRating);
  if (minDiscount) minDiscount.value = String(profile.minDiscount);
  if (recMode) recMode.value = profile.mode || 'all';

  if (budgetRange) budgetRange.addEventListener('input', function() {
    profile.budget = parseInt(budgetRange.value, 10);
    budgetVal.textContent = '$' + profile.budget;
    saveProfile(); renderRecommendations();
  });
  if (minRating) minRating.addEventListener('change', function() {
    profile.minRating = parseInt(minRating.value, 10);
    saveProfile(); renderRecommendations();
  });
  if (minDiscount) minDiscount.addEventListener('change', function() {
    profile.minDiscount = parseInt(minDiscount.value, 10);
    saveProfile(); renderRecommendations();
  });
  if (recMode) recMode.addEventListener('change', function() {
    profile.mode = recMode.value;
    saveProfile(); renderRecommendations();
  });

  var saveBtn = document.getElementById('savePrefs');
  if (saveBtn) saveBtn.addEventListener('click', function() { saveProfile(); alert('Preferences saved.'); });

  var resetBtn = document.getElementById('resetPrefs');
  if (resetBtn) resetBtn.addEventListener('click', function() {
    if (!confirm('Reset your recommendation profile?')) return;
    profile = Object.assign({}, DEFAULT_PROFILE);
    saveProfile(); bindControls(); buildGenrePills(); renderRecommendations();
  });

  document.addEventListener('click', function(e) {
    var btn = e.target.closest('.feedback-btn');
    if (!btn) return;
    var id = btn.dataset.id, type = btn.dataset.fb;
    if (!id || !type) return;
    if (type === 'like') { profile.likes[id] = true; delete profile.dislikes[id]; }
    else { profile.dislikes[id] = true; delete profile.likes[id]; }
    if (supabase && authedUserId) {
      supabase.from('lr_feedback').upsert({
        user_id: authedUserId, item_id: id, action: type,
        updated_at: new Date().toISOString()
      }).then(function(){}).catch(function(){});
    }
    saveProfile(); renderRecommendations();
  });
}

function initAuth() {
  var statusEl = document.getElementById('authStatus');
  var signOutBtn = document.getElementById('authSignOut');
  var loginBtn = document.getElementById('authLoginPage');

  function setGuest() {
    authedUserId = null;
    if (statusEl) statusEl.textContent = 'Guest mode (local only)';
    if (signOutBtn) signOutBtn.style.display = 'none';
    if (loginBtn) loginBtn.style.display = '';
  }

  function setSignedIn(user) {
    authedUserId = user.id;
    if (statusEl) statusEl.textContent = 'Signed in: ' + (user.email || 'account');
    if (signOutBtn) signOutBtn.style.display = 'inline-block';
    if (loginBtn) loginBtn.style.display = 'none';
  }

  if (!window.supabase || !window.LR_SUPABASE_URL || !window.LR_SUPABASE_ANON_KEY) {
    setGuest();
    return Promise.resolve();
  }

  try {
    supabase = window.supabase.createClient(window.LR_SUPABASE_URL, window.LR_SUPABASE_ANON_KEY);
  } catch(e) {
    console.warn('Supabase init failed:', e);
    setGuest();
    return Promise.resolve();
  }

  if (signOutBtn) {
    signOutBtn.addEventListener('click', function() {
      supabase.auth.signOut().then(function() { setGuest(); });
    });
  }

  // Auth check with 3-second timeout so it never blocks rendering
  return new Promise(function(resolve) {
    var done = false;
    var timer = setTimeout(function() {
      if (!done) { done = true; setGuest(); resolve(); }
    }, 3000);

    supabase.auth.getSession().then(function(result) {
      if (done) return;
      done = true; clearTimeout(timer);
      var session = result && result.data && result.data.session;
      if (session && session.user) {
        setSignedIn(session.user);
        // Try loading cloud profile (non-blocking)
        supabase.from('lr_profiles').select('data')
          .eq('user_id', session.user.id).single()
          .then(function(res) {
            if (res.data && res.data.data) {
              profile = Object.assign({}, DEFAULT_PROFILE, res.data.data);
              localStorage.setItem(STORAGE_KEY, JSON.stringify(profile));
            }
          }).catch(function(){});
      } else {
        setGuest();
      }
      resolve();
    }).catch(function(e) {
      if (done) return;
      done = true; clearTimeout(timer);
      console.warn('Auth check failed:', e);
      setGuest();
      resolve();
    });
  });
}

function init() {
  initAuth().then(function() {
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
    }).catch(function(err) {
      console.error('LootRadar init error:', err);
      var empty = document.getElementById('emptyState');
      if (empty) {
        empty.style.display = 'block';
        empty.innerHTML = '<p>Could not load recommendations. Please refresh.</p>';
      }
    });
  });
}

init();
