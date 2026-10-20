Built4You is a series where I build a small app for someone who asked, film it, and send it to them. The brand is a parcel: kraft cardboard, white shipping labels, rubber stamps, a handwritten "To:" line and a gift tag. Everything here applies to the hub site, each episode site and the Instagram stories.

## Content fundamentals

- Write in first person, as me: "I built this for my friend", not "Built4You presents".
- Sentence case everywhere, stamps and buttons included. No all-caps labels.
- Plain and short, one idea per sentence. Say what the app does before how it was built.
- Use a Malay or Manglish word only when it is the subject's own word (lapar, makan, tapau).
- Name the person who asked only after they have agreed to be credited. Until then, describe them: "the friend who can't decide".
- No emoji as decoration. No arrows on buttons or links. No "A · B · C" meta strings: write a sentence or use separate lines.
- Real copy to model on: "My friend couldn't decide where to eat, so I built her a wheel." / "What should I build you?" / "Shipped. Go spin it."

## Colour

- The ground is `surface-kraft`: page background, hero band and every story. Only `ink` text sits directly on it. `stamp` may sit on light kraft at 24px and up, or as a mark.
- Content goes on `surface-label` paper with a `label-edge` border and `shadow-label`. All body copy, captions and forms live on labels.
- Text on labels is `ink`; captions are `ink-soft`. Links are `stamp`, underlined.
- `stamp` (rubber-stamp violet) is the one accent: the primary button, links, stamps and the logo tag. Text on a stamp fill is `on-stamp`.
- `stamp-green` is used for the Shipped stamp and nothing else.
- The seven `wheel-*` colours belong to the Wheel only, so it stays the one multicolour thing in the series.
- Focus rings are 2px solid `focus` with a 2px offset on every interactive element.
- Every text pair meets WCAG AA (4.5:1) in both themes; each token's note gives its ratio. In dark mode the kraft becomes dark cardboard and labels keep their outline through `label-edge`.

## Type

- One family, Bricolage Grotesque, used two ways. Headings are condensed (`font-variation-settings: "wdth" 75`) and heavy, like a shipping-label header: `display-xl` for the hub hero, `display` for episode titles, `title` for labels and sections, `stamp-text` inside stamps.
- Running text is the same family at normal width: `body` (17/26, at most 70 characters a line), `body-sm` for captions and credits, `button` for buttons.
- Caveat (`hand`) is for the handwritten "To:" line and the odd margin note: one line, never a paragraph, never a button.
- Both fonts are files in this system (`fonts/`), under the SIL Open Font License. On the sites they are served from `public/fonts/` by the `@font-face` rules in `app/brand-tokens.css`, with Bricolage Grotesque preloaded in the root layout. Don't add `next/font` or a second copy of the fonts.
- The one bold thing on any page is the condensed headline. Keep everything around it quiet.

## Shape, depth and motion

- Corners carry hierarchy: `radius-xs` stamps, `radius-sm` labels and inputs, `radius-md` buttons, `radius-pill` only for the wheel's spin button.
- Spacing steps run `space-1` to `space-16`. Gutter is `space-4` on phones and `space-6` on desktop.
- Labels use `shadow-label` and never tilt. Stamps tilt −4° (Shipped −7°): the only rotation in the system.
- Buttons use `shadow-press`, which disappears on press so the button sinks 3px.
- Motion is reserved for one moment per page: the wheel spin, or a stamp landing on a label when an episode ships. No fade-up on scroll. Respect reduced motion everywhere.

## Layout

- Left-aligned throughout. The hero is kraft with a condensed headline and the tag mark; below it, episodes are ShippingLabels in a simple grid.
- An episode page is one label-white column on kraft, with the app itself as the hero, not a description of it.
- Numbered markers only where there is a real sequence (episodes).

## Components

- **Button**: primary (`stamp`) for the main action on a screen, outline for everything else.
- **Stamp**: an episode's stage (Idea, Picked, Building, Shipped), always written as a word.
- **ShippingLabel**: the episode card, with a handwritten To: line, the app name, one sentence, the episode number and a Stamp.
- **Wheel**: the multicolour spinner from Lapar Wheel.
- **StoryFrame**: the 1080 × 1920 Instagram story layout.

## Instagram stories

- Stories always use the light values: `surface-kraft` ground and `ink` type.
- Keep text and stickers out of the top 220px and bottom 280px. Side margins are `space-16` (64px).
- Headline in `story-headline` (condensed), at most three lines. Supporting line in `story-body`, at most two.
- Leave a clear 760 × 360 zone for Instagram's own sticker and point at it with one `story-hand` note.
- One job per story: ask, show progress, or reveal. The tag mark sits bottom-left of the safe area.
- This replaces the old sky-blue and yellow story set. Don't mix the two.

## Logo and icon

- The mark is a violet gift tag with a condensed "4", on a string. Files are in the Logos group, with usage rules in its README.
- The lockup pairs the tag with "Built4You" in condensed Bricolage, all one colour.
- The favicon is the tag without its string and switches to dark colours by itself.
- The wheel is the first episode's motif and stays out of the mark.
