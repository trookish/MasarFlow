import { test, expect } from '@playwright/test';

test.describe('Workspace Dashboard', () => {
  test('should load the dashboard and display the seed data', async ({ page }) => {
    // Navigate to the dashboard
    await page.goto('/');

    // Check that the header says "Command Center" or similar indicator of the home page
    await expect(page.locator('h1')).toBeVisible();

    // The project "Echoes of the Hollow" should be seeded
    await expect(page.locator('text=Echoes of the Hollow')).toBeVisible();

    // Verify Sprints card is present
    await expect(page.locator('text=Active Sprints')).toBeVisible();
    
    // Verify Health card is present
    await expect(page.locator('text=Project Health')).toBeVisible();
  });

  test('should navigate to specs page', async ({ page }) => {
    await page.goto('/');
    
    // Click on the Specs navigation link
    await page.click('a[href="/specs"]');
    
    // Check that we are on the specs page
    await expect(page).toHaveURL(/\/specs/);
    await expect(page.locator('text=Technical specifications')).toBeVisible();
  });
});
