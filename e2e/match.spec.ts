import { test, expect, Page, BrowserContext } from '@playwright/test';

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

const arcaneBoltCooldown = (page: Page) =>
  page.locator('ul[aria-label="you-cooldowns"] li', { hasText: 'arcane-bolt' });

/**
 * Casts Arcane Bolt, then waits for its 4s cooldown to actually appear and then clear before
 * returning — clicking again the instant the cooldown display disappears would race the very first
 * tick after casting (the li hasn't rendered yet, so "0 matches" is trivially true for the wrong
 * reason), which would silently re-fire while genuinely still on cooldown (the server just ignores an
 * on-cooldown ability use, R4.2) and never land a second hit. Waiting for the cooldown to *appear*
 * first proves the server actually processed this cast before we wait for it to clear.
 */
async function castArcaneBoltAndWaitForCooldown(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Arcane Bolt' }).click();
  await expect(arcaneBoltCooldown(page)).toHaveCount(1, { timeout: 5_000 });
  await expect(arcaneBoltCooldown(page)).toHaveCount(0, { timeout: 10_000 });
}

test.describe('a complete Arena match', () => {
  let attackerContext: BrowserContext;
  let defenderContext: BrowserContext;

  test.afterEach(async () => {
    await attackerContext?.close();
    await defenderContext?.close();
  });

  test('two players connect, queue, select champions, fight, and reach a consistent result', async ({ browser }) => {
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

    // Touch real movement input too (both spawn co-located, so this isn't needed for range, but it's
    // a real player action the HUD exposes and the server validates — exercise it for real).
    await attacker.getByRole('button', { name: 'Move Up' }).click();
    await defender.getByRole('button', { name: 'Move Down' }).click();

    // Three Arcane Bolts (32 damage each) reliably eliminate Vex's 85 HP; Bob never fights back, so the
    // outcome is deterministic — Alice wins, Bob loses, no draw risk. No need to wait out the third
    // cast's own cooldown — the match ends (ELIMINATION) as soon as it lands.
    await castArcaneBoltAndWaitForCooldown(attacker);
    await castArcaneBoltAndWaitForCooldown(attacker);
    await attacker.getByRole('button', { name: 'Arcane Bolt' }).click();

    await expect(attacker.getByRole('heading', { name: 'Victory' })).toBeVisible({ timeout: 20_000 });
    await expect(attacker.getByText('Reason: Elimination')).toBeVisible();
    await expect(defender.getByRole('heading', { name: 'Defeat' })).toBeVisible({ timeout: 20_000 });
    await expect(defender.getByText('Reason: Elimination')).toBeVisible();

    await expect(attacker.getByRole('button', { name: 'Return to Queue' })).toBeVisible();
    await expect(defender.getByRole('button', { name: 'Return to Queue' })).toBeVisible();
  });
});
