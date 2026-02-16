// LootRadar \u2014 Game Deal Aggregator
// CheapShark API (free, no key)

const API = 'https://www.cheapshark.com/api/1.0';

// Dynamic store map populated from API
let STORE_MAP = {};
let ACTIVE_STORE_IDS = [];
let checkedStores = new Set();

let allDeals = [];
let sort = 'discount';
let maxPrice = 60;
let minDiscount = 0;
let minRating = 0;

// --- Init ---
async function init() {
    document.getElementById('loading').style.display = 'block';

    try {
        const storesRes = await fetch(`${API}/stores`);
        const storesData = await storesRes.json();

        storesData.forEach(s => {
            if (s.isActive === 1) {
                STORE_MAP[s.storeID] = {
                    name: s.storeName,
                    icon: `https://www.cheapshark.com/img/stores/icons/${parseInt(s.storeID) - 1}.png`
                };
            }
        });
        ACTIVE_STORE_IDS = Object.keys(STORE_MAP);

        // All checked by default
        ACTIVE_STORE_IDS.forEach(id => checkedStores.add(id));

        buildStorePanel();
        await fetchDeals();
    } catch (e) {
        console.error('Init failed:', e);
        document.getElementById('deals').innerHTML = '<p class="no-results">Failed to load deals. Try refreshing.</p>';
        document.getElementById('loading').style.display = 'none';
    }
}

function buildStorePanel() {
    const list = document.getElementById('storeCheckboxes');
    list.innerHTML = '';

    ACTIVE_STORE_IDS.forEach(id => {
        const store = STORE_MAP[id];
        const label = document.createElement('label');
        label.className = 'store-cb-item';
        label.innerHTML =
            `<input type="checkbox" value="${id}" checked>` +
            `<img src="${store.icon}" alt="" onerror="this.style.display='none'">` +
            `<span>${store.name}</span>`;
        const cb = label.querySelector('input');
        cb.addEventListener('change', () => {
            if (cb.checked) checkedStores.add(id); else checkedStores.delete(id);
            updateSelectAllState();
            updateStoreCount();
            render();
        });
        list.appendChild(label);
    });

    updateStoreCount();

    // Select All toggle
    const selAll = document.getElementById('storeSelectAll');
    selAll.checked = true;
    selAll.addEventListener('change', () => {
        const checked = selAll.checked;
        list.querySelectorAll('input[type="checkbox"]').forEach(cb => { cb.checked = checked; });
        if (checked) ACTIVE_STORE_IDS.forEach(id => checkedStores.add(id));
        else checkedStores.clear();
        updateStoreCount();
        render();
    });

    // Toggle panel open/close
    const toggle = document.getElementById('storePanelToggle');
    const body = document.getElementById('storePanelBody');
    toggle.addEventListener('click', () => {
        body.classList.toggle('open');
        toggle.classList.toggle('open');
    });

    // Close when clicking outside
    document.addEventListener('click', (e) => {
        if (!e.target.closest('.store-panel')) {
            body.classList.remove('open');
            toggle.classList.remove('open');
        }
    });
}

function updateStoreCount() {
    const el = document.getElementById('storeCount');
    if (el) {
        if (checkedStores.size === ACTIVE_STORE_IDS.length) {
            el.textContent = 'All';
        } else {
            el.textContent = `${checkedStores.size}/${ACTIVE_STORE_IDS.length}`;
        }
    }
}

function updateSelectAllState() {
    const selAll = document.getElementById('storeSelectAll');
    selAll.checked = checkedStores.size === ACTIVE_STORE_IDS.length;
    selAll.indeterminate = checkedStores.size > 0 && checkedStores.size < ACTIVE_STORE_IDS.length;
}

