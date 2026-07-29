# Prompt 11_client_2 — Give the client an actual visual design (it currently has none)

**Owner: Raj.** Load `prompts/00_master_context.md` first.

### CRITICAL: what's actually wrong, confirmed by manually loading the app in a browser
Every prompt through Step 11 verified *functional* correctness — button clicks dispatch the right
actions, state updates correctly, the e2e suite drives a real match to completion. **Nothing has ever
checked what the app actually looks like**, because nothing in the SRS's testable requirements forced
that check. Manually opening two tabs revealed the gap directly: every screen renders as unstyled default
browser HTML (plain black-on-white form elements, no layout, no color), and the in-Match arena is
functionally correct but **invisible** — `MatchHUDView.tsx`'s `you-marker`/`opponent-marker` divs track
real positions but have no width, height, or background color, so they render as literally nothing. This
prompt is a real visual design pass across all four screens (Lobby, Champion Select, Match HUD, Results).

### CRITICAL: this is a pure visual/CSS pass — do not change behavior, text content, or test selectors
The Playwright e2e suite (`e2e/match.spec.ts`) has caught five real bugs across two rounds by asserting on
exact button names, headings, and `aria-label`s. **Every one of the following must remain byte-identical**
— restyle them freely (color, size, position, font, icons, animation), but do not rename, remove, or
rewrite the text/attribute itself:

- **aria-labels**: `identify-form`, `champion-roster`, `disconnect-banner`, `you-hud`, `you-cooldowns`,
  `opponent-hud`, `arena`, `you-marker`, `opponent-marker`, `movement-controls`, `ability-controls`.
- **Button text**: `Continue`, `Find Match`, `Cancel`, `Select {championName}` (dynamic per champion —
  keep the `Select ` prefix), `Move Up`/`Move Down`/`Move Left`/`Move Right`, ability buttons (dynamic
  per champion, e.g. `Arcane Bolt` — keep the ability's real `name` as the accessible button text),
  `Return to Queue`.
- **Headings/text**: `Victory`, `Defeat` (as accessible headings — `getByRole('heading', {name: ...})`),
  `Opponent: {username}`, `Reason: {reason text}` (from `ResultsView.tsx`'s `EndReason` → text mapping —
  don't change any of those mapped strings), any text containing `HP {number}` for a participant's health
  (`getByText`/`toContainText` checks on this exact substring).
- **`#username`** as the input element's `id`.

If you're ever unsure whether a change is purely visual or touches one of these, run the e2e suite before
and after that specific change and compare — don't guess. This project has hit "worked locally, broke
somewhere I didn't check" multiple times already; don't be the next one.

### Note on process — this prompt doesn't fit this project's usual TDD pattern
CSS isn't meaningfully unit-testable the way domain logic is. Verification here means two different
things instead: (1) the *existing* Jest and Playwright suites staying 100% green, as proof nothing
functional regressed, and (2) actually looking at the running app — load it in a real browser (or via
whatever browser-automation tooling your session has) and visually confirm each screen, the same way
`11_client_1`'s closing requirement demanded actually loading the built app, not just trusting the build
succeeded. Don't invent meaningless CSS-only Jest assertions just to have something resembling TDD here.

---

### Scope

**1. A shared design foundation.** Add one global stylesheet (plain CSS with custom properties —
`packages/client/src/styles.css` or similar, imported once from the real entry point,
`packages/client/src/index.tsx`), not a new framework dependency (Tailwind, styled-components, etc.) —
this is a course project's client, and a hand-rolled stylesheet is more than sufficient for four screens.
Define a small, cohesive palette and type scale as CSS custom properties (`--color-bg`, `--color-accent`,
etc.) and reuse them everywhere, rather than repeating hex codes per component. Aim for a dark,
combat/fantasy-appropriate aesthetic that actually matches the game's own content (Korr/Vex/Rin, damage/
heal/crowd-control) — not a generic light corporate-SaaS look.

**2. Lobby (`LobbyView.tsx`/`LobbyScreen`).** A centered, legible form — real spacing and typography around
the existing username input and Continue/Find Match/Cancel buttons. Nothing complex; this screen's job is
just to not look like a browser default.

**3. Champion Select (`ChampionSelectView.tsx`/`ChampionSelectScreen`).** Turn the champion roster into
real cards: each champion's HP should be a visual bar (or similarly graphical treatment), not just the
number in text — same idea for the ability list. Give the three champions distinct visual identity (an
accent color per champion is a reasonable, simple approach). Make the countdown and "both players ready"
state visually clear, and give the selected-but-locked-in state (the button's existing `disabled` state)
an obvious visual treatment so a player knows their pick registered.

**4. Match HUD (`MatchHUDView.tsx`/`MatchHUDScreen`) — the most important fix.** This is where "no game to
play" is most literally true:
   - The `arena` container needs a real visible background and border so movement is perceivable at all.
   - `you-marker`/`opponent-marker` need real size, shape, and color (e.g. colored circles), with a
     clearly distinct color for "you" vs. the opponent — right now they're invisible.
   - Health and resource in `you-hud`/`opponent-hud` should be real visual bars, not just text — this is
     literally what SRS 3.1.1 describes ("health and resource bars"), which the current implementation
     only satisfies in the most literal, unstyled sense.
   - `you-cooldowns`' ability cooldowns should read as visual indicators (e.g. a dimmed/greyed button
     with a remaining-time readout) rather than a plain bullet list.
   - The `disconnect-banner` (from `11_shared_4`) should look like a real, attention-grabbing alert, not
     plain paragraph text.
   - Movement/ability buttons should look like real game controls, not default `<button>` elements.

**5. Results (`ResultsView.tsx`/`ResultsScreen`).** Clear win/loss visual treatment (e.g. distinct color
for Victory vs. Defeat), a readable summary of reason/duration, and an obvious Return to Queue action.

### Process
1. Read all four `*View.tsx` files and their paired `*Screen` components in full — the real current
   markup, not this prompt's description of it.
2. Build the shared stylesheet first, then apply it screen by screen.
3. After each screen, run the client's Jest suite for that screen's existing tests — catch a broken
   selector immediately, not after all four screens are done.
4. Once all four are done, run the **full** client Jest suite, then the **full** Playwright e2e suite
   (`npm run test:e2e`) — twice in a row from a cold `docker compose -f docker-compose.test.yml down -v`,
   matching every e2e-touching prompt before this one. This is the real proof nothing broke.
5. Load the app in a browser yourself (`docker compose up --build` + `npm run dev -w @arena/client`,
   exactly as already documented for manual testing) and actually look at all four screens — Lobby,
   Champion Select, an active Match HUD (with a real opponent, so both `you-hud`/`opponent-hud` and the
   arena markers are populated), and Results. Describe what you see in your PR description; if you have
   screenshot tooling, include them.

---

### Verification and Git
Report the real output of the full client Jest suite and the full Playwright e2e suite (both full runs,
not just the screens you touched). Branch `client` from `main` (check `git log` for divergence first —
this project has hit stale-branch conflicts on this exact branch twice before; pull `main` before you
start, not after), commit `Step 11: give the client a real visual design (Lobby, Champion Select, Match
HUD, Results)`, push, open a PR into `main`.

---

### CRITICAL CLOSING REQUIREMENT ###
**CRITICAL: if the e2e suite fails after your changes, the fix is to correct your CSS/markup change, never
to loosen an assertion or rename a selector to match what you built.** Every aria-label and button string
listed above exists because a real bug was once caught through it. Treat them as a contract, not a
suggestion.
