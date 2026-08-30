---
title: "Visual Design Identity: flashcard-master"
status: "final"
created: "2026-08-30"
updated: "2026-08-30"
tokens:
  colors:
    dark:
      bg_base: "#0f172a"
      bg_surface: "#1e293b"
      bg_surface_elevated: "#334155"
      border_subtle: "#334155"
      border_strong: "#475569"
      text_primary: "#f8fafc"
      text_secondary: "#94a3b8"
      text_muted: "#64748b"
      primary: "#6366f1"
      primary_hover: "#4f46e5"
      primary_glow: "rgba(99, 102, 241, 0.25)"
      accent_cyan: "#06b6d4"
      accent_green: "#10b981"
      accent_amber: "#f59e0b"
      accent_rose: "#f43f5e"
    light:
      bg_base: "#f8fafc"
      bg_surface: "#ffffff"
      bg_surface_elevated: "#f1f5f9"
      border_subtle: "#e2e8f0"
      border_strong: "#cbd5e1"
      text_primary: "#0f172a"
      text_secondary: "#475569"
      text_muted: "#94a3b8"
      primary: "#4f46e5"
      primary_hover: "#4338ca"
      primary_glow: "rgba(79, 70, 229, 0.15)"
      accent_cyan: "#0891b2"
      accent_green: "#059669"
      accent_amber: "#d97706"
      accent_rose: "#e11d48"
  typography:
    font_sans: "Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif"
    font_mono: "'JetBrains Mono', 'Fira Code', Menlo, Consolas, monospace"
    scale:
      xs: "0.75rem"
      sm: "0.875rem"
      base: "1.0rem"
      lg: "1.125rem"
      xl: "1.25rem"
      "2xl": "1.5rem"
      "3xl": "1.875rem"
  rounded:
    sm: "4px"
    md: "8px"
    lg: "12px"
    xl: "16px"
    full: "9999px"
  spacing:
    "1": "0.25rem"
    "2": "0.5rem"
    "3": "0.75rem"
    "4": "1.0rem"
    "6": "1.5rem"
    "8": "2.0rem"
    "12": "3.0rem"
---

# Visual Design Identity (DESIGN.md)

## 1. Brand & Style Philosophy

`flashcard-master` embodies a **developer-native, cognitive-first aesthetic**:
- **Clarity over Clutter:** Zero decorative distraction. Clean typography, generous whitespace, and purposeful contrast optimize information retention.
- **Immediate Verifiability:** Visual hierarchy emphasizes the *proof*—verbatim source quotes are visually distinct with warm citation callouts.
- **Deep Slate Palette:** Modern slate backgrounds paired with indigo primary accents and cyan/emerald status highlights.

---

## 2. Color Palette & Semantic Roles

| Token Role | Hex Code (Dark) | Hex Code (Light) | Usage & Context |
| :--- | :--- | :--- | :--- |
| **Background Base** | `#0f172a` (Slate 900) | `#f8fafc` (Slate 50) | App workspace background |
| **Surface Card** | `#1e293b` (Slate 800) | `#ffffff` (White) | Modals, table rows, flashcard previews |
| **Primary Action** | `#6366f1` (Indigo 500) | `#4f46e5` (Indigo 600) | Primary CTA buttons, active tabs |
| **Verbatim Quote Callout** | `rgba(245,158,11,0.12)` | `rgba(217,119,6,0.08)` | Source quote grounding highlight |
| **Sync / Success Status** | `#10b981` (Emerald 500) | `#059669` (Emerald 600) | Completed sync, AnkiConnect live connected |
| **Error / Attention** | `#f43f5e` (Rose 500) | `#e11d48` (Rose 600) | Failed RSS fetch, network alert |

---

## 3. Typography Scale & Hierarchy

- **UI & Headings:** `font_sans` (`Inter`, weights: 400, 500, 600, 700).
- **Code & Citations:** `font_mono` (`JetBrains Mono`, weights: 400, 500).
- **Headings Hierarchy:**
  - `H1` (Page Headers): `2xl` (1.5rem / 24px), font-weight: 700.
  - `H2` (Card Titles / Section Headers): `xl` (1.25rem / 20px), font-weight: 600.
  - `H3` (Component Subheaders): `lg` (1.125rem / 18px), font-weight: 600.
  - `Body`: `base` (1.0rem / 16px) or `sm` (0.875rem / 14px) for secondary metadata.

---

## 4. Layout & Spacing System

- **8pt Grid:** Margins, paddings, and gap distances follow multiples of 4px/8px (`spacing.1` through `spacing.8`).
- **Sidebar & Content Layout:**
  - Desktop: Fixed collapsible sidebar (240px wide) + fluid central content area.
  - Breakpoints: Desktop ($\ge 1024\text{px}$), Tablet ($768\text{px} - 1023\text{px}$), Mobile ($< 768\text{px}$).

---

## 5. Component Design Specifications

### Flashcard Anatomy Component
```text
┌──────────────────────────────────────────────────────────────┐
│ [RSS: ByteByteGo] • [Expert]               [Actions: Edit/Del] │
├──────────────────────────────────────────────────────────────┤
│ Q: Why does Raft enforce a single leader replication model?  │
│                                                              │
│ A: It guarantees a strict linear log flow and eliminates     │
│    ambiguous split-brain conflict resolution.                │
│                                                              │
│ ┌─ 📜 VERBATIM SOURCE CITATION ────────────────────────────┐ │
│ │ "Raft uses a stronger form of leadership than other       │ │
│ │  consensus algorithms... Log entries only flow from the   │ │
│ │  leader to servers, preventing branching conflicts."      │ │
│ └──────────────────────────────────────────────────────────┘ │
│ Source: https://bytebytego.com/raft-consensus • 2026-08-30    │
└──────────────────────────────────────────────────────────────┘
```

---

## 6. Do's and Don'ts

### Do's:
- ✅ **Highlight Source Quotes:** Always style the verbatim citation quote with distinct amber border/background so users immediately recognize grounded proof.
- ✅ **Provide Keyboard Shortcuts:** Show clear keyboard shortcut tags (e.g. `[Cmd+K]`, `[Enter]`, `[Esc]`) on interactive elements.
- ✅ **Graceful Connection Badging:** Show real-time indicator for AnkiConnect (`🟢 Anki Connected` vs `⚪ Anki Offline`).

### Don'ts:
- ❌ **No Nested Modals:** Avoid stacking modals; use slide-over drawers for card editing.
- ❌ **No Low-Contrast Gray-on-Gray:** Keep text contrast ratios at or above WCAG AA ($\ge 4.5:1$).
