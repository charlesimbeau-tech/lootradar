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

async function fetchDeals() {
    const loading = document.getElementById('loading');
    loading.style.display = 'block';

    try {
        const promises = STORE_IDS.map(storeID =>
            fetch(`${CHEAPSHARK_API}/deals?storeID=${storeID}&upperPrice=50&pageSize=30&sortBy=Deal+Rating`)
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
            metacriticScore: deal.metacriticScore || '—',
            steamRatingPercent: deal.steamRatingPercent,
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

        // Update header stats
        const totalDeals = allDeals.filter(d => d.savings > 0).length;
        const bestDiscount = Math.max(...allDeals.map(d => d.savings));
        const freeGames = allDeals.filter(d => d.salePrice === 0).length;

        document.getElementById('totalDeals').textContent = totalDeals.toLocaleString();
        document.getElementById('bestDiscount').textContent = `-${bestDiscount}%`;
        document.getElementById('freeGames').textContent = freeGames;

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

function getThumbURL(deal) {
    if (deal.steamAppID && deal.steamAppID !== '0' && deal.steamAppID !== null) {
        return `https://cdn.cloudflare.steamstatic.com/steam/apps/${deal.steamAppID}/header.jpg`;
    }
    return deal.thumb || '';
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

    const ratingHTML = deal.metacriticScore !== '—' && deal.metacriticScore > 0
        ? `<span class="rating">⭐ ${deal.metacriticScore}</span>`
        : '';

    return `
        <div class="deal-card">
            <div class="thumb-wrapper">
                <img class="thumb" src="${thumbURL}" alt="${deal.title}" loading="lazy" onerror="this.parentElement.style.background='linear-gradient(135deg, #111720, #0c1015)'">
                <span class="${badgeClass}">${badgeText}</span>
            </div>
            <div class="card-body">
                <div class="card-meta">
                    <span class="store-tag store-${store.class}">${store.name}</span>
                    ${ratingHTML}
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

function renderDeals() {
    const featuredSection = document.getElementById('featuredSection');
    const featuredGrid = document.getElementById('featuredDeals');
    const allSection = document.getElementById('allSection');
    const allGrid = document.getElementById('deals');
    const noResults = document.getElementById('noResults');
    const searchTerm = document.getElementById('searchInput').value.toLowerCase();

    let filtered = allDeals.filter(d => {
        const storeInfo = STORE_MAP[d.storeID];
        if (!storeInfo) return false;
        if (currentFilter !== 'all' && storeInfo.key !== currentFilter) return false;
        if (searchTerm && !d.title.toLowerCase().includes(searchTerm)) return false;
        return d.savings > 0;
    });

    if (currentSort === 'discount') {
        filtered.sort((a, b) => b.savings - a.savings);
    } else if (currentSort === 'price') {
        filtered.sort((a, b) => a.salePrice - b.salePrice);
    } else if (currentSort === 'name') {
        filtered.sort((a, b) => a.title.localeCompare(b.title));
    }

    if (filtered.length === 0) {
        featuredSection.style.display = 'none';
        allSection.style.display = 'none';
        noResults.style.display = 'block';
        return;
    }

    noResults.style.display = 'none';

    // Split: featured (free games + 90%+ off) vs rest
    if (!searchTerm && currentSort === 'discount') {
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

// Debounced search
let searchTimeout;
document.getElementById('searchInput').addEventListener('input', () => {
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(renderDeals, 200);
});

document.querySelectorAll('.filter-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        currentFilter = btn.dataset.store;
        renderDeals();
    });
});

document.getElementById('sortSelect').addEventListener('change', (e) => {
    currentSort = e.target.value;
    renderDeals();
});

// Launch
fetchDeals();
