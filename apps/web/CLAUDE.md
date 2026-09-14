# Crove Web — AI Design & Engineering Instructions

> **NON-NEGOTIABLE**: Every UI/design decision on this project MUST be driven by the installed skills below. Never design from memory, instinct, or generic AI defaults. The skills exist precisely to prevent that. Treat this file as the design constitution — violating it produces generic, low-quality output.

---

## Design System (Source of Truth)

**Colors** (defined in `app/globals.css` — never hardcode, always use CSS vars):
- `--color-bg`: `#0b0d10` (dark) / `#fafaf8` (light)
- `--color-surface`: `#14171c` (dark) / `#ffffff` (light)
- `--color-accent`: `#ffc825` (dark) / `#d4960c` (light)
- `--color-text`: `#f2efe9` (dark) / `#192837` (light)
- `--color-text-muted`: semi-transparent text

**Typography**:
- Headings: `Space Grotesk` via `var(--font-heading)`
- Body: `Inter` via `var(--font-body)`

**Motion library**: `motion/react` (already installed — use it, never raw CSS transitions for interactive elements)

**Background**: Aceternity `WavyBackground` (`components/ui/wavy-background.tsx`) — the hero section uses this. Do not replace it.

---

## Mandatory Skill Usage Rules

### Rule 1 — Never invent UI from scratch
Before writing any new component, layout, or visual pattern, you must consult at least ONE of the design skills below. Identify which skill is most relevant and let its guidance shape the output.

### Rule 2 — Every design pass gets audited
After implementing any UI work, run `/improve-ui` to audit what you built against the existing design system. Fix what it flags before calling the work done.

### Rule 3 — Animations always go through Emil or improve-animations
Any motion, transition, hover state, or loading animation must be reviewed through `/improve-animations` or `/find-animation-opportunities` before shipping.

### Rule 4 — Escape generic AI aesthetics at all times
When building anything beyond a bug fix, run `/bencium-innovative-ux-designer` or `/gpt-taste` to ensure output does not read as AI-generated template work.

---

## Installed Skills — When to Use Each

### From `millionco/react-doctor` → `/improve-react`
**Use when**: Auditing React component performance, reducing re-renders, improving hook patterns, or before any large component refactor.
- Runs React Doctor scan as evidence
- Produces prioritized audit + implementation plans

### From `wshobson/agents` → `/interaction-design`
**Use when**: Adding any interaction — hover, click, focus, drag, swipe, loading state, transition between states.
- Covers microinteractions, motion design, user feedback patterns
- Required for any new animated or interactive element

### From `addyosmani/agent-skills` → `/frontend-ui-engineering`
**Use when**: Building or modifying any page, layout, or component — especially for accessibility, responsiveness, and production-quality output.
- WCAG compliance, responsive design, component architecture
- Required before marking any UI task as complete

### From `anthropics/skills` → `/frontend-design`
**Use when**: Making visual design decisions — typography, spacing, color application, layout composition, new UI surfaces.
- Guides distinctive, intentional visual design
- Prevents templated, generic-looking output

### From `ibelick/ui-skills` → `/improve-ui`
**Use when**: Reviewing an existing component or page for design-system drift, inconsistency, or UI debt.
- Audits against the actual design evidence in the codebase
- Write-up only — another agent applies the fixes

### From `bencium/bencium-marketplace` → `/bencium-innovative-ux-designer`
**Use when**: Creating new product surfaces, landing sections, or anything where brand differentiation matters.
- Develops independent visual language
- Mandatory for any new hero/marketing section

---

## Installed Skills — Emil Kowalski Set (`emilkowalski/skills`)

### `/animate` + `/animate-expo`
Use when implementing any animation. Ensures animations feel native and intentional, not mechanical.

### `/animation-vocabulary`
Use to establish consistent animation language across the app — easing curves, durations, stagger patterns.

