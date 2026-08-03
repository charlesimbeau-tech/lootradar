# Homepage Radar Hero Design

## Goal

Use the LootRadar radar artwork as the homepage hero background without duplicating embedded branding text or weakening the existing accessible, indexable hero content.

## Visual Treatment

- Create a text-free derivative of the approved YouTube banner artwork.
- Preserve the black, neon-green radar grid, arcs, glow, and gamepad motif.
- Use the derivative as the full-width background of the existing `.hero` element.
- Keep the current HTML headline, lede, actions, and featured-deal card unchanged and interactive.
- Add a dark directional overlay between the artwork and page content so text and controls maintain strong contrast.
- Position the artwork to support the existing two-column desktop layout and use a deliberate centered crop for smaller screens.

## Asset Delivery

- Store the source-quality PNG under `public/`.
- Generate an optimized WebP for normal delivery while retaining the PNG as a fallback.
- Do not embed branding words in the background asset; the page's real HTML remains the sole source of hero copy.
- Keep the existing banner file outside the repository untouched.

## Responsive Behavior

- Desktop: the radar motif supports the hero copy without competing with the featured deal card.
- Tablet: the background remains centered behind the stacked layout and the overlay becomes slightly stronger.
- Mobile: the crop prioritizes useful texture and glow while keeping the HTML headline and buttons readable; decorative detail may fall outside the viewport.
- Respect the existing hero breakpoints and do not change the deal-card behavior.

## Accessibility and Performance

- Treat the artwork as decorative CSS rather than content, so it does not receive redundant alternative text.
- Preserve the existing semantic heading, paragraph, links, and featured-deal label.
- Use responsive image delivery and compression to avoid making the hero materially slower.
- Preserve reduced-motion behavior; the new background is static.

## Testing

- Assert that the homepage hero references the optimized radar asset with a PNG fallback.
- Assert that the overlay and responsive background-position rules exist.
- Assert that the existing headline, action links, and featured-deal container remain in the HTML.
- Run the complete test suite, static build, site verification, and a responsive visual check before completion.

## Out of Scope

- No changes to deal selection, sorting, navigation, hero wording, buttons, featured-card markup, or page structure.
- No animation, parallax, new tracking, or new content sections.
