import { test, expect, Page, BrowserContext } from '@playwright/test';

/**
 * NOT part of the regular automated regression suite — this file has to match Playwright's default
 * `*.spec.ts` discovery pattern to be runnable via an explicit path at all, so it's gated instead by an
 * environment variable: `npm run test:e2e` / CI's bare `playwright test` runs with that variable unset,
 * so this single test skips itself immediately and harmlessly. Run it explicitly and on demand:
 *
 *   CAPTURE_SCREENSHOTS=1 npx playwright test e2e/capture-acceptance-screenshots.spec.ts
 *
 * Drives one continuous, real two-player match against the same real server/api/postgres/client stack
 * `match.spec.ts` uses (same playwright.config.ts, same global-setup.ts) and saves real PNG screenshots
 * to docs/screenshots/ at each point named in docs/acceptance-test-execution.md — every distinct client
 * screen plus the system's one real transient pop-up (the disconnect banner) and the one inline error
 * alert (an empty-username submission). This is the actual "description of execution... illustrated with
 * screenshots" artifact for the course submission, not a pass/fail regression test — assertions below
 * exist only to fail loudly and early if the scripted flow itself breaks, not as the deliverable's point.
 */

const SCREENSHOT_DIR = 'docs/screenshots';

async function shot(page: Page, name: string): Promise<void> {
  // fullPage: true -- the in-Match HUD (banner + hud-row + arena + controls) is taller than the default
  // viewport, so a viewport-only screenshot risks scrolling content (like the disconnect banner) out of
  // frame depending on where the page happened to auto-scroll to from the most recent click.
  await page.screenshot({ path: `${SCREENSHOT_DIR}/${name}.png`, fullPage: true });
}

async function holdKey(page: Page, key: string, durationMs: number): Promise<void> {
  await page.keyboard.down(key);
  await page.waitForTimeout(durationMs);
  await page.keyboard.up(key);
}

/** Same real repositioning match.spec.ts's own moveIntoRangeAndClearSight requires post-11_cross_1 —
 *  see that function's own doc comment in match.spec.ts for the full why. */
async function moveIntoRangeAndClearSight(attacker: Page, defender: Page): Promise<void> {
  await Promise.all([holdKey(attacker, 's', 500), holdKey(defender, 's', 500)]);
  await holdKey(attacker, 'd', 600);
}

const arcaneBoltCooldown = (page: Page) =>
  page.locator('ul[aria-label="you-cooldowns"] li', { hasText: 'arcane-bolt' });

async function castArcaneBolt(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Arcane Bolt' }).click();
  await page.locator('div[aria-label="opponent-marker"]').click();
}