async function fetchDeals() {
    document.getElementById('loading').style.display = 'block';

    try {
        const results = await Promise.all(
            ACTIVE_STORE_IDS.map(id =>
                fetch(`${API}/deals?storeID=${id}&upperPrice=60&pageSize=40&sortBy=Deal+Rating`)
                    .then(r => r.json()).catch(() => [])
            )
        );

        allDeals = results.flat().map(d => ({
            title: d.title,
            sale: parseFloat(d.salePrice),
            normal: parseFloat(d.normalPrice),
            savings: Math.round(parseFloat(d.savings)),
            storeID: d.storeID,
            dealID: d.dealID,
            thumb: d.thumb,
            steamAppID: d.steamAppID,
            metacritic: parseInt(d.metacriticScore) || 0,
            steamRating: parseInt(d.steamRatingPercent) || 0,
            steamReviews: parseInt(d.steamRatingCount) || 0,
            dealRating: parseFloat(d.dealRating) || 0,
        }));

        // Dedupe \u2014 keep best deal per title
        const map = {};
        allDeals.forEach(d => {
            if (!map[d.title] || d.savings > map[d.title].savings) map[d.title] = d;
        });
        allDeals = Object.values(map);

        updateStats();

        const now = new Date();
        document.getElementById('lastUpdated').textContent =
            `Last updated: ${now.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })} at ${now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}`;
    } catch (e) {
        console.error('Fetch failed:', e);
        document.getElementById('deals').innerHTML = '<p class="no-results">Failed to load deals. Try refreshing.</p>';
    }

    document.getElementById('loading').style.display = 'none';
    render();
}

// --- Stats ---
function updateStats() {
    const active = allDeals.filter(d => d.savings > 0);
    const best = Math.max(...allDeals.map(d => d.savings), 0);
    const hasFree = allDeals.some(d => d.sale === 0);
    const paid = allDeals.filter(d => d.sale > 0);
    const lowest = paid.length ? Math.min(...paid.map(d => d.sale)) : 0;

    document.getElementById('statDeals').textContent = active.length.toLocaleString();
    document.getElementById('statDiscount').textContent = `-${best}%`;
    document.getElementById('statLowest').textContent = hasFree ? 'Free!' : `$${lowest.toFixed(2)}`;
}

// --- Thumbnail ---
function getThumb(d) {
    if (d.steamAppID && d.steamAppID !== '0' && d.steamAppID !== null)
        return `https://cdn.cloudflare.steamstatic.com/steam/apps/${d.steamAppID}/header.jpg`;
    return d.thumb || '';
}

// --- Rating dot ---
function ratingDot(pct) {
    if (!pct) return '';
    if (pct >= 90) return '\u{1F7E2}';
    if (pct >= 70) return '\u{1F7E1}';
    return '\u{1F534}';
}

// --- Build Card ---
function buildCard(d) {
    const store = STORE_MAP[d.storeID] || { name: '?', icon: '' };
    const thumb = getThumb(d);
    const free = d.sale === 0;

    let ratingHTML = '';
    if (d.steamRating > 0) ratingHTML = `<span class="rating">${ratingDot(d.steamRating)} ${d.steamRating}%</span>`;
    else if (d.metacritic > 0) ratingHTML = `<span class="rating">\u2B50 ${d.metacritic}</span>`;

    let reviewsHTML = '';
    if (d.steamReviews > 0) {
        const c = d.steamReviews >= 1000 ? `${(d.steamReviews / 1000).toFixed(1)}k` : d.steamReviews;
        reviewsHTML = `<span class="reviews">${c} reviews</span>`;
    }

    const storeIconHTML = store.icon ? `<img class="store-icon" src="${store.icon}" alt="" onerror="this.style.display='none'">` : '';

    return `
    <div class="card">
        <div class="card-thumb">
            <img src="${thumb}" alt="${d.title}" loading="lazy" onerror="this.style.display='none'">
            <span class="badge${free ? ' free' : ''}">${free ? 'FREE' : `-${d.savings}%`}</span>
        </div>
        <div class="card-body">
            <div class="card-meta">
                <span class="store-tag">${storeIconHTML} ${store.name}</span>
                <div>${ratingHTML}${reviewsHTML}</div>
            </div>
            <div class="card-title">${d.title}</div>
            <div class="pricing">
                ${free
                    ? '<span class="price-free">\u{1F381} Free to Keep</span>'
                    : `<span class="price-old">$${d.normal.toFixed(2)}</span><span class="price-new">$${d.sale.toFixed(2)}</span>`
                }
            </div>
            <a class="deal-link" href="https://www.cheapshark.com/redirect?dealID=${d.dealID}" target="_blank" rel="noopener noreferrer">View Deal \u2192</a>
        </div>
    </div>`;
}

