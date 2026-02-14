// LootRadar - Professional Game Deal Aggregator
// Uses CheapShark API (free, no key needed)

const CHEAPSHARK_API = 'https://www.cheapshark.com/api/1.0';

const STORE_MAP = {
    '1':  { name: 'Steam',  class: 'steam',  key: 'steam' },
    '25': { name: 'Epic',   class: 'epic',   key: 'epic' },
    '7':  { name: 'GOG',    class: 'gog',    key: 'gog' },
    '11': { name: 'Humble', class: 'humble', key: 'humble' },
};

const STORE_IDS = Object.keys(STORE_MAP);

let allDeals = [];
let currentFilter = 'all';
let currentSort = 'discount';
let maxPrice = 50;
let minDiscount = 0;
let minRating = 0;

async function fetchDeals() {
    const loading = document.getElementById('loading');
    loading.style.display = 'block';

    try {
        const promises = STORE_IDS.map(storeID =>
            fetch(`${CHEAPSHARK_API}/deals?storeID=${storeID}&upperPrice=60&pageSize=40&sortBy=Deal+Rating`)
                .then(r => r.json())
                .catch(() => [])
        );

        const results = await Promise.all(promises);
        allDeals = results.flat().map(deal => ({
            title: deal.title,
            salePrice: parseFloat(deal.salePrice),
            normalPrice: parseFloat(deal.normalPrice),
            savings: Math.round(parseFloat(deal.savings)),
            storeID: deal.storeID,
            dealID: deal.dealID,
            thumb: deal.thumb,
            steamAppID: deal.steamAppID,
            metacriticScore: parseInt(deal.metacriticScore) || 0,
            steamRatingPercent: parseInt(deal.steamRatingPercent) || 0,
            steamRatingCount: parseInt(deal.steamRatingCount) || 0,
            dealRating: parseFloat(deal.dealRating) || 0,
        }));

        // Dedupe by title (keep best deal)
        const seen = {};
        allDeals.forEach(d => {
            if (!seen[d.title] || d.savings > seen[d.title].savings) {
                seen[d.title] = d;
            }
        });
        allDeals = Object.values(seen);

        updateStats();

        const now = new Date();
        document.getElementById('lastUpdated').textContent =
            `Last updated: ${now.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })} at ${now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}`;
    } catch (err) {
        console.error('Failed to fetch deals:', err);
        document.getElementById('deals').innerHTML =
            '<p class="no-results">Failed to load deals. Please try refreshing the page.</p>';
    }

    loading.style.display = 'none';
    renderDeals();
}

function updateStats() {
    const active = allDeals.filter(d => d.savings > 0);
    const totalDeals = active.length;
    const bestDiscount = Math.max(...allDeals.map(d => d.savings), 0);
    const freeGames = allDeals.filter(d => d.salePrice === 0).length;

    document.getElementById('totalDeals').textContent = totalDeals.toLocaleString();
    document.getElementById('bestDiscount').textContent = `-${bestDiscount}%`;
    document.getElementById('freeGames').textContent = freeGames;
}

function getThumbURL(deal) {
    if (deal.steamAppID && deal.steamAppID !== '0' && deal.steamAppID !== null) {
        return `https://cdn.cloudflare.steamstatic.com/steam/apps/${deal.steamAppID}/header.jpg`;
    }
    return deal.thumb || '';
}

function getRatingStars(percent) {
    if (!percent || percent === 0) return '';
    if (percent >= 90) return '🟢';
    if (percent >= 70) return '🟡';
    return '🔴';
}

function buildCard(deal) {
    const store = STORE_MAP[deal.storeID] || { name: 'Unknown', class: 'steam' };
    const thumbURL = getThumbURL(deal);
    const isFree = deal.salePrice === 0;

    const badgeClass = isFree ? 'discount-badge free' : 'discount-badge';
    const badgeText = isFree ? 'FREE' : `-${deal.savings}%`;

    const priceHTML = isFree
        ? '<span class="free-tag">🎁 Free to Keep</span>'
        : `<span class="original-price">$${deal.normalPrice.toFixed(2)}</span>
           <span class="sale-price">$${deal.salePrice.toFixed(2)}</span>`;

    // Rating display
    let ratingHTML = '';
    if (deal.steamRatingPercent > 0) {
        const dot = getRatingStars(deal.steamRatingPercent);
        ratingHTML = `<span class="rating">${dot} ${deal.steamRatingPercent}%</span>`;
    } else if (deal.metacriticScore > 0) {
        ratingHTML = `<span class="rating">⭐ ${deal.metacriticScore}</span>`;
    }

    // Review count
    let reviewsHTML = '';
    if (deal.steamRatingCount > 0) {
        const count = deal.steamRatingCount >= 1000
            ? `${(deal.steamRatingCount / 1000).toFixed(1)}k`
            : deal.steamRatingCount;
        reviewsHTML = `<span class="reviews">${count} reviews</span>`;
    }

    return `
        <div class="deal-card">
            <div class="thumb-wrapper">
                <img class="thumb" src="${thumbURL}" alt="${deal.title}" loading="lazy" onerror="this.parentElement.style.background='linear-gradient(135deg, #111720, #0c1015)'">
                <span class="${badgeClass}">${badgeText}</span>
            </div>
            <div class="card-body">
                <div class="card-meta">
                    <span class="store-tag store-${store.class}">${store.name}</span>
                    <div class="card-meta-right">
                        ${ratingHTML}
                        ${reviewsHTML}
                    </div>
                </div>
                <div class="title">${deal.title}</div>
                <div class="pricing">
                    ${priceHTML}
                </div>
                <a class="deal-link" href="https://www.cheapshark.com/redirect?dealID=${deal.dealID}" target="_blank" rel="noopener noreferrer">
                    View Deal →
                </a>
            </div>
        </div>
    `;
}