test.describe('acceptance test execution — full match lifecycle screenshots', () => {
  let aliceContext: BrowserContext;
  let bobContext: BrowserContext;

  test.afterEach(async () => {
    await aliceContext?.close();
    await bobContext?.close();
  });

  test('captures every screen and pop-up along one real match', async ({ browser }) => {
    test.skip(
      process.env.CAPTURE_SCREENSHOTS !== '1',
      'documentation-generation script, not a CI regression test — run with CAPTURE_SCREENSHOTS=1 to execute',
    );

    aliceContext = await browser.newContext();
    const alice = await aliceContext.newPage();

    // --- AT-01 / AT-02: Player Identification -----------------------------------------------------
    await alice.goto('/');
    await shot(alice, '01-identify-form-empty');

    // AT-02: submit with an empty username -- the client-side precheck (R1.1) should reject this with
    // a human-readable alert (3.6.5), not a silent failure.
    await alice.getByRole('button', { name: 'Continue' }).click();
    await expect(alice.getByRole('alert')).toBeVisible();
    await shot(alice, '02-identify-error-empty-username');

    // AT-01: a valid username succeeds.
    await alice.locator('#username').fill('Alice');
    await alice.getByRole('button', { name: 'Continue' }).click();
    await expect(alice.getByText('Welcome, Alice')).toBeVisible();
    await shot(alice, '03-lobby-idle');

    // --- AT-05: Matchmaking Queue (join) -----------------------------------------------------------
    await alice.getByRole('button', { name: 'Find Match' }).click();
    await expect(alice.getByText(/Position in queue/)).toBeVisible();
    await shot(alice, '04-lobby-queued');

    // --- AT-07: a second player joins and pairs with Alice ------------------------------------------
    bobContext = await browser.newContext();
    const bob = await bobContext.newPage();
    await bob.goto('/');
    await bob.locator('#username').fill('Bob');
    await bob.getByRole('button', { name: 'Continue' }).click();
    await bob.getByRole('button', { name: 'Find Match' }).click();

    await expect(alice.locator('ul[aria-label="champion-roster"]')).toBeVisible();
    await expect(bob.locator('ul[aria-label="champion-roster"]')).toBeVisible();
    await expect(alice.getByText('Opponent: Bob')).toBeVisible();

    // --- AT-09: both players see the identical roster ------------------------------------------------
    await shot(alice, '05-champion-select-roster');

    // --- AT-10: a selection is broadcast to the opponent in real time --------------------------------
    await alice.getByRole('button', { name: 'Select Vex' }).click();
    await expect(alice.getByText('You selected: vex')).toBeVisible();
    await shot(alice, '06-champion-select-one-selected');

    // --- AT-11: the match begins immediately once both have selected ---------------------------------
    await bob.getByRole('button', { name: 'Select Vex' }).click();
    await expect(alice.locator('div[aria-label="movement-controls"]')).toBeVisible();
    await expect(bob.locator('div[aria-label="movement-controls"]')).toBeVisible();

    // --- AT-13: movement -------------------------------------------------------------------------------
    await alice.getByRole('button', { name: 'Move Up' }).click();
    await bob.getByRole('button', { name: 'Move Down' }).click();

    // Real repositioning (11_cross_1 — see moveIntoRangeAndClearSight's own comment).
    await moveIntoRangeAndClearSight(alice, bob);

    // --- AT-14 / AT-18: a valid ability hit, visible on both clients -----------------------------------
    await castArcaneBolt(alice);
    await alice.waitForTimeout(150); // catch the cast-effect/damage-popup animation mid-flight
    await shot(alice, '07-match-hud-combat');
    await expect(arcaneBoltCooldown(alice)).toHaveCount(1, { timeout: 5_000 });
    await expect(alice.locator('div[aria-label="opponent-hud"]')).toContainText('HP 53');
    await expect(arcaneBoltCooldown(alice)).toHaveCount(0, { timeout: 10_000 });

    // --- AT-22: opponent disconnect banner + grace-period hold ------------------------------------------
    await bobContext.setOffline(true);
    const banner = alice.locator('p[aria-label="disconnect-banner"]');
    await expect(banner).toBeVisible({ timeout: 20_000 });
    await expect(banner).toContainText('30');
    await shot(alice, '08-disconnect-banner');

    // --- AT-23: reconnect within the grace period restores play with no state loss ----------------------
    await bobContext.setOffline(false);
    await expect(banner).toBeHidden({ timeout: 20_000 });
    await castArcaneBolt(alice);
    await expect(arcaneBoltCooldown(alice)).toHaveCount(1, { timeout: 5_000 });
    await expect(alice.locator('div[aria-label="opponent-hud"]')).toContainText('HP 21');
    await shot(alice, '09-reconnected-combat-resumed');
    await expect(arcaneBoltCooldown(alice)).toHaveCount(0, { timeout: 10_000 });

    // --- AT-19 / AT-20: elimination win condition + Results screen ---------------------------------------
    await castArcaneBolt(alice);
    await expect(alice.getByRole('heading', { name: 'Victory' })).toBeVisible({ timeout: 20_000 });
    await expect(alice.getByText('Reason: Elimination')).toBeVisible();
    await shot(alice, '10a-results-victory');

    await expect(bob.getByRole('heading', { name: 'Defeat' })).toBeVisible({ timeout: 20_000 });
    await shot(bob, '10b-results-defeat');

    // --- AT-27 / AT-29: Leaderboard, reached from the real Results screen --------------------------------
    // Navigates once, then polls via the real Refresh button -- MatchReportingListener's report to the
    // api is fire-and-forget (master context §2.3), so the leaderboard may not reflect this match on the
    // very first fetch-on-mount. This same wait also guarantees the AT-25 check below finds a persisted
    // match, rather than needing its own separate retry loop for the same fire-and-forget report.
    await alice.getByRole('button', { name: 'View Leaderboard' }).click();
    const aliceRow = alice.locator('ul[aria-label="leaderboard-entries"] li', { hasText: 'Alice' });
    const deadline = Date.now() + 20_000;
    while (Date.now() < deadline && !(await aliceRow.isVisible().catch(() => false))) {
      await alice.getByRole('button', { name: 'Refresh' }).click();
      await alice.waitForTimeout(500);
    }
    await expect(aliceRow).toBeVisible();
    await expect(alice.locator('ul[aria-label="champion-win-rates"] li', { hasText: 'Vex' })).toBeVisible();
    await shot(alice, '11-leaderboard');

    // NOTE (AT-25, R7.1): deliberately NOT verified here. GET /players/:id/matches expects the
    // *canonical* server-resolved player id (PlayerRepository.findOrCreateByUsername, keyed by
    // username) -- not the client's own transient session-generated `arena:playerId` -- and no
    // client-facing response (including the leaderboard's own LeaderboardEntryDTO) ever exposes that
    // canonical id. There is genuinely no way to exercise this endpoint the way a real client could;
    // this is itself a real, useful confirmation that R7.3's client-side history view was correctly
    // scoped as "Desired," not "Essential," in the SRS -- the API was never actually meant to be
    // called this way from outside the system. See docs/acceptance-test-cases.md's AT-25 entry.
  });
});
