# Discount Myth YouTube Short Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Produce a finished 1080 by 1920 LootRadar YouTube Short that explains why a large discount is not enough to make a game worth buying.

**Architecture:** Use the existing LootRadar Short renderer as the visual reference, but create a self-contained second renderer and dated deal snapshot. Render six static scenes with Sharp, animate them with restrained camera movement in FFmpeg, and synchronize the scene cuts to the 22.44-second Eleven V3 narration.

**Tech Stack:** Node.js 20, Sharp, SVG, FFmpeg, FFprobe, ElevenLabs V3 MP3.

## Global Constraints

- Use only verified current prices for named games.
- Use official Steam artwork for named games.
- Keep unnamed negative comparison examples generic.
- Use the charcoal and lime LootRadar visual system.
- Burn readable captions into every narrated scene.
- Do not use em dashes.
- Export H.264 video with AAC audio at 1080 by 1920 and 30 fps.

---

### Task 1: Freeze the verified deal evidence

**Files:**
- Create: `marketing/youtube-shorts/discount-myth/deals-2026-07-29.json`
- Create: `marketing/youtube-shorts/discount-myth/production-notes.md`

**Interfaces:**
- Consumes: CheapShark responses checked at `2026-07-29T19:35:54Z` and the Steam product page for app `1817070`.
- Produces: A snapshot containing Spider-Man Remastered, Neon White, and It Takes Two with prices, review evidence, store names, artwork URLs, and a dated disclaimer.

- [x] **Step 1: Save the exact evidence**

```json
{
  "checkedAt": "2026-07-29T19:35:54.924Z",
  "disclaimer": "Prices checked July 29, 2026 and may change.",
  "deals": [
    { "steamAppId": "1817070", "salePrice": 23.99, "savingsPercent": 60, "steamRatingPercent": 96 },
    { "steamAppId": "1533420", "salePrice": 7.88, "savingsPercent": 68, "steamRatingPercent": 98 },
    { "steamAppId": "1426210", "salePrice": 11.99, "savingsPercent": 70, "steamRatingPercent": 95 }
  ]
}
```

- [x] **Step 2: Validate the snapshot**

Run:

```powershell
node -e "const d=require('./marketing/youtube-shorts/discount-myth/deals-2026-07-29.json'); if(d.deals.length!==3) process.exit(1); console.log(d.checkedAt)"
```

Expected: the timestamp prints and the command exits successfully.

### Task 2: Build the timed scene renderer

**Files:**
- Create: `marketing/youtube-shorts/discount-myth/render-short.js`
- Create: `marketing/youtube-shorts/discount-myth/generated/art/*.jpg`
- Create: `marketing/youtube-shorts/discount-myth/generated/scenes/*.png`

**Interfaces:**
- Consumes: `deals-2026-07-29.json`, `lootradar-discount-myth-v3.mp3`, and `marketing/youtube-profile/lootradar-generated-emblem-source.png`.
- Produces: Six 1080 by 1920 scene PNGs and `lootradar-discount-myth-v3.mp4`.

- [x] **Step 1: Render six scenes**

Use these exact scene boundaries:

```js
const scenes = [
  { id: 'hook', duration: 2.708005 },
  { id: 'truth', duration: 3.064761 },
  { id: 'signals', duration: 4.288345 },
  { id: 'comparison', duration: 5.259615 },
  { id: 'rule', duration: 2.757324 },
  { id: 'cta', duration: 4.361075 }
];
```

- [x] **Step 2: Keep the comparison honest**

The 90% example is an unnamed sale badge. The named 60% example is Marvel's Spider-Man Remastered at $23.99 with 96% positive English Steam reviews. Do not assign a fabricated score or rating to the generic example.

- [x] **Step 3: Encode the video**

Run:

```powershell
node marketing/youtube-shorts/discount-myth/render-short.js
```

Expected: six scene paths and one MP4 path are printed.

### Task 3: Verify the final media

**Files:**
- Verify: `marketing/youtube-shorts/discount-myth/lootradar-discount-myth-v3.mp4`
- Verify: `marketing/youtube-shorts/discount-myth/generated/contact-sheet.png`

**Interfaces:**
- Consumes: The rendered scene PNGs and final MP4.
- Produces: Technical evidence and a contact sheet for review.

- [x] **Step 1: Verify technical properties**

Run:

```powershell
ffprobe -v error -show_entries stream=codec_name,width,height,r_frame_rate -show_entries format=duration,size -of json marketing/youtube-shorts/discount-myth/lootradar-discount-myth-v3.mp4
```

Expected: H.264 video, AAC audio, 1080 by 1920, 30 fps, and approximately 22.44 seconds.

- [x] **Step 2: Inspect the full visual sequence**

Create a six-frame contact sheet and inspect it for clipped text, weak contrast, incorrect prices, broken artwork, and safe caption margins.

- [x] **Step 3: Record final checks**

Add duration, file size, SHA256, audio model, voice, tags, source timestamps, and the exact featured deals to `production-notes.md`.
