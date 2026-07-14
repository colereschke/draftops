Main Diagnosis

The app has adopted parts of a Linear/Vercel-ish vocabulary: dark shell, muted borders, compact labels, shadcn primitives,
sharper typography. But it has not yet adopted the thing that makes those products feel premium: strong composition,
hierarchy, restraint, and a memorable product-specific visual idea.

Right now the UI still feels like a dark fantasy spreadsheet with slightly nicer controls.

Biggest Improvements I’d Make

1. Give DraftOps a real product identity, not just dark mode

   The current palette is mostly navy/slate with generic purple-blue action color. It reads closer to “default dark
   dashboard” than “beautiful auction command center.” I’d move toward a more distinctive draft-room/market-terminal
   identity:
   - near-black base
   - cooler steel surfaces
   - one sharp electric accent for live auction state
   - warmer money/value color used only for pricing
   - position colors toned down so they don’t fight the brand

   Keep the fantasy context, but make it feel like a professional trading desk for auction drafts.

2. Redesign the sign-in screen completely

   The current sign-in page is the clearest proof of the issue: centered card, logo, Discord button. It works, but it has
   no point of view. See src/app/sign-in/page.tsx:15.

   I’d replace it with a first-impression screen that shows the actual product promise:
   - left/top: DraftOps with a concise line like “Auction control for dynasty rooms.”
   - right/center: a stylized live board preview, not a generic auth card
   - Discord button integrated as the primary action
   - no floating empty void around a small card

3. Make the auction screen feel like the flagship

   The value sheet should be the “wow” surface. Currently the header stacks metadata, budget pills, helper copy, and
   market weight into small bands. See src/components/AuctionSheet/AuctionHeader.tsx:24.

   I’d restructure it into a command-header:
   - left: draft context and current mode
   - center/right: three strong financial numbers
   - bottom: market pressure strip
   - stronger scale contrast, fewer tiny labels
   - one “live auction” treatment for nominated/player-in-room state

4. Remove emoji from core table UI

   The 🔻, 💰, 🔺 labels in src/components/AuctionSheet/PlayerTable.tsx:30 and src/components/AuctionSheet/
   FilterControls.tsx:98 make the product feel less premium. Linear/Vercel would use iconography, labels, or subtle visual
   encoding, not emoji.

   Use lucide icons or plain labels: Floor, Target, Ceiling, with color and alignment doing the work.

5. Reduce visual noise in the table

   The table has many simultaneous signals: zebra rows, left colored bars, position badges, age colors, rookie/pkg/live
   badges, dollar colors, opacity changes, arrows, hardcoded row backgrounds. Individually they are useful. Together they
   flatten hierarchy.

   I’d choose priority:
   - primary: player name and target price
   - secondary: position/team/age
   - alert: nominated/live
   - muted: claimed players

   Claimed rows should probably collapse visually more elegantly than opacity: 0.5, because opacity also weakens
   readability.

6. Unify all page headers

   Auction, Budget Pressure, Team Rosters, and Nomination Helper each repeat similar small uppercase metadata. That gives
   consistency, but not beauty. Create a shared PageHeader system with variants:
   - auction: rich command header
   - split: sidebar/workbench layout for nomination

   Same structure, but different emphasis.

   shadcn gives good primitives, not a finished brand. The current components are technically cleaner, but the design
   language is still mostly token swaps. The visual leap will come from custom composition and product-specific
   components: live board, pressure meters, auction state badges, command bars, roster slot visualization.

7. Make the nav more like an app shell

   The current nav is clean, but very flat: wordmark left, links right. It does not frame the product. I’d make the active
   draft selector more central and useful, with draft state, current budget, or live indicator. The nav should feel like
   operational chrome, not a website header.

Priority Order

1. Redesign sign-in and draft list as the first impression.
2. Redesign the auction header and filter/table hierarchy.
3. Replace emoji and hardcoded colors with a sharper visual system.
4. Create shared page shell/header primitives.
5. Then polish secondary screens.

Overall Read After Seeing Screenshots

The UI is functional and coherent, but it is too visually quiet. Linear and Vercel feel premium because they use restraint
with strong hierarchy. DraftOps currently has restraint without enough contrast, drama, or signature moments.

