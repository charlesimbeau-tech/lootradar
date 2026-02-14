// LootRadar - Game Deal Aggregator
// Uses CheapShark API (free, no key needed)

const CHEAPSHARK_API = 'https://www.cheapshark.com/api/1.0';

const STORE_MAP = {
    '1': { name: 'Steam', class: 'steam', key: 'steam' },
    '25': { name: 'Epic', class: 'epic', key: 'epic' },
    '7': { name: 'GOG', class: 'gog', key: 'gog' },
    '11': { name: 'Humble', class: 'humble', key: 'humble' },
};

// Store IDs we care about
const STORE_IDS = Object.keys(STORE_MAP);

let allDeals = [];
let currentFilter = 'all';
let currentSort = 'discount';

async function fetchDeals() {
    const loading = document.getElementById('loading');
    const dealsGrid = document.getElementById('deals');
    loading.style.display = 'block';
    dealsGrid.innerHTML = '';

    try {
        // Fetch deals from each store
        const promises = STORE_IDS.map(storeID =>
            fetch(`${CHEAPSHARK_API}/deals?storeID=${storeID}&upperPrice=50&pageSize=20&sortBy=Deal+Rating`)
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
            metacriticScore: deal.metacriticScore,
            steamRatingPercent: deal.steamRatingPercent,
        }));

        // Dedupe by title (keep best deal)
        const seen = {};
        allDeals = allDeals.filter(d => {
            if (!seen[d.title] || d.savings > seen[d.title].savings) {
                seen[d.title] = d;
                return true;
            }
            return false;
        });
        allDeals = Object.values(seen);

        document.getElementById('lastUpdated').textContent = `Last updated: ${new Date().toLocaleString()}`;
    } catch (err) {
        console.error('Failed to fetch deals:', err);
        dealsGrid.innerHTML = '<p style="text-align:center;color:#666;padding:2rem;">Failed to load deals. Try refreshing.</p>';
    }

    loading.style.display = 'none';
    renderDeals();
}

function renderDeals() {
    const grid = document.getElementById('deals');
    const noResults = document.getElementById('noResults');
    const searchTerm = document.getElementById('searchInput').value.toLowerCase();

    let filtered = allDeals.filter(d => {
        const storeInfo = STORE_MAP[d.storeID];
        if (!storeInfo) return false;
        if (currentFilter !== 'all' && storeInfo.key !== currentFilter) return false;
        if (searchTerm && !d.title.toLowerCase().includes(searchTerm)) return false;
        return d.savings > 0;
    });

    // Sort
    if (currentSort === 'discount') {
        filtered.sort((a, b) => b.savings - a.savings);
    } else if (currentSort === 'price') {
        filtered.sort((a, b) => a.salePrice - b.salePrice);
    } else if (currentSort === 'name') {
        filtered.sort((a, b) => a.title.localeCompare(b.title));
    }

    if (filtered.length === 0) {
        grid.innerHTML = '';
        noResults.style.display = 'block';
        return;
    }

    noResults.style.display = 'none';

    grid.innerHTML = filtered.map(deal => {
        const store = STORE_MAP[deal.storeID] || { name: 'Unknown', class: 'steam' };
        const priceHTML = deal.salePrice === 0
            ? '<span class="free-tag">FREE</span>'
            : `<span class="original-price">$${deal.normalPrice.toFixed(2)}</span>
               <span class="sale-price">$${deal.salePrice.toFixed(2)}</span>`;

        return `
            <div class="deal-card">
                <img class="thumb" src="${deal.thumb}" alt="${deal.title}" loading="lazy" onerror="this.style.display='none'">
                <span class="store-tag store-${store.class}">${store.name}</span>
                <div class="title">${deal.title}</div>
                <div class="pricing">
                    ${priceHTML}
                    <span class="discount-badge">-${deal.savings}%</span>
                </div>
                <a class="deal-link" href="https://www.cheapshark.com/redirect?dealID=${deal.dealID}" target="_blank" rel="noopener">
                    Get Deal →
                </a>
            </div>
        `;
    }).join('');
}

// Event listeners
document.getElementById('searchInput').addEventListener('input', renderDeals);

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

// Go
fetchDeals();
