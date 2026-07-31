# LootRadar YouTube Community Poll Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Publish one immediate LootRadar YouTube Community poll using the approved question and four response options.

**Architecture:** Use the authenticated YouTube Studio interface in the user's Chrome session. Create a poll-only Community post, publish it immediately, and verify the live post content through YouTube Studio or the channel page.

**Tech Stack:** YouTube Studio, YouTube Community posts, Chrome browser control

## Global Constraints

- Question: `What matters most when you judge a PC game deal?`
- Option 1: `Game quality and reviews`
- Option 2: `Current price and value`
- Option 3: `Discount percentage`
- Option 4: `Historical-low pricing`
- Include no introductory caption, website link, hashtags, or image.
- Do not mark any response as objectively correct.
- Publish immediately rather than scheduling.
- Do not use em dashes.

---

### Task 1: Publish and Verify the Community Poll

**Files:**
- Reference: `docs/superpowers/specs/2026-07-29-youtube-community-poll-design.md`
- Create externally: one YouTube Community poll on the LootRadar channel

**Interfaces:**
- Consumes: The authenticated LootRadar YouTube channel and the exact approved poll copy above
- Produces: A public YouTube Community poll containing one question and four options

- [ ] **Step 1: Open the Community post composer**

Open YouTube Studio in the authenticated LootRadar Chrome session. Use the Create menu to open the Community post composer.

- [ ] **Step 2: Select the poll format**

Choose the standard poll format. Do not choose a quiz, image poll, text-only post, or scheduled post.

- [ ] **Step 3: Enter the approved content**

Enter the exact question and four options from Global Constraints. Preserve their order and punctuation.

- [ ] **Step 4: Check the final draft**

Confirm that the draft contains no caption, website link, hashtags, image, scheduled time, or designated correct answer.

- [ ] **Step 5: Publish immediately**

Use the Post action to publish to the LootRadar channel.

- [ ] **Step 6: Verify the live result**

Confirm that YouTube shows the post as published and that the live post contains the exact question and four options with no additional caption.