The app’s best visual direction is actually in Team Rosters and Nominate: those screens start to feel like a tactical
draft room. The weakest first impression is Value Sheet, even though it is probably the most important screen.

Value Sheet

This should be the flagship, but it currently reads like a spreadsheet under a thin stats header.

What hurts it:

- The header is too small and low-drama for the core product screen.
- Budget, spent, remaining are important but visually tucked away.
- The market-weight bar is useful, but it feels like a utility strip, not a premium visual.
- Table text is very dim overall, so nothing really pops except position colors.
- Emojis in Floor / Target / Ceiling make the product feel less refined.
- The page has too many small bands stacked: header, market strip, filters, legend, table.

What I’d do:

- Make the top 180-220px a true “auction command center.”
- Use large Remaining, Spent, and Max Pressure numbers.
- Convert market weight into a more beautiful horizontal “market tape.”
- Remove emoji and replace with crisp labels/icons.
- Make player name and target price the dominant table hierarchy.
- Give nominated/live rows a very intentional treatment, almost like a live market state.

Budget Pressure

This is the cleanest screen structurally. It has a clear job and the buying power bars work.

What hurts it:

- The top half feels empty once the table ends.
- The table is too wide and sparse for only 12 rows.
- Buying power is the hero metric, but the screen does not fully celebrate it.
- The owner row highlight works, but feels like a default selected table row.

What I’d do:

- Add a top summary band: Most Dangerous, You Rank, Room Liquidity, Low Power Teams.
- Make the buying power bars thicker and more distinctive.
- Turn the 12 teams into a tighter ranked pressure board, not a generic table.
- Use the empty space intentionally, maybe with a right-side “threat model” panel.

Team Rosters

This is the strongest screen visually. Expanded rows give it a product-specific feel.

What works:

- The expanded roster sections create rhythm.
- The position color bars feel useful.
- The screen looks more like an app than a spreadsheet.
- There is a clear tactical purpose: inspect team construction.

What hurts it:

- Expanded player rows are too flat and compressed.
- The team row and expanded roster row hierarchy could be cleaner.
- The right-side values are useful but visually disconnected from the player names.
- Team names, owner identity, and roster shape could be more expressive.

What I’d do:

- Lean into this screen as the design reference.
- Make each expanded team feel like a “roster drawer.”
- Add roster composition chips or mini slot meters: QB/RB/WR/TE/Picks.
- Make your team row feel owned, not just selected.
- Use stronger spacing between expanded team groups.

Nominate

This has the most interesting product idea, but the execution is visually busy.

What works:

- Sidebar + main table is a good layout.
- “In Auction” on the left gives the screen a live-room feel.
- Rival demand bars are a genuinely distinctive feature.

What hurts it:

- The rival demand column is dense and repetitive.
- The score number is huge but not emotionally meaningful yet.
- The sidebar feels under-designed compared with its importance.
- Watch and Nom buttons are tiny and low-confidence.
- The table rows are tall, but the information inside still feels cramped.

What I’d do:

- Make the left sidebar a live auction rail with stronger styling.
- Convert rival demand into a cleaner compact visualization.
- Rename or explain “Score” visually, because the number alone feels abstract.
- Make the top-ranked nomination row feel special.
- Treat “Nominate” as a high-confidence action, not a tiny pill.

The Core Design Problem

The redesign changed components, but not enough composition. shadcn will not make this feel like Linear or Vercel by

- stronger page-level layout
- clearer hero metrics
- fewer tiny labels
- a signature DraftOps visual language around auction pressure, live nominations, and budget leverage

My Recommended Direction

> A dark, high-density auction command center with trading-terminal precision and live draft-room pressure.

Then I’d make these system-level changes:

1. Replace generic dark navy with a sharper “market terminal” palette.
2. Use one brand accent for active UI, not position colors everywhere.
3. Reserve position colors for player/team semantics only.
4. Remove emoji from core UI.
5. Make numbers beautiful: larger, tabular, and intentionally spaced.
6. Create shared page shells: CommandHeader, MetricStrip, DataToolbar, LiveRail.
7. Redesign Value Sheet first, because it sets the product’s perceived quality.

If you want the highest-impact next move, I’d redesign only the Value Sheet top section + filters + first 20 table rows as
a visual spike. That would quickly prove whether the product can actually feel premium before converting every screen.
