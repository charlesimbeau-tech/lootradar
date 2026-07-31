# First YouTube Short Visuals Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Produce a finished, vertical LootRadar YouTube Short that pairs the approved narration with verified current PC game deals.

**Architecture:** Store a dated deal snapshot as the source of truth, generate branded 1080 by 1920 scene artwork with Node and Sharp, then assemble the scenes and narration with FFmpeg. Verify the final video technically and inspect representative frames visually.

**Tech Stack:** Node.js, Sharp, FFmpeg, FFprobe, CheapShark API, Steam storefront artwork

## Global Constraints

- Use only deals verified live on July 29, 2026.
- Include the checked date and a price-change disclaimer.
- Use the LootRadar charcoal, lime, and white visual system.
- Do not use gameplay footage or unlicensed music.
- Keep all important text inside mobile-safe margins.
- Do not use em dashes in visible copy.
- Export 1080 by 1920 H.264 video with AAC narration.

---

## Task 1: Freeze the live deal data

- [x] Save the three selected deals with prices, stores, review data, deal IDs, artwork URLs, and the verification timestamp.
- [x] Record the source endpoints used for verification.

## Task 2: Build the branded scenes

- [x] Create a deterministic renderer for the hook, methodology, three deal cards, and final call to action.
- [x] Use official storefront artwork with strong dark overlays for text legibility.
- [x] Add burned-in narration captions and deal-specific review evidence.

## Task 3: Assemble the Short

- [x] Time the scenes to the approved 15.88-second narration.
- [x] Add restrained motion and clean scene transitions.
- [x] Export an upload-ready MP4 with narration included.

## Task 4: Verify the deliverable

- [x] Confirm video dimensions, codecs, duration, frame rate, and audio.
- [x] Extract representative frames across the timeline.
- [x] Inspect the frames for clipping, readability, brand consistency, and price accuracy.
- [x] Update production notes with the final output and verification details.
