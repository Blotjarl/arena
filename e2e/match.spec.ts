import { test, expect, Page, BrowserContext, APIRequestContext } from '@playwright/test';
import type { LeaderboardEntryDTO } from '@arena/shared';
import { API_PORT } from './global-setup';

/**
 * The one required Playwright end-to-end acceptance test (Step 11, R-D5, 3.6.4): two independent
 * "browsers" (separate BrowserContexts — never two tabs sharing one context, which would share
 * cookies/storage in a way real separate players never do) play a complete match, connection through
 * match end, against the real server/api/client/shared stack (see playwright.config.ts + global-setup.ts).
 *
 * Both players pick Vex (85 HP, per docs/01_class_list.md's roster table) — the lowest-HP, highest-
 * single-hit-damage champion in the roster — and one player (Alice) repeatedly casts Arcane Bolt
 * (32 damage, 4s cooldown) at the other (Bob) while Bob never fights back. Three casts (96 damage)
 * reliably eliminates an 85 HP target, giving a clean, deterministic ELIMINATION win/loss (not a draw)
 * without needing to fight two live combatants to the wire — chosen over the 5-minute TIME_LIMIT path
 * as the far faster deterministic option to drive within a real Playwright test.
 */

async function identifyAndQueue(page: Page, username: string): Promise<void> {
  await page.goto('/');
  await page.locator('#username').fill(username);
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByRole('button', { name: 'Find Match' }).click();
}

async function selectChampion(page: Page, championName: string): Promise<void> {
  await expect(page.locator('ul[aria-label="champion-roster"]')).toBeVisible();
  await page.getByRole('button', { name: `Select ${championName}` }).click();
}

async function holdKey(page: Page, key: string, durationMs: number): Promise<void> {
  await page.keyboard.down(key);
  await page.waitForTimeout(durationMs);
  await page.keyboard.up(key);
}

/**
 * CORRECTION (11_cross_1): the arena widened to 720 (from 600), putting the two default spawns 620
 * units apart — Arcane Bolt's 600 range no longer reaches between them at all. Separately, obstacles now
 * block ability line of sight (not just movement), and the straight line between the two default spawns
 * passes squarely through both obstacle pillars' y-range regardless of x. Neither gap existed when this
 * suite was first written. Both players hold 's' (down) first — clearing the pillars' y-band entirely,
 * so the line between them can never cross an obstacle at any x from here on — then the attacker holds
 * 'd' (right) to close enough of the remaining x-distance to come back within range. Real WASD input,
 * not a symbolic single click — this is genuinely what real play now requires post-11_cross_1, not just
 * a workaround to make the test pass.
 */
async function moveIntoRangeAndClearSight(attacker: Page, defender: Page): Promise<void> {
  await Promise.all([holdKey(attacker, 's', 500), holdKey(defender, 's', 500)]);
  await holdKey(attacker, 'd', 600);
}

const arcaneBoltCooldown = (page: Page) =>
  page.locator('ul[aria-label="you-cooldowns"] li', { hasText: 'arcane-bolt' });

/**
 * Casts Arcane Bolt, then waits for its 4s cooldown to actually appear and then clear before
 * returning — clicking again the instant the cooldown display disappears would race the very first
 * tick after casting (the li hasn't rendered yet, so "0 matches" is trivially true for the wrong
 * reason), which would silently re-fire while genuinely still on cooldown (the server just ignores an
 * on-cooldown ability use, R4.2) and never land a second hit. Waiting for the cooldown to *appear*
 * first proves the server actually processed this cast before we wait for it to clear.
 *
 * CORRECTION (11_cross_1): Arcane Bolt (DAMAGE) is now a skillshot — clicking the ability button alone
 * only enters aim mode, it no longer casts by itself. The real cast now needs a second click inside the
 * arena to aim it; clicking directly on the opponent's own marker (real DOM element, real bounding box)
 * aims exactly at their true position regardless of viewport size or arena scale, guaranteeing perfect
 * alignment — the same "aim exactly at the opponent" pattern this project's own MatchModel.test.ts uses
 * for its skillshot hit-resolution unit tests.
 */
