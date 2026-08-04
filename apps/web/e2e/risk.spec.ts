import { test, expect } from '@playwright/test';
import {
  gotoAsAuthenticated,
  assertNoHorizontalOverflow,
  assertNoConsoleErrors,
  assertBoundingBoxInViewport,
} from './fixtures';

/**
 * E2E tests for /onboarding/risk.
 *
 * Focus: risk limit inputs, trading-mode radiogroup, InfoTooltip behaviour,
 * risk acknowledgement, the protective (non-promotional) tone of the FULL_AUTO
 * description, and standard layout invariants.
 */

test.describe('Onboarding / Risk', () => {
  test.beforeEach(async ({ page }) => {
    await gotoAsAuthenticated(page, '/onboarding/risk', { heading: /risk management/i });
    // The risk page briefly shows "Loading risk profile…" while GET /risk/profile
    // resolves. Wait for the form to render before assertions.
    await expect(page.getByRole('button', { name: /save risk profile & continue/i })).toBeVisible();
  });

  // ── Page-load invariants ──────────────────────────────────────────────────

  test('page loads with authenticated state', async ({ page }) => {
    await expect(page.getByRole('heading', { level: 1, name: /risk management/i })).toBeVisible();
    await expect(page.getByText(/Step 2 of 3/i)).toBeVisible();
  });

  test('no horizontal overflow', async ({ page }) => {
    await assertNoHorizontalOverflow(page);
  });

  test('no console errors', async ({ page }) => {
    assertNoConsoleErrors(page);
  });

  // ── Risk limit inputs ─────────────────────────────────────────────────────

  test('risk limit inputs are present', async ({ page }) => {
    // Each limit is rendered as a number input with a visible <label>.
    const expectedLabels = [
      /max daily loss/i,
      /max drawdown/i,
      /max risk per trade/i,
      /max open trades/i,
      /max leverage/i,
    ];
    for (const labelPattern of expectedLabels) {
      const label = page.locator('.input-label', { hasText: labelPattern }).first();
      await expect(label, `Expected visible label matching ${labelPattern}`).toBeVisible();
      // The input immediately follows the label inside the same .input-group.
      const group = label.locator('xpath=ancestor::div[contains(@class,"input-group")]');
      const input = group.locator('input[type="number"]');
      await expect(input, `Expected number input for ${labelPattern}`).toBeVisible();
    }
  });

  // ── Trading mode radiogroup ───────────────────────────────────────────────

  test('trading mode options exist (PAPER_ONLY, SEMI_AUTO, FULL_AUTO)', async ({ page }) => {
    const radiogroup = page.getByRole('radiogroup', { name: /allowed trading mode/i });
    await expect(radiogroup).toBeVisible();

    await expect(radiogroup.getByRole('radio', { name: /paper only/i })).toBeVisible();
    await expect(radiogroup.getByRole('radio', { name: /semi-auto/i })).toBeVisible();
    await expect(radiogroup.getByRole('radio', { name: /full auto/i })).toBeVisible();
  });

  test('FULL_AUTO description uses protective wording (not "AI executes automatically")', async ({ page }) => {
    const radiogroup = page.getByRole('radiogroup', { name: /allowed trading mode/i });
    const fullAutoRadio = radiogroup.getByRole('radio', { name: /full auto/i });
    const fullAutoText = (await fullAutoRadio.textContent()) ?? '';
    expect(fullAutoText.toLowerCase()).toContain('approved automation executes after all safety checks');
    // The promotional/casino-style phrase must NOT appear anywhere.
    expect(fullAutoText.toLowerCase()).not.toContain('ai executes automatically');
    // Defensive: scan the whole page for the banned phrase too.
    const bodyText = (await page.locator('body').textContent()) ?? '';
    expect(bodyText.toLowerCase()).not.toContain('ai executes automatically');
  });

  // ── InfoTooltip ───────────────────────────────────────────────────────────

  test('at least 7 InfoTooltip triggers exist', async ({ page }) => {
    // Each InfoTooltip renders a <button> with an aria-label starting with
    // "Explain ".
    const triggers = page.getByRole('button', { name: /^explain /i });
    const count = await triggers.count();
    expect(count, 'Expected at least 7 InfoTooltip triggers').toBeGreaterThanOrEqual(7);
  });

  test('clicking an InfoTooltip opens a tooltip panel with role="tooltip"', async ({ page }) => {
    // InfoTooltip opens on hover AND on focus. In Playwright, click() first
    // moves the mouse (triggering hover/open) then fires click (which toggles
    // closed). Using hover() opens the tooltip and keeps it open.
    const trigger = page.getByRole('button', { name: /^explain maximum daily loss/i }).first();
    await trigger.hover();
    const tooltip = page.getByRole('tooltip');
    await expect(tooltip).toBeVisible();
    // The tooltip text should be the explanation content.
    await expect(tooltip).toContainText(/maximum percentage of your account balance/i);
  });

  test('tooltip trigger has aria-describedby pointing to the tooltip when open', async ({ page }) => {
    const trigger = page.getByRole('button', { name: /^explain maximum daily loss/i }).first();
    await trigger.hover();
    const tooltip = page.getByRole('tooltip');
    await expect(tooltip).toBeVisible();
    await expect(trigger).toHaveAttribute('aria-describedby', /.+/);
    const describedBy = await trigger.getAttribute('aria-describedby');
    expect(describedBy, 'aria-describedby must be set when tooltip is open').toBeTruthy();
    const tooltipById = page.locator(`[id="${describedBy}"]`);
    await expect(tooltipById).toBeVisible();
    await expect(tooltipById).toHaveAttribute('role', 'tooltip');
  });

  test('tooltip remains within viewport bounds', async ({ page }) => {
    const trigger = page.getByRole('button', { name: /^explain maximum daily loss/i }).first();
    await trigger.hover();
    const tooltip = page.getByRole('tooltip');
    await expect(tooltip).toBeVisible();
    await assertBoundingBoxInViewport(tooltip);
  });

  test('Escape closes the tooltip', async ({ page }) => {
    const trigger = page.getByRole('button', { name: /^explain maximum daily loss/i }).first();
    await trigger.hover();
    const tooltip = page.getByRole('tooltip');
    await expect(tooltip).toBeVisible();

    // Focus the trigger so Escape is handled by the InfoTooltip keydown listener.
    await trigger.focus();
    await page.keyboard.press('Escape');
    await expect(tooltip).toHaveCount(0);
  });

  // ── Acknowledgement & save ───────────────────────────────────────────────

  test('risk acknowledgement checkbox exists', async ({ page }) => {
    const checkbox = page.locator('input[type="checkbox"]');
    await expect(checkbox).toBeVisible();
    // The acknowledgement label text must be present.
    await expect(page.locator('body')).toContainText(/risk acknowledgement/i);
  });

  test('Save button exists', async ({ page }) => {
    const saveButton = page.getByRole('button', { name: /save risk profile & continue/i });
    await expect(saveButton).toBeVisible();
    await expect(saveButton).toBeEnabled();
  });

  // ── Focus indicators ──────────────────────────────────────────────────────

  test('focus indicators are visible', async ({ page }) => {
    const hasFocusVisibleCSS = await page.evaluate(() => {
      for (const sheet of Array.from(document.styleSheets)) {
        try {
          const rules = sheet.cssRules;
          for (let i = 0; i < rules.length; i++) {
            const text = (rules[i] as CSSRule).cssText ?? '';
            if (text.includes(':focus-visible')) return true;
          }
        } catch {
          // cross-origin — skip
        }
      }
      return false;
    });
    expect(hasFocusVisibleCSS, 'Stylesheet must define :focus-visible rules').toBe(true);

    // Runtime check: Tab to the first focusable element and verify it has a
    // visible focus indicator.
    await page.keyboard.press('Tab');
    const focusedInfo = await page.evaluate(() => {
      const el = document.activeElement;
      if (!el) return null;
      const cs = window.getComputedStyle(el);
      return { boxShadow: cs.boxShadow, outline: cs.outline };
    });
    expect(focusedInfo, 'An element must be focused after Tab').not.toBeNull();
    const hasIndicator =
      !!focusedInfo &&
      ((focusedInfo.boxShadow && focusedInfo.boxShadow !== 'none') ||
        (focusedInfo.outline && focusedInfo.outline !== 'none' && !focusedInfo.outline.startsWith('none')));
    expect(hasIndicator, `Focused element must show a visible focus indicator: ${JSON.stringify(focusedInfo)}`).toBe(true);
  });
});
