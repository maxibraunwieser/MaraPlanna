# MaraPlanna Design System (MASTER)

Global source of truth for the app's look. Page files in `design-system/pages/` may override single rules; otherwise this
file applies. Implemented as tokens in `src/index.css` (`@theme`, prefix `ds-`); components use only these tokens.

Product: hybrid training app (running + strength), mobile-first web (React 19, Tailwind 4, lucide-react), later native.
Feel: a serious gym tool (Hevy, Strong, Fitbod, Apple Fitness): calm, dense with meaning, one glance tells what, which
muscles and how long.

Sources: `ui-ux-pro-max --design-system "fitness training tracker dark sporty"` (style *Minimalism & Swiss*, primary
`#F97316`, sporty condensed headings, subtle motion), the rules of the Workout brief, and the muscle colours of the
`exercise-animations` skill. Not taken from the generator: its green second accent (one accent only), its `#1F2937`
background (too light; near black wanted) and its landing-page pattern (this is an app).

## 1. Colour

| Token | Value | Use |
|---|---|---|
| `ds-bg` | `#0E1014` | base page colour; the app keeps its blue/orange background glow on every page, the Strength pages included (owner's decision, 2026-11-14) |
| `ds-surface` | `#171A20` | cards (one step lighter) |
| `ds-surface-2` | `#20242C` | elements on cards: chips, inputs, rows, tracks |
| `ds-line` | `#2A2F38` | hairlines, outlines |
| `ds-body` | `#343A46` | silhouette of the muscle map (outline `ds-body-line` `#4A5262`) |
| `ds-text` | `#F5F6F8` | primary text, big numbers |
| `ds-text-2` | `#AEB5C2` | secondary text (contrast 8.6:1 on surface) |
| `ds-text-3` | `#7D8594` | tertiary, icons next to numbers (4.6:1 on surface) |
| `ds-accent` | `#F97316` | the only action colour: primary buttons, active tab, links, focus ring |
| `ds-on-accent` | `#0E1014` | text on accent (7.9:1) |
| `ds-run` | `#A3E635` | type colour: running (dots, run card marker) |
| `ds-strength` | `#7DD3FC` | type colour: strength (dots, strength card marker) |
| `ds-success` | `#34D399` | done ticks, positive trend |
| `ds-danger` | `#F87171` | destructive, errors |

Rules
- One accent for actions. Type colours (run / strength) only mark the kind of a session. Muscle colours only for muscles.
- No decorative gradients, glows, glass everywhere, random shadows. Cards are flat `ds-surface` with a 1px `ds-line`
  border; the floating tab bars keep their material (they sit above content).
- Text never in a muscle or type colour; colour sits on a dot, chip or shape next to the text.

### Muscle colours (identical to `exercise-animations`)

| Muscle | Token | Value |
|---|---|---|
| chest | `ds-m-chest` | `#EF4444` |
| back | `ds-m-back` | `#3B82F6` |
| traps | `ds-m-traps` | `#6366F1` |
| shoulders | `ds-m-shoulders` | `#F97316` |
| biceps | `ds-m-biceps` | `#A855F7` |
| triceps | `ds-m-triceps` | `#EC4899` |
| forearms | `ds-m-forearms` | `#14B8A6` |
| quads | `ds-m-quads` | `#22C55E` |
| hamstrings | `ds-m-hamstrings` | `#65A30D` |
| glutes | `ds-m-glutes` | `#D97706` |
| calves | `ds-m-calves` | `#06B6D4` |
| core | `ds-m-core` | `#FACC15` |
| hip flexors | `ds-m-hipflex` | `#0EA5E9` |

Intensity = strength of the colour: main muscle 100 %, secondary 45 % over the body colour. Note: shoulders share the
hue of the accent; they only ever appear inside the body map or a muscle chip, never on an action.

## 2. Typography

Two families, already loaded: **Inter** (text, tabular figures via `tabular-nums`) and **Roboto Condensed** (the big
numbers and screen titles; the generator's Barlow Condensed is the same family of feel, kept to the loaded font).

| Token | Size / line | Weight | Use |
|---|---|---|---|
| `ds-t-display` | 32 / 36 | 700 condensed | screen title, hero number |
| `ds-t-title` | 20 / 26 | 600 | card title (workout name) |
| `ds-t-body` | 15 / 22 | 400 / 600 | text, list rows, stat numbers in cards |
| `ds-t-caption` | 12 / 16 | 400 / 600 | dates, chips, secondary info (never below 12) |

Max 4 sizes, 2 weights (400, 600; 700 only for the condensed display). Numbers always `tabular-nums`.
Number format: thousands separator of the locale (de: `23.176 kg`), volumes from 10 t as tonnes with one decimal
(`23,2 t`). Durations `43 min`, `1:12 h`.

## 3. Space, radius, size

- 4/8 grid: `1` = 4 px. Card padding 16 (20 from `sm`), gaps 8 / 12 / 16 / 24.
- Radius tokens: `ds-r-sm` 8 (chips, thumbs), `ds-r-md` 12 (rows, buttons), `ds-r-lg` 20 (cards).
- Touch targets ≥ 44 × 44. Icon buttons are 44 square with an `aria-label`.
- Thumbnails: square, 56 px in lists, 72 in cards, `ds-surface-2` background, `ds-r-sm`. Max 4 in a row + "+n" chip.

## 4. Icons

One set: **lucide-react**, stroke 2, sizes 16 (inline with caption), 20 (with body/stat), 24 (nav). No emoji.
Fixed meanings: `Clock` duration · `Dumbbell` volume · `Flame` kcal · `ListChecks` exercises · `Layers` sets ·
`Trophy` record · `Footprints` run · `Play` start · `Timer` rest · `Check` done.

## 5. Components

- **Stat**: icon (16–20, `ds-text-3`) + number (`ds-t-body` 600 or `ds-t-title`) + unit (caption, `ds-text-2`). No label
  text under it; the icon carries the meaning, the label is the `aria-label`/`title`.
- **Muscle map**: front + back silhouette, body `ds-body`, outline `ds-body-line`, muscles in their colour by intensity.
  Own SVG (see §8). Sizes: mini 48 wide (recent), card 96 (hero), large full width (detail, summary, analytics).
- **Muscle chip**: 28 px round, filled with the muscle colour (secondary at 45 %), short code inside is not needed; the
  name is the tooltip and `aria-label`. Row of chips, max 6 + "+n".
- **Week strip**: Mon–Sun, each day a 44 px cell: weekday letter, date, and up to two dots (run / strength): filled =
  done, ring = planned. Today outlined in `ds-accent`. Right end: `done / planned` as the week's progress.
- **Card**: `ds-surface`, 1px `ds-line`, `ds-r-lg`, no shadow. Section header: `ds-t-title` text, optional action right.
  No slashes, no decorative icons in headers.
- **Buttons**: primary filled `ds-accent` (one per card), secondary `ds-surface-2`, ghost for tertiary actions.

## 6. Motion

Short and functional: 150–250 ms, `cubic-bezier(0.32, 0.72, 0, 1)` for movement, opacity for appearance. Ticking a
set, timers, sheet in/out, folding. `prefers-reduced-motion`: cross-fade only.

## 7. Accessibility

Contrast AA (text 4.5:1, large 3:1); every icon-only element has a label; colour never alone (chips have names as
labels, dots have a legend and `aria-label`). Focus ring 2 px `ds-accent`.

## 8. Muscle map library decision

`react-body-highlighter` (MIT, last release 2.0.5 in May 2022, unmaintained) uses 17 muscle ids that do not match the
app's model (10 coarse muscles in `exerciseInfo.ts`, 15 fine ones shared with the watch in `figureMuscles.ts`), and its
figure style differs from the app's own drawing. Decision: keep the own SVG (`MuscleMap.tsx`, own drawing, no licence
question) and give it the dark body and the muscle colours above.

## 9. Anti-patterns (from the brief and ui-ux-pro-max)

Decorative gradients and glows · glassmorphism on every card · several accent colours · emoji as icons · decorative
slashes in headers · label text under numbers where an icon says it · text blocks where chips or a map say it ·
truncated image rows · raw hex in components · text under 12 px.

## Pre-delivery checklist

- [ ] Only `ds-` tokens in new components (no raw hex)
- [ ] One accent, muscle colours only on muscles
- [ ] Numbers tabular, thousands separators, tonnes from 10 t
- [ ] Icons from lucide only, labelled when alone
- [ ] Touch targets ≥ 44, contrast AA, reduced motion respected
- [ ] 375 px wide without horizontal scroll
