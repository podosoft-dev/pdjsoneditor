import { test, expect } from '@playwright/test';

test.describe('Smoke Test', () => {
	test('should load the application', async ({ page }) => {
		// Navigate to the app
		await page.goto('/');

		// Wait for the editor to be ready
		await page.waitForSelector('.cm-editor', { timeout: 10000 });

		// Check that key elements are visible
		await expect(page.locator('.cm-editor')).toBeVisible();
		await expect(page.locator('.svelte-flow')).toBeVisible();

		// Check that the header is visible
		await expect(page.locator('header')).toBeVisible();

		// Check that Format and Minify buttons exist
		const formatButton = page.getByRole('button', { name: 'Format' });
		const minifyButton = page.getByRole('button', { name: 'Minify' });

		await expect(formatButton).toBeVisible();
		await expect(minifyButton).toBeVisible();

		// Check that HTTP method dropdown exists
		const methodDropdown = page
			.locator('button')
			.filter({ hasText: /GET|POST|PUT|PATCH|DELETE/ })
			.first();
		await expect(methodDropdown).toBeVisible();

		// Check that URL input exists
		const urlInput = page.locator('input[type="url"]');
		await expect(urlInput).toBeVisible();

		// Get the editor content and verify it's valid JSON
		const lines = await page.locator('.cm-line').allTextContents();
		const editorContent = lines.join('\n').trimEnd();
		expect(() => JSON.parse(editorContent)).not.toThrow();

		// Verify the initial JSON contains expected data
		expect(editorContent).toContain('donut');
		expect(editorContent).toContain('Cake');
	});

	test('should format and minify JSON', async ({ page }) => {
		await page.goto('/');
		await page.waitForSelector('.cm-editor');

		// Get initial content
		let lines = await page.locator('.cm-line').allTextContents();
		const initialContent = lines.join('\n').trimEnd();
		const initialLineCount = initialContent.split('\n').length;

		// Click Minify
		await page.getByRole('button', { name: 'Minify' }).click();
		await page.waitForTimeout(500);

		// Check that content is minified
		lines = await page.locator('.cm-line').allTextContents();
		const minifiedContent = lines.join('\n').trimEnd();
		const minifiedLineCount = minifiedContent.split('\n').length;
		expect(minifiedLineCount).toBeLessThan(initialLineCount);

		// Click Format
		await page.getByRole('button', { name: 'Format' }).click();
		await page.waitForTimeout(500);

		// Check that content is formatted again
		lines = await page.locator('.cm-line').allTextContents();
		const formattedContent = lines.join('\n').trimEnd();
		const formattedLineCount = formattedContent.split('\n').length;
		expect(formattedLineCount).toBeGreaterThan(minifiedLineCount);

		// Verify JSON is still valid after format/minify cycle
		expect(() => JSON.parse(formattedContent)).not.toThrow();
	});
});