// --- Filter & Sort ---
function filterDeals(deals) {
    const q = document.getElementById('searchInput').value.toLowerCase();
    return deals.filter(d => {
        if (!STORE_MAP[d.storeID]) return false;
        if (!checkedStores.has(d.storeID)) return false;
        if (q && !d.title.toLowerCase().includes(q)) return false;
        if (d.savings <= 0) return false;
        if (d.sale > maxPrice && maxPrice < 60) return false;
        if (d.savings < minDiscount) return false;
        if (minRating > 0 && d.steamRating < minRating && d.metacritic < minRating) return false;
        return true;
    });
}

function sortDeals(deals) {
    const s = [...deals];
    switch (sort) {
        case 'discount':  s.sort((a, b) => b.savings - a.savings); break;
        case 'price':     s.sort((a, b) => a.sale - b.sale); break;
        case 'rating':    s.sort((a, b) => (b.steamRating || b.metacritic) - (a.steamRating || a.metacritic)); break;
        case 'popular':   s.sort((a, b) => b.steamReviews - a.steamReviews); break;
        case 'metacritic': s.sort((a, b) => b.metacritic - a.metacritic); break;
        case 'name':      s.sort((a, b) => a.title.localeCompare(b.title)); break;
    }
    return s;
}

// --- Render ---
function render() {
    const featuredEl = document.getElementById('featuredSection');
    const featuredGrid = document.getElementById('featuredDeals');
    const allEl = document.getElementById('allSection');
    const allGrid = document.getElementById('deals');
    const noRes = document.getElementById('noResults');
    const countEl = document.getElementById('resultCount');
    const q = document.getElementById('searchInput').value.toLowerCase();

    let filtered = sortDeals(filterDeals(allDeals));

    if (countEl) countEl.textContent = `${filtered.length} deal${filtered.length !== 1 ? 's' : ''} found`;

    if (!filtered.length) {
        featuredEl.style.display = 'none';
        allEl.style.display = 'none';
        noRes.style.display = 'block';
        return;
    }

    noRes.style.display = 'none';

    // Featured section: free + 90%+ off (only on default view)
    if (!q && sort === 'discount' && !minDiscount && !minRating) {
        const feat = filtered.filter(d => d.sale === 0 || d.savings >= 90);
        const rest = filtered.filter(d => d.sale !== 0 && d.savings < 90);

        if (feat.length) {
            featuredEl.style.display = 'block';
            featuredGrid.innerHTML = feat.map(buildCard).join('');
        } else {
            featuredEl.style.display = 'none';
        }

        allEl.style.display = 'block';
        allGrid.innerHTML = (rest.length ? rest : filtered).map(buildCard).join('');
    } else {
        featuredEl.style.display = 'none';
        allEl.style.display = 'block';
        allGrid.innerHTML = filtered.map(buildCard).join('');
    }
}

// --- Events ---
let searchTimer;
document.getElementById('searchInput').addEventListener('input', () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(render, 200);
});

document.getElementById('sortSelect').addEventListener('change', e => {
    sort = e.target.value;
    render();
});

document.getElementById('priceRange').addEventListener('input', e => {
    maxPrice = parseInt(e.target.value);
    document.getElementById('priceVal').textContent = maxPrice >= 60 ? 'Any' : `$${maxPrice}`;
    render();
});

document.getElementById('discountRange').addEventListener('input', e => {
    minDiscount = parseInt(e.target.value);
    document.getElementById('discountVal').textContent = minDiscount === 0 ? 'Any' : `${minDiscount}%+`;
    render();
});

document.getElementById('ratingSelect').addEventListener('change', e => {
    minRating = parseInt(e.target.value);
    render();
});

// --- Go ---
init();
