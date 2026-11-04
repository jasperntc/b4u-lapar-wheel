# Lapar Wheel redesign: kopitiam by day, pasar malam by night

Approved 2026-11-04. Lapar Wheel gets its own look, with a thin Built4You wrapper. This file is the design spec. `docs/redesign-prototype.dc.html` is the clickable prototype's source, for reference only: it's a design-canvas template (`{{holes}}`, `<sc-if>`, `<sc-for>`), not runnable here, and its `/_blob/...` URLs are the canvas copies of the files in `public/images/`.

## What stays the same

Everything behavioural in `CLAUDE.md` still applies: the API, limits, copy for errors, privacy, attribution, `pickIndex`, pick first then animate, reduced motion, storage keys prefixed `lapar-wheel:`. Halal mode, share links and an "All of KK" radius aren't built yet, so the prototype's halal switch, Share button and All of KK chip are left out until they are.

## Looks

Two looks, chosen by a three-way switch: Auto, Day, Night. Auto is night from 19:00 to 05:59 on the device clock, day otherwise, re-checked every minute. The choice is stored as `lapar-wheel:look`.

The look must be set before first paint, or a night visit flashes the day look: a small inline script in the root layout reads the stored choice and the hour, sets `data-look="day|night"` on `<html>`, and sets `<meta name="theme-color">`. React reads the attribute after mount. The look ignores the OS dark mode setting; set `color-scheme: light` for day and `dark` for night so form controls match.

### Tokens

All colours live in `app/lapar-tokens.css`, as CSS variables that switch on `[data-look]`. No hex anywhere else.

| Role | Day | Night |
|---|---|---|
| Ground | `#f7f8f4` with the wall-tile texture and green band | `#1a1530` with a radial glow `rgba(255,154,60,0.18)` at 50% 38% |
| Ink | `#1d1d1b` | `#f3e9d8` |
| Ink soft (captions) | `#4a4a44` | `#c9bfd9` |
| Panel | `#ffffff`, 2px `#1d1d1b` border, `0 4px 0 #1d1d1b` shadow | `#241e3d`, 1.5px `#3d3660` border |
| Result card | as panel | `#241e3d`, 1.5px `#ffd23f` border, glow `0 0 28px rgba(255,210,63,0.18)` |
| Primary action (Spin) | `#c8342b`, white text, 2px `#1d1d1b` border, `0 4px 0 #1d1d1b` | `#ff4f8b`, `#1a1530` text, glow `0 0 24px rgba(255,79,139,0.55)` |
| Open in Maps | `#1f6b4a`, white text, 2px `#1d1d1b` border | `#ff4f8b`, `#1a1530` text |
| Accent (kicker, selected chip, links) | `#1f6b4a` | `#ffd23f` (text on it `#1a1530`) |
| Title | `#eef3ec` on the signboard | `#ffe7f0`, text-shadow `0 0 6px #ff4f8b, 0 0 18px #ff4f8b` |
| Focus ring, 2px solid, 2px offset | `#1d1d1b` | `#ffd23f` |
| Pointer | `#c8342b` | `#ff4f8b` |
| Lamps | shade `#1f6b4a`, glow `#fff3cf` | bulb `#ffd98a`, core `#fff3cf` |
| Signboard shadow | `#134430` | |

Wheel segments cycle six colours, with the text colour that passes AA on each:

| Day fill | Day text | Night fill | Night text |
|---|---|---|---|
| `#1f6b4a` | `#ffffff` | `#ff4f8b` | `#1a1530` |
| `#eef3ec` | `#1d1d1b` | `#ffd23f` | `#1a1530` |
| `#c8342b` | `#ffffff` | `#2fd1c4` | `#1a1530` |
| `#e9a825` | `#1d1d1b` | `#5b3fd9` | `#ffffff` |
| `#2a7f86` | `#ffffff` | `#ff9a3c` | `#1a1530` |
| `#9cc9a6` | `#1d1d1b` | `#9be15d` | `#1a1530` |

Segment strokes: day `#1d1d1b`, night `#1a1530`. Night plate behind the bulbs: `#2a2540`. Hub: day `#eef3ec` with a `#1f6b4a` edge, night `#1a1530` with a `#ffd98a` edge. Keep the existing rule that the last segment never repeats the first's colour.

