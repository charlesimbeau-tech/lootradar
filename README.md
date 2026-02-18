# 🎮 LootRadar

A game deals aggregator that pulls live pricing from 15+ stores and caches results hourly via GitHub Actions. Cyberpunk-themed UI with genre filters and a built-in blog.

🔗 **Live:** [thelootradar.com](https://thelootradar.com)

<!-- TODO: Add screenshot — take a full-width capture of the homepage and save as screenshot.png -->

## Features

- **15+ store coverage** via [CheapShark API](https://www.cheapshark.com/) (Steam, GOG, Humble, etc.)
- **Hourly deal caching** — GitHub Actions workflow keeps data fresh without hammering the API
- **Genre & store filters** for quick browsing
- **6 blog articles** on gaming deals and tips
- **Cyberpunk UI theme**
- **Responsive design**

## Tech Stack

- HTML / CSS / JavaScript
- GitHub Actions (scheduled caching workflow)
- GitHub Pages (hosting)
- Cloudflare (DNS & CDN)
- CheapShark API

## Local Setup

```bash
git clone https://github.com/charlesimbeau-tech/lootradar.git
cd lootradar
# Open index.html in your browser, or use any local server:
npx serve .
```

> **Note:** Cached deal data is committed to the repo by the GitHub Actions workflow. Locally you'll see the last cached snapshot.
