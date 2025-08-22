import type { BaseTranslation } from '../i18n-types';

const en: BaseTranslation = {
	header: {
		title: 'JSON Editor',
		clear: 'Clear',
		copy: 'Copy',
		copySuccess: 'Copied to clipboard',
		copyError: 'Failed to copy to clipboard',
		format: 'Format',
		minify: 'Minify',
		sample: 'Sample Data',
		language: 'Language'
	},
	editor: {
		placeholder: 'Enter your JSON data here...',
		invalidJson: 'Invalid JSON',
		validJson: 'Valid JSON',
		urlPlaceholder: 'Enter URL to fetch JSON...',
		urlRequired: 'URL is required',
		fetchError: 'Failed to fetch data',
		go: 'Go',
		requestSettings: 'Request Settings',
		requestSettingsDescription: 'Configure HTTP headers and request body',
		headers: 'Headers',
		headerKey: 'Header key',
		headerValue: 'Header value',
		addHeader: 'Add Header',
		body: 'Body',
		bodyDescription: 'Configure the request body for POST/PUT/PATCH requests.',
		bodyPlaceholder: 'Enter request body (JSON, XML, etc.)',
		useEditorContent: 'Use editor content as request body',
		sendAsRawText: "Send as raw text (don't parse as JSON)",
		clearAll: 'Clear All',
		clearAllConfirm:
			'Are you sure you want to clear all settings? This will remove all saved headers, body, and URL from storage.',
		cancel: 'Cancel',
		save: 'Save',
		regenerate: 'Regenerate',
		regenerateTooltip: 'Regenerate values while preserving JSON structure',
		regenerateSuccess: 'JSON values regenerated successfully'
	},
	graph: {
		showMore: 'Show {count} more',
		showLess: 'Show less',
		expand: 'Expand',
		collapse: 'Collapse',
		expandAll: 'Expand all'
	},
	languages: {
		en: 'English',
		ko: '한국어',
		ja: '日本語'
	},
	footer: {
		ready: 'Ready'
	},
	tabs: {
		rename: 'Rename',
		duplicate: 'Duplicate',
		exportJson: 'Export JSON',
		closeTab: 'Close Tab',
		importJsonFile: 'Import JSON File',
		newTab: 'New Tab',
		import: 'Import'
	}
} satisfies BaseTranslation;

export default en;
