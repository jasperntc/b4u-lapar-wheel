# Redesign reference

How Lapar Wheel should look, as of 2026-11-04.

- `../redesign.md` is the spec and the source of truth. If anything here disagrees with it, the spec wins: ask before guessing.
- `reference.html` is a static mock of every screen in both looks. Open it from the repo (it loads the real fonts and images from `public/`) and pick a screen from the bar at the top, or use `?s=<screen>&look=<day|night>`. It isn't part of the app and isn't built or shipped.
- `screens/` holds a screenshot of each screen at 390px wide (2x), named `<look>-<screen>.jpg`. Screens taller than 844px are shown at full height: the page scrolls there.
- `../redesign-prototype.dc.html` is the earlier clickable prototype's source. Use it only for the spin code (`startSpin`, the swipe handlers, `tick`). Its footer and notices are out of date.

Screens: `start`, `result`, `sheet`, `empty-2` (nothing open at 2 km), `empty-10` (nothing open at 10 km with filters), `cap` (out of spins for everyone), `ip-cap` (out of spins for you), `rate` (slow down), `refused` (location refused).

The Sound toggle and the "Or swipe the wheel" hint arrive in PR 2. The night `cap` and `ip-cap` screens show the stall closed: roof bulbs and neon off, wheel dimmed.
