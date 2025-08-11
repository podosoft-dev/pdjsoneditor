import type { BaseTranslation } from '../i18n-types';

const en: BaseTranslation = {
	header: {
		title: 'JSON Editor',
		format: 'Format',
		minify: 'Minify',
		clear: 'Clear',
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
		bodyDescription:
			'Optional request body. If empty, the editor content will be used for POST/PUT/PATCH requests.',
		bodyPlaceholder: 'Enter request body (JSON, XML, etc.)',
		cancel: 'Cancel',
		save: 'Save'
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
	}
} satisfies BaseTranslation;

export default en;
