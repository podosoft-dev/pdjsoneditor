import { expect } from '@playwright/test';
import type { Page } from '@playwright/test';

/**
 * Helper functions for PDJSONEditor E2E tests
 */

export class PDJSONEditorPage {
	constructor(private page: Page) {}

	// Navigation
	async goto() {
		await this.page.goto('/');
		// Wait for the editor to be ready
		await this.page.waitForSelector('.cm-editor');
	}

	// JSON Editor helpers
	async getEditorContent(): Promise<string> {
		// CodeMirror uses contenteditable, so we need to get the text content
		// First wait for content to be rendered
		await this.page.waitForTimeout(100);

		// Try multiple methods to get the content
		// Method 1: Get all text from cm-content (most reliable for large content)
		const cmContent = await this.page.locator('.cm-content').textContent();
		if (cmContent && cmContent.trim().length > 0) {
			// Clean up the content - remove any extra whitespace
			return cmContent.trim();
		}

		// Method 2: Get all cm-line elements and concatenate their text
		const lines = await this.page.locator('.cm-line').allTextContents();

		// If no lines found or empty, return empty string
		if (lines.length === 0 || (lines.length === 1 && lines[0] === '')) {
			return '';
		}

		// Join lines and clean up any trailing whitespace or empty lines
		let content = lines.join('\n');

		// Remove trailing whitespace and empty lines
		content = content.replace(/\s+$/g, '');

		return content;
	}

	async setEditorContent(json: string) {
		// Click in the editor to focus it
		await this.page.locator('.cm-content').click();

		// Select all text using keyboard shortcut
		await this.page.keyboard.press('Meta+A');

		// Wait a bit for selection to complete
		await this.page.waitForTimeout(50);

		// Use insertText to replace the selected text
		// This is more reliable than Delete + type
		await this.page.keyboard.insertText(json);

		// Wait for CodeMirror to update
		await this.page.waitForTimeout(200);
	}

	async formatJSON() {
		// Look for Format button - can be in English or other languages
		await this.page.getByRole('button', { name: 'Format' }).click();
	}

	async minifyJSON() {
		// Look for Minify button - can be in English or other languages
		await this.page.getByRole('button', { name: 'Minify' }).click();
	}

	// HTTP Request helpers
	async selectHTTPMethod(method: string) {
		// Click on the method dropdown button (it shows current method)
		// The button contains the method text but may have additional elements
		const dropdownButton = this.page
			.locator('button')
			.filter({ hasText: /GET|POST|PUT|PATCH|DELETE/ })
			.first();
		await dropdownButton.click();
		// Select the desired method from dropdown
		await this.page.locator(`[role="menuitem"]:has-text("${method}")`).click();
	}

	async enterURL(url: string) {
		// Find URL input by type attribute
		const urlInput = this.page.locator('input[type="url"]');
		await urlInput.clear();
		await urlInput.fill(url);
	}

	async clickGo() {
		await this.page.getByRole('button', { name: 'Go' }).click();
	}

	async makeHTTPRequest(method: string, url: string) {
		await this.selectHTTPMethod(method);
		await this.enterURL(url);
		await this.clickGo();
		// Wait for the request to complete
		await this.page.waitForTimeout(1000);
	}

	// Request Settings helpers
	async openRequestSettings() {
		// Click settings button - look for button with "Request" in title or Settings icon
		// First try by title attribute (works for English)
		let settingsButton = this.page.locator('button[title*="Request"]').first();
		const count = await settingsButton.count();

		if (count === 0) {
			// If not found by title, find the small button with icon after URL input
			// It's the button right before the "Go" button
			// const goButton = this.page.getByRole('button', { name: 'Go' });
			settingsButton = this.page
				.locator('button.h-7.px-2')
				.filter({
					has: this.page.locator('svg')
				})
				.first();
		}

		await settingsButton.click();
		// Wait for dialog to open
		await this.page.waitForSelector('[role="dialog"]', { timeout: 5000 });
	}

	async addHeader(key: string, value: string, openDialog: boolean = true) {
		if (openDialog) {
			await this.openRequestSettings();
		}

		// Wait for dialog inputs to be ready
		await this.page.waitForTimeout(200);

		// Find the last header row and fill it
		const keyInputs = this.page.locator('[role="dialog"] input[placeholder="Key"]');
		const valueInputs = this.page.locator('[role="dialog"] input[placeholder="Value"]');

		const keyCount = await keyInputs.count();
		if (keyCount > 0) {
			await keyInputs.nth(keyCount - 1).fill(key);
			await valueInputs.nth(keyCount - 1).fill(value);

			// Add another row for next header
			const addButton = this.page.locator('[role="dialog"] button:has-text("Add Header")').first();
			if (await addButton.isVisible()) {
				await addButton.click();
				await this.page.waitForTimeout(100);
			}
		}
	}

	async setCustomRequestBody(body: string, openDialog: boolean = true) {
		if (openDialog) {
			await this.openRequestSettings();
		}

		// Wait for dialog to be ready
		await this.page.waitForTimeout(200);

		// Fill in the custom body directly in the textarea
		const textarea = this.page.locator('[role="dialog"] textarea').first();
		await textarea.fill(body);
	}

	async saveRequestSettings() {
		// Look for Save button in dialog
		await this.page.locator('[role="dialog"] button:has-text("Save")').click();
		// Wait for dialog to close
		await this.page.waitForTimeout(500);
	}

	// Graph View helpers
	async isGraphVisible(): Promise<boolean> {
		return await this.page.locator('.svelte-flow').isVisible();
	}

	async getNodeCount(): Promise<number> {
		const nodes = await this.page.locator('.svelte-flow__node').all();
		return nodes.length;
	}

	async clickGraphNode(nodeLabel: string) {
		await this.page.locator(`.svelte-flow__node:has-text("${nodeLabel}")`).click();
	}

	async expandNode(nodeLabel: string) {
		const node = this.page.locator(`.svelte-flow__node:has-text("${nodeLabel}")`);
		await node.hover();
		// Click on the expand button if it exists
		const expandButton = node.locator('button').first();
		if (await expandButton.isVisible()) {
			await expandButton.click();
		}
	}

	// Validation helpers
	async validateJSONInEditor(expectedJson: unknown) {
		const content = await this.getEditorContent();
		let actualJson;
		try {
			actualJson = JSON.parse(content);
		} catch {
			throw new Error(`Invalid JSON in editor: ${content}`);
		}

		expect(actualJson).toEqual(expectedJson);
	}

	async validateErrorMessage(expectedMessage: string) {
		const errorElement = this.page.locator('.text-red-500, .text-destructive');
		await expect(errorElement).toContainText(expectedMessage);
	}

	async waitForNoErrors() {
		// Make sure no error messages are visible
		const errorElement = this.page.locator('.text-red-500, .text-destructive');
		await expect(errorElement).not.toBeVisible();
	}

	// Utility functions
	async takeScreenshot(name: string) {
		await this.page.screenshot({
			path: `test-results/screenshots/${name}.png`,
			fullPage: true
		});
	}

	async waitForNetworkIdle() {
		await this.page.waitForLoadState('networkidle');
	}
}
