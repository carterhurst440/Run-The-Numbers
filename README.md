# Run the Numbers Simulator

Run the Numbers is a web-based simulator for the updated First Face ruleset. Stack chips on Ace or numbers 2–10, watch cards land on a neon felt, and track how each hand affects your bankroll over time.

## Getting Started

1. Open `index.html` in any modern browser. This build expects a live Supabase backend; there is no guest/offline mode, so be sure the project URL and anon key in `supabaseClient.js` point to an active instance.
2. Use the **Log In** form when you already have credentials, or click **Create an account** to open the dedicated sign-up screen. New players enter first and last name, email, password, and a confirmation; Supabase emails a verification link, and once you confirm you can return to the Log In view to sign in. After authentication the hash router drops you straight into the shell, and any panels that rely on the `profiles` row show “Setting up your account…” until the Supabase trigger provisions it.
3. Once authenticated you land on the neon “RUN THE NUMBERS” marquee with pulsing **Play Game** and **View Store** buttons. Pick **Play Game** to slide into the simulator, or tap **View Store** to open the live prize shop—cards fan across the page with imagery, cost badges, and a redeem button (sold items remain visible with a banner). A back arrow returns you home, and the hamburger menu always exposes the Supabase-backed dashboard, store, admin tools (when available), and sign-out options.
4. The compact header stays pinned to the top of every in-app page with a live bankroll + Carter Cash readout, the reset button, chart toggle, leaderboard shortcut, and a home icon for one-tap navigation back to the marquee. Theme selection now lives inside the hamburger menu—open it and choose between the **Blue**, **Pink**, or **Orange** presets to restyle the table glow. After each hand the bankroll and Carter Cash values animate so you can see the swing before the next wager.
5. The left panel shows the active paytable above the dealing lane. Tap **Change Paytable** to open a modal with three ladders: Paytable 1 (3×/4×/15×/50×) is active by default, Paytable 2 offers 2×/6×/36×/100×, and Paytable 3 pays 1×/10×/40×/200×. Pick one and apply it before dealing; the selection locks automatically once a hand begins.
6. Cards are dealt directly beneath the active paytable on a single felt panel. Each draw glides into place and longer hands wrap neatly across two rows so streaks stay readable on phones.
7. The right panel is a scrollable betting board. Click the Ace or any numbered square (2–10) to stack chips; spots tighten into multiple rows on narrow screens so nothing overlaps. The footer keeps the centered chip selector above compact **Clear**, **Rebet**, and **Deal Hand** buttons so mobile view only uses two rows of controls.
8. Flip the **Advanced Mode** toggle at the bottom of the betting panel to reveal the additional wager families. **Bust Card** bets cover suits (♥/♣/♠/♦) for 3:1, individual face ranks (Jack/Queen/King) for 2:1, or the Joker for 11:1—each pays *to* 1 so a win returns your stake plus the listed profit and can be stacked at any time. **Card Count** bets must be locked in before dealing, include the bust card itself, and pay 3:1 up to 10:1 when the total number of cards dealt matches your pick (with 8+ covering any longer run). When Advanced Mode is active, a Pause/Play control appears during the deal so you can freeze the action, place bust bets, and resume without missing a draw.
9. Press **Deal Hand** to reveal cards until the first stopper—any Jack, Queen, King, or the Joker. Hits on your wagers use the four-step ladder from the paytable you selected before the hand. Each chip remains in place and is forfeited when the hand stops.
10. After the hand resolves, the table clears automatically—number bets are collected, and advanced bust and card-count wagers disappear whether they won or lost. Tap **Rebet** to restack the layout you used at the start of the previous hand (the paytable stays put), then adjust chips before pressing **Deal Hand**. If your bankroll runs dry, tap **Reset** near the bankroll display to open a confirmation modal. Agreeing restores 1,000 units, wipes stats and history, and also zeroes out any Carter Cash you’ve earned. The header graph icon opens a drawer that combines the bankroll chart with cumulative session stats whenever you want a deeper view. A new leaderboard icon opens a live top-balances drawer, and the menu links to the dashboard, prize shop, theme selector, and sign-out control.
11. Every 1,000 units wagered earns **$1 in Carter Cash**. The simulator tracks how much you have “played through,” awards Carter Cash automatically, and animates the bright-green counter beneath your bankroll whenever a new dollar lands. Carter Cash and its progress toward the next dollar persist with your Supabase profile—even across refreshes—unless you confirm an account reset, which intentionally starts the total back at $0.
12. The realtime leaderboard drawer now always includes your current profile and updates as soon as credits change, so if you’re the only player you’ll still see your name and bankroll sitting in the top slot.
13. The prize shop supports two currencies—Units and Carter Cash. Prize cards show the active cost type, and the client checks your balance before redeeming. Successful purchases deduct the proper currency, refresh your balances, and open a shipping form so you can record a phone number and mailing address. Once submitted, the app emails the administrator with the order and shipping details and marks the listing as sold.

## AI Play Assistant

The PLAY table now includes a floating AI assistant button. It can explain the rules, suggest beginner-friendly strategy, tailor bet sizing to the player's live bankroll and risk tolerance, and draft a bet layout that the player can approve to place on the felt. The assistant never starts the hand.

To enable the OpenAI-backed version in Supabase Edge Functions, deploy `supabase/functions/play-assistant` and set:

- `OPENAI_API_KEY`
- `OPENAI_MODEL` (optional, defaults to `gpt-5-mini`)

If the function or OpenAI credentials are unavailable, the client falls back to a local rules-based assistant so the UI still works.

## Layout Overview

* The main view is split into two responsive panels: the left felt for the active paytable and dealing lane, and the right column for wagering. Each panel holds half of the available play space and scrolls independently—side by side on desktops and stacked top-to-bottom on mobile so both stay visible at once.
* Game stats live inside the bankroll drawer that opens from the header icon, keeping the table surface clear while still offering quick access to hands played, wagered, paid, hold, and house edge.
* The Advanced Mode toggle and pause control sit at the bottom of the betting panel so number bets stay visible while the expanded wager grids slide into view only when needed.
* Cards dealt during a hand scale down slightly and wrap onto a second row when needed, keeping long streaks readable on mobile.
* The active bets summary now lives inside the betting panel and spans its full width, sitting just above the bankroll history chart.
* A neon-styled bankroll history chart pops out from the header graph icon, sitting above the live stats. The canvas continually rescales to fit new data, trimming x-axis labels whenever space gets tight so you can review long sessions without horizontal scrolling.

The simulator always uses a freshly shuffled 53-card deck for each hand with only J/Q/K and the Joker stopping play, matching the latest rule changes.

## Offline mode (no auth or backend)

Supabase calls are now stubbed locally so the experience is always available as a guest. Authentication screens remain hidden, sign-in/out actions are disabled, and all profile, prize, and run data live only in memory for the current session. Reloading the page resets you to a fresh 1,000-unit bankroll and zeroes Carter Cash and history.
