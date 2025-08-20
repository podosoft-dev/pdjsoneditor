export const STORAGE_KEYS = {
	URL: 'pdjsoneditor_url',
	METHOD: 'pdjsoneditor_method',
	HEADERS: 'pdjsoneditor_headers',
	BODY: 'pdjsoneditor_body',
	RAW_BODY_MODE: 'pdjsoneditor_raw_body_mode',
	USE_EDITOR_CONTENT: 'pdjsoneditor_use_editor_content'
} as const;

export type StorageKey = (typeof STORAGE_KEYS)[keyof typeof STORAGE_KEYS];
