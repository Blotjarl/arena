# Prompt 11_client_5 — Fix the spawn-in-corner render bug; verify WASD for real

**Owner: Raj.** Load `prompts/00_master_context.md` first. **Highest priority of the current batch** — this
is a real regression affecting basic playability, found by manual play.

### CRITICAL: the confirmed root cause — already diagnosed, don't re-derive it
`packages/client/src/view/MatchHUDView.tsx`'s `modelChanged(event)` only pushes a snapshot into the
rendering `InterpolationBuffer` when `event.type === 'matchState'`:
```ts
modelChanged(event: ModelEvent): void {
  if (event.type === 'matchState') {
    this.interpolation.push(event.payload as MatchStatePayload);
  }
  this.onUpdate?.();
}
```
But `ClientMatchModel.applyMatchStart()` fires a **`'matchStart'`**-typed event (`packages/client/src/model/ClientMatchModel.ts`),
whose payload is a `MatchStartPayload` carrying the real spawn positions in `payload.initialState` — a
`MatchStatePayload`. That event is never routed into the buffer at all. Confirmed directly, not assumed:
in an isolated Playwright script, both markers' computed `left`/`top` were exactly `0px` on first paint
(the `InterpolationBuffer`'s own "empty buffer" fallback), self-correcting only once the first real
`'matchState'` tick arrived. **Movement itself was confirmed working in that same isolated test** — five
"Move Right" clicks correctly moved the marker to a real, non-zero position — so don't assume clicks are
broken; the confusing initial corner-stack is the actual, confirmed bug.

### Fix
`modelChanged` needs to push a snapshot into the interpolation buffer on **both** `'matchStart'` and
`'matchState'` — extracting `event.payload.initialState` for the former, using `event.payload` directly
for the latter (their payload shapes differ; don't assume they're interchangeable without checking the
real types in `packages/shared/src/contract/events.ts`). Write a test first that reproduces the bug in
isolation (construct a `MatchHUDView`, fire a `'matchStart'`-typed `ModelEvent` with a payload whose
`initialState` has non-zero, distinct participant positions, then assert `getInterpolationBuffer().getInterpolatedPosition(...)`
returns those real positions, not `(0,0)`) before fixing the implementation — this is exactly the kind of
regression this project's whole testing discipline exists to catch, and this specific bug had zero coverage.

### Also required: actually verify WASD, don't assume it works or is broken
The bug report also claimed WASD doesn't move the character. This wasn't independently confirmed (only
click-based movement was tested in isolation) — it's plausible the same corner-stack rendering bug is the
entire explanation and WASD works fine once this fix lands, or there's a genuine separate WASD issue, or
the report was affected by something outside the app (e.g. a browser overlay/extension intercepting
keystrokes — the reporting screenshot showed an FPS/GPU/CPU overlay that could plausibly be capturing
WASD). **Test it for real**, in a real browser, after your fix: hold `w`/`a`/`s`/`d` and confirm the
character actually moves continuously (per `11_client_3`'s hold-to-move design). If you find a genuine
WASD-specific bug, fix it and document what it actually was — don't guess or assume based on the report
alone.

### Process
1. Read the real current `MatchHUDView.tsx`, `ClientMatchModel.ts`, and `packages/shared/src/contract/events.ts`
   in full before writing anything.
2. Write the regression test described above, watch it fail against the current code, fix
   `modelChanged`, watch it pass.
3. Run the full client Jest suite, then the full Playwright e2e suite (`npm run test:e2e`), twice in a row
   from a cold `docker compose -f docker-compose.test.yml down -v`.
4. Load the app in a real browser, play a real match, and confirm: markers appear at their real, distinct
   spawn positions immediately (no visible corner-stack, even briefly), click-based movement works, and
   WASD hold-to-move works. Describe exactly what you observed in your PR description — including the
   WASD verification specifically, since that's the part this prompt can't take on faith.

---

### Verification and Git
Report the real output of the full client Jest suite and the full Playwright e2e suite. Branch `client`
from `main` (check `git log` for divergence first), commit `Step 11: fix spawn-in-corner render bug
(matchStart events never reached the interpolation buffer)`, push, open a PR into `main`.

---

### CRITICAL CLOSING REQUIREMENT ###
**CRITICAL: this fix must not depend on the timing of the first `match:state` tick arriving quickly —
verify it by asserting the correct behavior on the very first render, synchronously, not by adding a wait
that happens to paper over the bug. A future slower tick loop or network hiccup should not be able to
reintroduce this symptom.**
