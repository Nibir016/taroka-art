# Implementation Plan - Enhance Section Dividers and Backgrounds

The goal is to elevate the visual experience of the Taroka platform by replacing plain section transitions with artistic SVG dividers and giving each section a unique, high-end background.

## User Review Required

> [!NOTE]
> I will be using SVG wave and angled dividers. If you prefer a specific style (e.g., sharp vs. curved), please let me know.

## Proposed Changes

### CSS Enhancements
#### [MODIFY] [styles.css](file:///c:/taroka/public/css/styles.css)
- Define new background utility classes:
    - `.bg-light-cream`: A subtle, warm off-white gradient.
    - `.bg-soft-orange`: A very light orange tint.
    - `.bg-pattern-dots`: A subtle dot pattern background.
- Add styles for `.section-divider`:
    - Heights and colors for SVG dividers.
    - Proper positioning to overlap sections seamlessly.

### HTML Structure
#### [MODIFY] [index.html](file:///c:/taroka/public/index.html)
- Remove inline `style="background:..."` attributes from `<section>` tags.
- Apply new background classes to each section.
- Insert SVG dividers between sections.
- Refine padding and spacing to accommodate the dividers.

## Specific Section Styles:
1. **Hero**: Existing image background (keep).
2. **Upcoming Competitions**: `.bg-light-cream` + Wave divider below.
3. **Ongoing Competitions**: `.bg-soft-orange` + Angled divider below.
4. **Completed Competitions**: `.bg-pattern-dots` + Wave divider below.
5. **About Us**: `.bg-light-cream` (with orange accents) + Wave divider below.
6. **Vision & Future**: `.bg-glass` or clean white with subtle borders.
7. **Why Join Us**: A more vibrant, punchy background to draw attention.

## Verification Plan

### Manual Verification
- View the homepage in the browser to ensure:
    - Dividers align correctly without white gaps.
    - Backgrounds are distinct but harmonious.
    - The overall "premium" feel is achieved.
    - Responsiveness is maintained.
