import { test, expect } from '@playwright/test';

test('app mounts, libraries seed, tabs navigate', async ({ page }) => {
  await page.goto('/');

  // Wait for hydration to finish and the Engagements tab to render the
  // hydrated library summary.
  await expect(page.getByRole('heading', { name: 'Engagements' })).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText('Rack systems')).toBeVisible();

  // Each tab should be reachable.
  for (const label of ['Inputs', 'Reference', 'Design Rules', 'Scenarios', 'Outputs', 'Layout']) {
    await page.getByRole('link', { name: label }).click();
    await expect(page.getByRole('heading', { level: 2 })).toContainText(label.replace('Layout', 'Block Diagram').replace('Inputs', 'Inputs'));
  }
});
