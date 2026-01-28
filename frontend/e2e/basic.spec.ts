import { test, expect } from '@playwright/test';

// Example: Test homepage loads using baseURL from config
test('homepage loads', async ({ page }) => {
  await page.goto('/'); // Uses http://localhost:3000/ as baseURL
  // Update the regex below to match your actual app title if needed
  await expect(page).toHaveTitle(/Podster/i);
});