async function castArcaneBoltAndWaitForCooldown(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Arcane Bolt' }).click();
  await page.locator('div[aria-label="opponent-marker"]').click();
  await expect(arcaneBoltCooldown(page)).toHaveCount(1, { timeout: 5_000 });
  await expect(arcaneBoltCooldown(page)).toHaveCount(0, { timeout: 10_000 });
}

/**
 * Polls `GET /leaderboard` (real HTTP, via Playwright's built-in `request` fixture) until the named
 * player has a recorded entry, or `timeoutMs` elapses. Necessary because `MatchReportingListener`'s calls
 * to the api are fire-and-forget from the server's perspective (master context §2.3) — a single
 * immediate check right after the match ends would be flaky, catching the leaderboard mid-write rather
 * than actually verifying persistence.
 */
async function pollLeaderboardEntry(
  request: APIRequestContext,
  username: string,
  timeoutMs = 15_000,
): Promise<LeaderboardEntryDTO | undefined> {
  const deadline = Date.now() + timeoutMs;
  let entries: LeaderboardEntryDTO[] = [];
  while (Date.now() < deadline) {
    const res = await request.get(`http://localhost:${API_PORT}/leaderboard`);
    entries = await res.json();
    const entry = entries.find((e) => e.username === username);
    if (entry) return entry;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  return entries.find((e) => e.username === username);
}

test.describe('a complete Arena match', () => {
  let attackerContext: BrowserContext;
  let defenderContext: BrowserContext;

  test.afterEach(async () => {
    await attackerContext?.close();
    await defenderContext?.close();
  });

  test('two players connect, queue, select champions, fight, and reach a consistent result', async ({ browser, request }) => {
    attackerContext = await browser.newContext();
    defenderContext = await browser.newContext();
    const attacker = await attackerContext.newPage();
    const defender = await defenderContext.newPage();

    await identifyAndQueue(attacker, 'Alice');
    await identifyAndQueue(defender, 'Bob');

    // Both reach Champion Select, matched against each other — opponent username visible on each side.
    await expect(attacker.locator('ul[aria-label="champion-roster"]')).toBeVisible();
    await expect(defender.locator('ul[aria-label="champion-roster"]')).toBeVisible();
    await expect(attacker.getByText('Opponent: Bob')).toBeVisible();
    await expect(defender.getByText('Opponent: Alice')).toBeVisible();

    await selectChampion(attacker, 'Vex');
    await selectChampion(defender, 'Vex');

    // Both reach the Match HUD.
    await expect(attacker.locator('div[aria-label="movement-controls"]')).toBeVisible();
    await expect(defender.locator('div[aria-label="movement-controls"]')).toBeVisible();
    await expect(attacker.locator('div[aria-label="ability-controls"]')).toBeVisible();

    // Touch the movement buttons too (a real player action the HUD exposes and the server validates —
    // exercise it for real; a single click each is a token amount, not the real repositioning below).
    await attacker.getByRole('button', { name: 'Move Up' }).click();
    await defender.getByRole('button', { name: 'Move Down' }).click();

    // CORRECTION (11_cross_1): real repositioning is now required before any cast can land at all — see
    // moveIntoRangeAndClearSight's own doc comment for why the default spawns no longer suffice.
    await moveIntoRangeAndClearSight(attacker, defender);

    // Three Arcane Bolts (32 damage each) reliably eliminate Vex's 85 HP; Bob never fights back, so the
    // outcome is deterministic — Alice wins, Bob loses, no draw risk. No need to wait out the third
    // cast's own cooldown — the match ends (ELIMINATION) as soon as it lands.
    await castArcaneBoltAndWaitForCooldown(attacker);
    await castArcaneBoltAndWaitForCooldown(attacker);
    await attacker.getByRole('button', { name: 'Arcane Bolt' }).click();
    await attacker.locator('div[aria-label="opponent-marker"]').click();

    await expect(attacker.getByRole('heading', { name: 'Victory' })).toBeVisible({ timeout: 20_000 });
    await expect(attacker.getByText('Reason: Elimination')).toBeVisible();
    await expect(defender.getByRole('heading', { name: 'Defeat' })).toBeVisible({ timeout: 20_000 });
    await expect(defender.getByText('Reason: Elimination')).toBeVisible();

    await expect(attacker.getByRole('button', { name: 'Return to Queue' })).toBeVisible();
    await expect(defender.getByRole('button', { name: 'Return to Queue' })).toBeVisible();

    // R7.1-R7.4/R8.1-R8.3: the server reports this match's begin/end to the api over HTTP
    // (MatchReportingListener, fire-and-forget), which persists it and folds it into the leaderboard.
    // Poll rather than check once immediately -- see pollLeaderboardEntry's own doc comment.
    const [aliceEntry, bobEntry] = await Promise.all([
      pollLeaderboardEntry(request, 'Alice'),
      pollLeaderboardEntry(request, 'Bob'),
    ]);

    expect(aliceEntry, 'Alice (the winner) should have a persisted leaderboard entry').toBeDefined();
    expect(aliceEntry!.wins).toBe(1);
    expect(aliceEntry!.losses).toBe(0);

    expect(bobEntry, 'Bob (the loser) should have a persisted leaderboard entry').toBeDefined();
    expect(bobEntry!.wins).toBe(0);
    expect(bobEntry!.losses).toBe(1);

    // CORRECTION (11_client_7): everything above this point only ever verified /leaderboard via a direct
    // Playwright HTTP request, bypassing the UI entirely -- there was no UI to go through. Now there is:
    // click the real "View Leaderboard" button on the real Results screen and confirm the real winner's
    // row actually renders, through the real client -> api fetch, not a mock. The poll above already
    // guaranteed the fire-and-forget report has landed, so this doesn't need its own retry loop.
    await attacker.getByRole('button', { name: 'View Leaderboard' }).click();
    const aliceRow = attacker.locator('ul[aria-label="leaderboard-entries"] li', { hasText: 'Alice' });
    await expect(aliceRow).toBeVisible();
    await expect(aliceRow).toContainText('1W');
    await expect(attacker.locator('ul[aria-label="champion-win-rates"] li', { hasText: 'Vex' })).toBeVisible();

    // Back returns to the real Results screen the phase-based routing would otherwise show.
    await attacker.getByRole('button', { name: 'Back' }).click();
    await expect(attacker.getByRole('heading', { name: 'Victory' })).toBeVisible();
  });
});

/**
 * R6.1-R6.4 disconnect/reconnect, exercised for real: server-side wiring (10_server_10), client-side
 * emission (10_client_10), and grace-period logic (09_server_5) had each only ever been tested in
 * isolation with mocks before this. `BrowserContext.setOffline(true)` simulates a real network-level
 * drop — the underlying Socket.IO connection actually disconnects and the server detects a genuine
 * 'disconnect' event, not a mocked one (see Playwright docs on setOffline).
 */
test.describe('disconnect and reconnect during an active match (R6.1-R6.4)', () => {
  let attackerContext: BrowserContext;
  let defenderContext: BrowserContext;

  test.afterEach(async () => {
    await attackerContext?.close();
    await defenderContext?.close();
  });

  test('the remaining player sees a disconnect banner, and play resumes correctly once the disconnected player reconnects within the grace period', async ({
    browser,
  }) => {
    attackerContext = await browser.newContext();
    defenderContext = await browser.newContext();
    const attacker = await attackerContext.newPage();
    const defender = await defenderContext.newPage();

    await identifyAndQueue(attacker, 'Carol');
    await identifyAndQueue(defender, 'Dave');

    await expect(attacker.locator('ul[aria-label="champion-roster"]')).toBeVisible();
    await expect(defender.locator('ul[aria-label="champion-roster"]')).toBeVisible();

    await selectChampion(attacker, 'Vex');
    await selectChampion(defender, 'Vex');

    await expect(attacker.locator('div[aria-label="movement-controls"]')).toBeVisible();
    await expect(defender.locator('div[aria-label="movement-controls"]')).toBeVisible();

    // CORRECTION (11_cross_1): real repositioning is now required before any cast can land — see
    // moveIntoRangeAndClearSight's own doc comment. Done before the disconnect simulation below;
    // position isn't affected by a network drop, so there's no reason to interleave the two concerns.
    await moveIntoRangeAndClearSight(attacker, defender);

    // Drop Dave's real network connection. Carol's client should see the server's real
    // match:player_disconnected broadcast and show the Part 1 banner (R6.2, 3.6.5 Usability).
    await defenderContext.setOffline(true);

    const banner = attacker.locator('p[aria-label="disconnect-banner"]');
    await expect(banner).toBeVisible({ timeout: 20_000 });
    await expect(banner).toContainText('30');

    // Well inside the 30s grace period — the match must not have ended yet (R6.1).
    await expect(attacker.getByRole('heading', { name: /Victory|Defeat/ })).not.toBeVisible();

    // A real but modest wait — long enough to prove the connection genuinely dropped (not a mock),
    // short enough not to risk the full 30s grace period expiring (that's a separate, optional test).
    await attacker.waitForTimeout(5_000);

    // Reconnect. This exercises ClientMain's real 'connect' handler (10_client_10), which must
    // re-identify and then emit a real match:reconnect for the still-active match.
    await defenderContext.setOffline(false);

    await expect(banner).toBeHidden({ timeout: 20_000 });

    // Play resumes, bidirectionally, proving match state wasn't corrupted by the disconnect: Carol
    // (still connected throughout) lands an Arcane Bolt on Dave, then Dave — now reconnected — lands
    // one back on Carol. Both are Vex (85 HP); Arcane Bolt deals 32.
    await castArcaneBoltAndWaitForCooldown(attacker);
    await expect(attacker.locator('div[aria-label="opponent-hud"]')).toContainText('HP 53');

    await castArcaneBoltAndWaitForCooldown(defender);
    await expect(defender.locator('div[aria-label="opponent-hud"]')).toContainText('HP 53');
  });

  test('a disconnected player who never reconnects is forfeited once the real 30s grace period elapses', async ({
    browser,
  }) => {
    attackerContext = await browser.newContext();
    defenderContext = await browser.newContext();
    const attacker = await attackerContext.newPage();
    const defender = await defenderContext.newPage();

    await identifyAndQueue(attacker, 'Erin');
    await identifyAndQueue(defender, 'Frank');

    await expect(attacker.locator('ul[aria-label="champion-roster"]')).toBeVisible();
    await expect(defender.locator('ul[aria-label="champion-roster"]')).toBeVisible();

    await selectChampion(attacker, 'Vex');
    await selectChampion(defender, 'Vex');

    await expect(attacker.locator('div[aria-label="movement-controls"]')).toBeVisible();
    await expect(defender.locator('div[aria-label="movement-controls"]')).toBeVisible();

    await defenderContext.setOffline(true);
    await expect(attacker.locator('p[aria-label="disconnect-banner"]')).toBeVisible({ timeout: 20_000 });

    // Real ~30s wait for the grace period to actually elapse via the live TickLoop, confirming the
    // timing path genuinely works end to end — not just the grace-period math already unit-tested at
    // the 29.9s/30.1s boundary in MatchModel.test.ts. Never reconnects Frank.
    await expect(attacker.getByRole('heading', { name: 'Victory' })).toBeVisible({ timeout: 40_000 });
    await expect(attacker.getByText('Reason: Opponent disconnected')).toBeVisible();
  });
});
