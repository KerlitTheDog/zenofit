---
paths:
  - "styles.css"
---

# Working on the stylesheet (`styles.css`)

Loaded by itself when `styles.css` is opened.

- **Device measurements come from the viewport engine.** `applyViewport` in `app.js` writes `--pb-scale` and `--pb-frame-w`, and the VIEWPORT ENGINE block here derives everything else from them. Never write a raw pixel offset against the top or bottom of the screen: use `--pb-header-pt`, `--pb-sab` and the `--pb-*-b` tokens (docs/architecture.md, *Every dimension that answers to the device goes through the viewport engine*).
- **Colours are theme tokens** (`--bg`, `--text`, `--gold` and the rest), defined per theme under `data-theme`; the strength tiers have their own `--tier-*` set, so a tier name reads on a near-white card too (docs/progress.md). Every text colour clears WCAG AA in both themes, and a colour that is data goes through `inkFor` when it is text (docs/architecture.md, *Theming*).
- **Fonts are local files** in `fonts/`, latin and latin-ext only, each declared with Google's own `unicode-range`. A new weight is that weight's woff2 files plus their entries in `SHELL` in `sw.js`, never an `@import` (docs/architecture.md).
- `.pb-placeholder` is the dashed frame of the photo drop zone and of a photo still on another device, not a placeholder box (docs/writing.md).