function applyFilters(deals) {
    const searchTerm = document.getElementById('searchInput').value.toLowerCase();

    return deals.filter(d => {
        const storeInfo = STORE_MAP[d.storeID];
        if (!storeInfo) return false;
        if (currentFilter !== 'all' && storeInfo.key !== currentFilter) return false;
        if (searchTerm && !d.title.toLowerCase().includes(searchTerm)) return false;
        if (d.savings <= 0) return false;
        if (d.salePrice > maxPrice && maxPrice < 60) return false;
        if (d.savings < minDiscount) return false;
        if (minRating > 0 && d.steamRatingPercent < minRating && d.metacriticScore < minRating) return false;
        return true;
    });
}

function applySorting(deals) {
    const sorted = [...deals];
    switch (currentSort) {
        case 'discount':
            sorted.sort((a, b) => b.savings - a.savings);
            break;
        case 'price':
            sorted.sort((a, b) => a.salePrice - b.salePrice);
            break;
        case 'price-high':
            sorted.sort((a, b) => b.salePrice - a.salePrice);
            break;
        case 'rating':
            sorted.sort((a, b) => {
                const rA = a.steamRatingPercent || a.metacriticScore || 0;
                const rB = b.steamRatingPercent || b.metacriticScore || 0;
                return rB - rA;
            });
            break;
        case 'popular':
            sorted.sort((a, b) => b.steamRatingCount - a.steamRatingCount);
            break;
        case 'metacritic':
            sorted.sort((a, b) => b.metacriticScore - a.metacriticScore);
            break;
        case 'name':
            sorted.sort((a, b) => a.title.localeCompare(b.title));
            break;
    }
    return sorted;
}

function renderDeals() {
    const featuredSection = document.getElementById('featuredSection');
    const featuredGrid = document.getElementById('featuredDeals');
    const allSection = document.getElementById('allSection');
    const allGrid = document.getElementById('deals');
    const noResults = document.getElementById('noResults');
    const resultCount = document.getElementById('resultCount');
    const searchTerm = document.getElementById('searchInput').value.toLowerCase();

    let filtered = applyFilters(allDeals);
    filtered = applySorting(filtered);

    // Update result count
    if (resultCount) {
        resultCount.textContent = `${filtered.length} deal${filtered.length !== 1 ? 's' : ''} found`;
    }

    if (filtered.length === 0) {
        featuredSection.style.display = 'none';
        allSection.style.display = 'none';
        noResults.style.display = 'block';
        return;
    }

    noResults.style.display = 'none';

    // Split: featured (free games + 90%+ off) vs rest — only on default sort with no search
    if (!searchTerm && currentSort === 'discount' && minDiscount === 0 && minRating === 0) {
        const featured = filtered.filter(d => d.salePrice === 0 || d.savings >= 90);
        const rest = filtered.filter(d => d.salePrice !== 0 && d.savings < 90);

        if (featured.length > 0) {
            featuredSection.style.display = 'block';
            featuredGrid.innerHTML = featured.map(buildCard).join('');
        } else {
            featuredSection.style.display = 'none';
        }

        allSection.style.display = 'block';
        allGrid.innerHTML = (rest.length > 0 ? rest : filtered).map(buildCard).join('');
    } else {
        featuredSection.style.display = 'none';
        allSection.style.display = 'block';
        allGrid.innerHTML = filtered.map(buildCard).join('');
    }
}

// === Event Listeners ===

// Debounced search
let searchTimeout;
document.getElementById('searchInput').addEventListener('input', () => {
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(renderDeals, 200);
});

// Store filters
document.querySelectorAll('.filter-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        currentFilter = btn.dataset.store;
        renderDeals();
    });
});

// Sort
document.getElementById('sortSelect').addEventListener('change', (e) => {
    currentSort = e.target.value;
    renderDeals();
});

// Price range
document.getElementById('priceRange').addEventListener('input', (e) => {
    maxPrice = parseInt(e.target.value);
    document.getElementById('priceValue').textContent = maxPrice >= 60 ? 'Any' : `$${maxPrice}`;
    renderDeals();
});

// Min discount
document.getElementById('discountRange').addEventListener('input', (e) => {
    minDiscount = parseInt(e.target.value);
    document.getElementById('discountValue').textContent = minDiscount === 0 ? 'Any' : `${minDiscount}%+`;
    renderDeals();
});

// Min rating
document.getElementById('ratingSelect').addEventListener('change', (e) => {
    minRating = parseInt(e.target.value);
    renderDeals();
});

// Launch
fetchDeals();