Every text pair must pass WCAG AA (4.5:1) in its look. Check them in a test, like the current wheel-text test.

### Type

Self-hosted, never from Google Fonts (that would send visitors' IPs to Google): `public/fonts/Bungee-latin-400.woff2` and `Figtree-latin-{400,600,800}.woff2`, both SIL Open Font License (`OFL-Bungee.txt`, `OFL-Figtree.txt`). Bricolage Grotesque stays only for the Built4You credit.

| Role | Font | Size / line height |
|---|---|---|
| Title (signboard and neon) | Bungee 400, letter-spacing 0.02em | 32 / 36 |
| Place name on the result card | Bungee 400 | 28 / 32 |
| Spin button | Bungee 400, letter-spacing 0.04em | 24 |
| Sheet title | Bungee 400 | 22 / 28 |
| Body | Figtree 400 | 16 / 22 |
| Subtitle, small print | Figtree 600 / 400 | 14 / 20, 13 / 18 |
| Kicker ("Go makan at") | Figtree 800 | 15 / 20 |
| Buttons | Figtree 600; the main action 800 (Open in Maps, a notice's first button, Done) | 16 |

Bungee only has capitals, so only these display roles use it. Labels and buttons stay in sentence case.

### Spacing, shape and texture

- Spacing uses the existing steps only (4, 8, 12, 16, 24, 32, 48, 64 px). The prototype's 10 and 14 px gaps round to 12.
- Radii: signboard 6px, panels and cards 12px, sheet top corners 18px, all buttons and chips pill-shaped.
- Grain: a full-page fixed noise layer, day `mix-blend-mode: multiply` at 0.16 opacity, night `screen` at 0.07. Reuse the masked-noise technique already in `app/globals.css`.
- Day title has a slight hand-painted wobble: an SVG `feTurbulence` (base frequency 0.035, 2 octaves) into `feDisplacementMap` with scale 2.2.
- Textures in `public/images/textures/`: `wall-day.png` (tiles, repeat), `wall-green-band.png` (repeat-x along the bottom), `awning-day.png` and `awning-night.png` (repeat-x along the top). CSS `url()`s need the `/lapar-wheel/` prefix.

## Layout, phone first

One centred column, at most 390px wide, on a full-width ground. Top to bottom:

1. **Awning**, 44px, full width.
2. **Lamp row**, 15px: 13 lamps spread across, 14px side padding. Day: green half-round shades 14×7 with a cream glow under each. Night: 9px glowing bulbs.
3. **Header**, fixed 96px tall in both looks so switching never shifts the page.
   - Day: `public/images/signboard-day.jpg` as a background stretched to the box (`100% 100%`), radius 6, shadow `0 4px 0` signboard shadow, title plus subtitle "Can't decide? Spin, then go makan.", centred.
   - Night: neon title plus subtitle "Dinner or supper? Spin for what's still open.", centred, no board.
4. **Wheel**, 300px, or the column width if smaller.
5. **Controls** before a result: a summary button, the Spin button (60px tall), and a hint "Or swipe the wheel" (only once swipe exists).
   - The summary reads like "Near you, within 2 km, any cuisine, rated 4.0 and up", with "In [area]" instead of "Near you" in area mode. It ends with an underlined "Change" and opens the filter sheet.
6. **Result card** replaces the controls once the wheel lands: kicker "Go makan at", the name, "[distance] away, open now.", a full-width Open in Maps button, then Spin again and Filters side by side, then "Google Maps" in small print (attribution, same container).
7. **Notices** replace the controls when there's no pick (see below).
8. **Footer**, centred: the Look switch (Auto / Day / Night) with the Sound toggle beside it (Sound arrives in PR 2), and under them the "Built4You, episode 1" credit with the tag mark. In the day look the footer stays above the green tile band.

## Wheel

- Up to 20 segments from the real results, labels as now (13 characters, then an ellipsis). Before the first spin, the same blank wheel as now.
- Day: segments fill radius 0.8 of the wheel, and `public/images/wheel-rim-day.png` (600×600, transparent outside and inside the ring) fills the whole wheel box as a floral melamine rim. The rim turns with the wheel. A 2px green edge circle sits outside it. Keep the labels at their current visual size.
- Night: no rim image. Segments fill radius 0.93, a 6px plate ring at 0.93, and 24 bulbs evenly spaced at radius 0.967 (each a 5.5px halo at 0.45 opacity with a 2.6px core).
- A soft sheen over the segments: radial gradient at 35% 28%, white 0.35, then white 0.06 at 45%, then black 0.12 at the edge.
- Pointer at the top, still; hub in the centre.

## Filter sheet

Opens from the summary's Change and from the result card's Filters button. It's a bottom sheet over a dim backdrop (`rgba(20,16,30,0.55)`). `role="dialog"`, `aria-modal`, focus moves in and returns to the opener, Escape and the backdrop close it, focus is trapped while open. It doesn't open mid-spin.

1. Title "Filters" with a Reset button.
2. **Where**: the Near me button ("Finding you…" while locating, "Using your location." once found), the area picker when in area mode, and the line "Your location is only used for this search. It's never stored."
3. **How far?** radio chips: 1, 2, 5, 10 km.
4. **What kind?** a select: Any cuisine, then the existing `CUISINE_LABELS`.
5. **Rated 4.0 and up**, a switch.
6. Done.

If any filter changed when the sheet closes, clear the shown result and notice: the next spin searches again with the new filters.

## Notices

A notice replaces the summary and the Spin button whenever there's no pick, and the Spin button stays hidden while it shows: the notice's own buttons are the next step. The footer stays.

### Card: a paper notice taped to the wall

- Paper `#f6e8cc` in both looks (the pictures' own background, so they blend in). Radius 4px, padding 16px, gaps 12px. Text is always `#1d1d1b` on the paper.
- Day: 2px `#1d1d1b` border, `0 4px 0 #1d1d1b` shadow. Night: 2px `#1a1530` border, glow `0 0 0 1px rgba(255,217,138,0.25), 0 0 36px rgba(255,217,138,0.28)`.
- Tape: an 88×22px strip centred on the top edge (top −11px), rotated −3°, `rgba(255,250,232,0.78)`, shadow `0 1px 2px rgba(0,0,0,0.12)`, `aria-hidden`.
- Top row: the picture (104px, empty `alt`, edges feathered with `mask-image: radial-gradient(circle, #000 58%, transparent 71%)`), then a column with the kicker (Figtree 800, 14/18; day `#1f6b4a`, night `#5b3fd9`) and the headline (`<h2>`, Bungee 20/24).
- An optional body line (Figtree 15/21).
- Buttons: up to two in one row of equal columns, 48px tall, pill. The first is primary (day: `#1f6b4a` with white text; night: `#ff4f8b` with `#1a1530` text). The second is an outline: 2px `#1d1d1b`, transparent, `#1d1d1b` text, in both looks.
- Contrast on the paper: ink 13.9, day kicker 5.3, night kicker 5.5. Add them to the contrast test.

### The wheel while a notice shows

It fades to `saturate(0.2)` at 0.5 opacity, since it has nothing to land on. When out of spins at night, the stall closes instead: the wheel goes to `brightness(0.45) saturate(0.5)`, the roof bulbs turn off (`#4a4560`, no glow) and the neon title turns off (`#8a7f9e`, no glow). Lights off fades over 400 ms with no flicker, and is instant under reduced motion.

### Cases

| Case | Picture | Kicker | Headline | Body | Buttons |
|---|---|---|---|---|---|
| Nothing open | Empty cup | The active filters only: "Within 2 km", plus the cuisine if set, plus "rated 4.0 and up" if on. For example, "Within 10 km, Japanese, rated 4.0 and up" | Nothing open nearby | None below 10 km. At 10 km: "That's as far as it goes. Loosen a filter to see more." | In this order, at most two: "Try [next] km", "Any cuisine" (if a cuisine is set), "Any rating" (if the rating switch is on). If none apply: "Find food in Google Maps". Under the buttons, "Change filters", a text link with a 44px tall tap area, opens the sheet |
| `daily_cap` | Day: shutter. Night: stall | The reset time (see below) | Out of spins for today | "Lapar Wheel has a daily limit so it stays free. Spins come back at 12 am Malaysia time." | "Find food in Google Maps" |
| `ip_daily_cap` | As above | The reset time | You've used today's spins | "Everyone gets 30 a day. They come back at 12 am Malaysia time." | "Find food in Google Maps" |
| `rate_limited` | None | None | Slow down | "Try again in a minute." | "Try again" |
| Other errors | None | None | Something went wrong | None | "Try again" |
| Location refused | None | None | Location is off | `refusedMessage`, then the area picker when allowed | "Spin" (primary, only when the area picker shows), then "Try location again" |

- "Try [next] km", "Any cuisine" and "Any rating" change that filter and spin at once, like the current "Try 5 km?" button. "Try again" spins again.
- "Find food in Google Maps" opens `https://www.google.com/maps/search/?api=1&query=<cuisine> restaurants` (just "restaurants" when no cuisine is set) in a new tab. It's a plain link: no API call, nothing stored.
- Reset time: work out the next 00:00 in Asia/Kuala_Lumpur as an instant. If the device's time zone has the same offset then, the kicker says "Back at midnight". Otherwise it says the time in the device's locale: "Back at 5 pm your time" on 12-hour devices, "Back at 17:00 your time" on 24-hour ones. Put this in one pure function with tests across time zones, including one where it lands on the next calendar day.

## Motion

Everything here respects `prefers-reduced-motion` and a hidden page: no animation, same result.

- **The spin.** Animate frame by frame from the current angle to `wheelRotation`'s target over `SPIN_MS`, easing out (cubic). Still pick first, still always land on the pick.
- **Ticks.** A short click each time a segment boundary passes the pointer: Web Audio, triangle wave, 1700 Hz by day and 2300 Hz by night, gain 0.18 decaying to silence over 35 ms. The audio context starts on the first tap or swipe. On by default, toggled with the Sound button, stored as `lapar-wheel:sound`.
- **Landing buzz.** `navigator.vibrate([30, 40, 60])` where supported.
- **Swipe.** Dragging the wheel turns it (with ticks). Letting go faster than 0.25°/ms starts a spin, exactly like the Spin button. A slow release just leaves it there. The Spin button stays the accessible way to spin; the wheel stays `aria-hidden`.
- **Waiting spin.** While a spin is finding the location or waiting for places, the wheel keeps turning at about 0.12°/ms (after a swipe, easing down from the release speed to that). When the pick is ready, the landing animation starts from wherever the wheel is. If the search fails or comes back empty, it eases to a stop.
- **Night bulbs chase** while the wheel turns: alternate bulbs dim as each segment passes.
- **Lights coming on.** Plays when the look changes from day to night while the page is open: tapping Night, or Auto passing 19:00. It never plays on page load, and it never blocks taps.
  - The colours cross-fade over 400 ms, using the View Transitions API where supported and an instant swap where not.
  - The neon title switches on like a tube: off, a short flash (60 ms), off (80 ms), then on and steady. Two flashes at most.
  - The 13 roof bulbs light left to right, 40 ms apart. Each goes from dark (0.15 opacity, no glow) to a 50 ms flash, 50 ms off, then on with its glow.
  - The 24 wheel bulbs then light clockwise from the pointer, 25 ms apart, the same way. If the wheel is spinning, skip them; the chase covers it.
  - The whole sequence is about 1.3 s. Each bulb flashes at most twice, and the title too, so nothing breaks the three-flashes-a-second limit (WCAG 2.3.1).
  - Night to day has no flicker: the lights fade out with the 400 ms cross-fade.
- **Filter sheet** slides up in 200 ms while the backdrop fades in.
- **Result card** rises 8px and fades in over 180 ms when the wheel lands.
- **Notices.** The wheel fades back, and out of spins at night the stall's lights go off, over 400 ms (see Notices).

Nothing else moves: no page-load animation, no fade-up on scroll.

## Share preview and icons

- `public/og-night.jpg` (1200×630) is the Open Graph and Twitter image (`summary_large_image`) for every visit. Previews are cached by the apps at first share, so it doesn't switch by time.
- `public/apple-touch-icon.png` (180×180, replaces the current one) and `public/favicon-32.png`. The gift-tag favicon stays in the repo for the Built4You credit.
- Image source: generated with Gemini, then cropped, recoloured and resized. No text was generated; titles were added in Bungee and Figtree.
