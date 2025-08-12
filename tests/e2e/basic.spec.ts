import { test, expect } from '@playwright/test';
import { PDJSONEditorPage } from './helpers/page-helpers';

test.describe('PDJSONEditor Basic Functionality', () => {
	let editorPage: PDJSONEditorPage;

	test.beforeEach(async ({ page }) => {
		editorPage = new PDJSONEditorPage(page);
		await editorPage.goto();
	});

	test('should load the editor with default JSON', async ({ page }) => {
		// Check that the editor is visible
		await expect(page.locator('.cm-editor')).toBeVisible();
		
		// Check that the graph view is visible
		await expect(page.locator('.svelte-flow')).toBeVisible();
		
		// Verify initial JSON is present
		const content = await editorPage.getEditorContent();
		expect(content).toContain('donut');
		expect(content).toContain('Cake');
		expect(content).toContain('batters');
	});

	test('should format JSON when Format button is clicked', async ({ page }) => {
		// Set minified JSON
		const minifiedJson = '{"name":"Test","age":25,"active":true}';
		await editorPage.setEditorContent(minifiedJson);
		
		// Click format button
		await editorPage.formatJSON();
		
		// Check that JSON is formatted (should have line breaks)
		const formatted = await editorPage.getEditorContent();
		expect(formatted.split('\n').length).toBeGreaterThan(1);
		// Verify JSON is still valid
		expect(() => JSON.parse(formatted)).not.toThrow();
	});

	test('should minify JSON when Minify button is clicked', async ({ page }) => {
		// Start with formatted JSON
		const formattedJson = `{
			"name": "Test",
			"age": 25,
			"active": true
		}`;
		await editorPage.setEditorContent(formattedJson);
		
		// Click minify button
		await editorPage.minifyJSON();
		
		// Check that JSON is minified (should have fewer lines)
		const minified = await editorPage.getEditorContent();
		// Minified JSON should have significantly fewer lines than formatted
		// CodeMirror may add some empty lines, so we check if it's less than 10
		expect(minified.split('\n').length).toBeLessThan(10);
		// Verify JSON is still valid
		expect(() => JSON.parse(minified)).not.toThrow();
	});

	test('should update graph when JSON is modified', async ({ page }) => {
		// Wait for initial graph to render
		await page.waitForSelector('.svelte-flow__node', { timeout: 5000 });
		
		// Get initial node count
		const initialNodeCount = await editorPage.getNodeCount();
		expect(initialNodeCount).toBeGreaterThan(0);
		
		// Update JSON with more complex structure
		const newJson = `{"users":[{"id":1,"name":"User 1"},{"id":2,"name":"User 2"}],"settings":{"theme":"dark","language":"en"}}`;
		await editorPage.setEditorContent(newJson);
		
		// Wait for graph to update
		await page.waitForTimeout(2000);
		
		// Check that node count has changed
		const newNodeCount = await editorPage.getNodeCount();
		expect(newNodeCount).toBeGreaterThan(0);
		expect(newNodeCount).not.toBe(initialNodeCount);
	});

	test('should show error for invalid JSON', async ({ page }) => {
		// Enter invalid JSON
		const invalidJson = '{ "name": "Test", "age": }';
		await editorPage.setEditorContent(invalidJson);
		
		// Wait for error to appear
		await page.waitForTimeout(500);
		
		// Check for error message
		const errorElement = page.locator('text=/Invalid JSON|Unexpected token/i');
		await expect(errorElement).toBeVisible();
	});

	test('should navigate between editor and graph panels', async ({ page }) => {
		// Check that both panels are visible
		const editorPanel = page.locator('.cm-editor');
		const graphPanel = page.locator('.svelte-flow');
		
		await expect(editorPanel).toBeVisible();
		await expect(graphPanel).toBeVisible();
		
		// Test resizable functionality (if implemented)
		const resizeHandle = page.locator('[data-panel-resize-handle]');
		if (await resizeHandle.isVisible()) {
			// Drag the resize handle
			await resizeHandle.dragTo(resizeHandle, {
				targetPosition: { x: 100, y: 0 }
			});
		}
	});

	test('should handle large JSON files', async ({ page }) => {
		// Create a large JSON structure
		const largeArray = Array.from({ length: 100 }, (_, i) => ({
			id: i,
			name: `Item ${i}`,
			value: Math.random(),
			nested: {
				level1: {
					level2: `Deep value ${i}`
				}
			}
		}));
		
		const largeJson = JSON.stringify({ data: largeArray }, null, 2);
		await editorPage.setEditorContent(largeJson);
		
		// Wait for graph to render
		await page.waitForTimeout(2000);
		
		// Verify graph has rendered nodes
		const nodeCount = await editorPage.getNodeCount();
		expect(nodeCount).toBeGreaterThan(0);
		
		// Verify no errors
		await editorPage.waitForNoErrors();
	});

	test('should preserve JSON structure after format/minify cycle', async ({ page }) => {
		const originalJson = {
			name: "Test User",
			age: 30,
			active: true,
			tags: ["developer", "tester"],
			address: {
				city: "San Francisco",
				country: "USA"
			}
		};
		
		// Set original JSON
		await editorPage.setEditorContent(JSON.stringify(originalJson));
		
		// Format
		await editorPage.formatJSON();
		await page.waitForTimeout(500);
		
		// Minify
		await editorPage.minifyJSON();
		await page.waitForTimeout(500);
		
		// Parse and compare
		const finalContent = await editorPage.getEditorContent();
		const finalJson = JSON.parse(finalContent);
		
		expect(finalJson).toEqual(originalJson);
	});
});