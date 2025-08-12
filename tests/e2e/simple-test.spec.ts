import { test, expect } from '@playwright/test';

test('PDJSONEditor should load', async ({ page }) => {
	// Navigate to the app
	await page.goto('/');
	
	// Wait a bit for the app to load
	await page.waitForTimeout(2000);
	
	// Check that the page title or header contains JSON Editor
	const header = page.locator('h1');
	await expect(header).toContainText('JSON');
	
	// Take a screenshot for debugging
	await page.screenshot({ path: 'test-results/app-loaded.png' });
	
	console.log('✅ App loaded successfully');
});