### `/apple-design`
Use when precision, clarity, and restraint are needed. Reference Apple's design principles for spacing and hierarchy decisions.

### `/emil-design-eng`
Use as a general design engineering reference — the intersection of design and production code quality.

### `/find-animation-opportunities`
Use during any UI review to identify where motion would improve clarity or delight. Run before calling a page "done."

### `/improve-animations`
Use when existing animations feel wrong — janky, too fast, out of sync. Diagnoses and fixes.

### `/pick-ui-library`
Use when choosing a new component library, utility, or animation tool. Prevents introducing redundant dependencies.

### `/prototype`
Use when exploring layout or interaction ideas before committing to production code.

### `/review-animations`
Use for a final animation audit — ensures all motion across a surface is coherent and purposeful.

### `/ask-sonner`
Use when adding toast notifications or any ephemeral feedback UI — Sonner is already installed.

---

## Installed Skills — Impeccable (`pbakaus/impeccable`)

Run `npx impeccable detect src/` or `/impeccable init` to get design quality scan results.

Key commands to use regularly:
- `/impeccable audit` — full design quality audit of a surface
- `/impeccable polish` — detailed polish pass on an existing component
- `/impeccable critique` — get a prioritized critique before shipping

The 59-rule engine catches: AI-generated UI tells, accessibility violations, spacing inconsistencies, typography errors, color misuse. Run it before every significant UI commit.

---

## Installed Skills — Taste Skill (`Leonxlnx/taste-skill`)

### `/design-taste-frontend`
**Primary taste skill** — use before finalizing any UI. Ensures output has high design taste, not generic AI output.

### `/gpt-taste`
High-agency UX/UI with strict layout variance, typography, and motion constraints. Use when pushing for more distinctive output.

### `/high-end-visual-design`
Use for any premium-feel surfaces — hero sections, pricing cards, marketing pages.

### `/redesign-existing-projects`
Use when significantly reworking an existing page or section.

### `/minimalist-ui`
Use when the current design feels cluttered. Guides reduction and whitespace.

### `/industrial-brutalist-ui`
Use when exploring bold, high-contrast design directions.

### `/stitch-design-taste`
Use for component-level taste pass — individual card, button, or input refinement.

### `/image-to-code` + `/imagegen-frontend-web`
Use when converting design references or mockups to code.

---

## Workflow — Mandatory Steps for Any UI Task

1. **Before coding**: Read the task. Identify which skill(s) apply. Load their guidance.
2. **During coding**: Follow skill guidance. Use design tokens, not hardcoded values. Use `motion/react` for animation.
3. **After coding**: Run `/improve-ui` + `/impeccable audit` to catch regressions.
4. **For new surfaces**: Run `/bencium-innovative-ux-designer` or `/frontend-design` first.
5. **For any animation**: Pass through `/improve-animations` or `/animation-vocabulary`.
6. **Before every significant commit**: Run `npx impeccable detect apps/web/` to catch anti-patterns.

---

## What Is Forbidden

- Hardcoding colors (`#fff`, `rgba(...)`) — use CSS vars
- Generic button styles, card shadows, or gradients not derived from the design system
- Animations using raw `transition` CSS on interactive elements — use `motion/react`
- Adding a new UI library without running `/pick-ui-library`
- Shipping any new page section without a `/design-taste-frontend` or `/improve-ui` pass
- Building a hero or CTA section without consulting `/frontend-design` or `/bencium-innovative-ux-designer`

---

## Tech Stack Quick Reference

- **Framework**: Next.js 16 (App Router), React 19
- **Styling**: Tailwind CSS v4 with `@theme` tokens
- **Animation**: `motion/react` (v13)
- **Components**: Radix UI primitives + custom components in `components/ui/`
- **Background**: Aceternity WavyBackground (`simplex-noise` canvas)
- **Auth**: `better-auth`
- **Forms**: `react-hook-form` + `zod`
- **Notifications**: `sonner`
