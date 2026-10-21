# CPE Assets — Color Scheme Guide

Source reference: <https://cpe.eng.kps.ku.ac.th/CPEAssets/>

This file intentionally documents only the source website’s color system. Values were checked against the rendered public page, system/backend page, computed browser styles, and the copied CSS on 2026-10-21.

## Core palette

| Name | Hex | Use |
| --- | --- | --- |
| Page gradient start | `#1B1D1E` | Dark page background |
| Page gradient end | `#1D1F20` | Dark page background fade |
| Surface | `#181A1B` | Header, search panel, cards, tables |
| Primary text | `#E8E6E3` | Headings, labels, controls |
| Secondary text | `#CCC8C1` | Body copy and metadata |
| Brand blue | `#0466C8` | Main institutional/technology accent |
| Deep blue | `#0353A4` | Strong blue and hover state |
| Input border | `#D6D3CD` | Form controls and light outlines |

## Primary action gradient

The main search/action button uses a vivid indigo-to-purple gradient:

```css
background: linear-gradient(135deg, #1E169C, #460FA5);
```

| Name | Hex | Use |
| --- | --- | --- |
| Action indigo | `#1E169C` | Gradient start |
| Action purple | `#460FA5` | Gradient end |
| Action shadow | `rgba(16, 67, 178, .18)` | Button depth |

Use this gradient for the primary action in a region—such as Search, Save, Approve, or Confirm. Keep secondary actions outlined or neutral.

## Status colors

| Status | Main | Dark/background variant | Use |
| --- | --- | --- | --- |
| Ready / healthy | `#009688` | `#0CA799` | Available assets and successful checks |
| Information / active | `#106BDA` | `#0B63D0` | Active workflow and informational actions |
| Warning / pending | `#FFC107` | `#F0B503` | Attention, waiting, or pending states |
| Error / damaged | `#E43F0B` | `#F1511F` | Errors, damaged assets, and destructive states |

Always pair a status color with a text label. Do not rely on color alone to communicate state.

## Utility and supporting colors

| Name | Hex | Use |
| --- | --- | --- |
| Floating tool navy | `#1A243B` | Floating status/tool buttons |
| Soft blue | `#EFF6FF` | Selected or supporting blue surfaces |
| Dark navy | `#13293D` | Deep Bootstrap dark token |
| Dark navy soft | `#1B344A` | Dark hover/subtle surface |
| White | `#FFFFFF` | Logo background, icon contrast, high-contrast surfaces |

## Recommended source-style variables

```css
:root {
  --cpe-page-start: #1B1D1E;
  --cpe-page-end: #1D1F20;
  --cpe-surface: #181A1B;
  --cpe-text: #E8E6E3;
  --cpe-text-muted: #CCC8C1;
  --cpe-brand-blue: #0466C8;
  --cpe-brand-blue-deep: #0353A4;
  --cpe-action-start: #1E169C;
  --cpe-action-end: #460FA5;
  --cpe-success: #009688;
  --cpe-info: #106BDA;
  --cpe-warning: #FFC107;
  --cpe-danger: #E43F0B;
}

body {
  color: var(--cpe-text-muted);
  background: linear-gradient(
    180deg,
    var(--cpe-page-start) 0%,
    var(--cpe-page-end) 100%
  );
}

.primary-action {
  color: #FFFFFF;
  background: linear-gradient(
    135deg,
    var(--cpe-action-start),
    var(--cpe-action-end)
  );
}
```

## Color rules

- Keep the overall shell dark; the source public and backend pages use the same dark visual foundation.
- Use blue for navigation, technology context, links, and information.
- Use purple only to draw attention to the primary action.
- Use cream-white text instead of pure white for normal reading text on dark surfaces.
- Use green, blue, amber, and orange-red consistently for status meaning.
- Keep large surfaces flat and dark; reserve gradients for the page background and primary actions.
- Maintain strong contrast between `#E8E6E3` text and the `#181A1B` surface.

## Evidence in this project

- Source public page: [`index.html`](../index.html)
- Copied base theme: [`assets/css/style.css`](../assets/css/style.css)
- Copied shared color tokens: [`assets/css/cpe-common.css`](../assets/css/cpe-common.css)
- Copied modern action colors: [`assets/css/cpe-modern-ui.css`](../assets/css/cpe-modern-ui.css)
- Source/runtime observations: [`search-evidence.md`](./search-evidence.md)
