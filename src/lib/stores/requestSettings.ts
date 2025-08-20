import { writable } from 'svelte/store';
import type { HttpMethod, HeaderKV } from '$lib/services/http';
import { STORAGE_KEYS } from '$lib/constants';

export interface RequestSettingsState {
	url: string;
	method: HttpMethod;
	headers: HeaderKV[];
	body: string;
	sendAsRawText: boolean;
	useEditorContent: boolean;
}

const getInitial = (): RequestSettingsState => {
	if (typeof window === 'undefined') {
		return {
			url: 'https://jsonplaceholder.typicode.com/todos/1',
			method: 'GET',
			headers: [],
			body: '',
			sendAsRawText: false,
			useEditorContent: false
		};
	}

	let url =
		localStorage.getItem(STORAGE_KEYS.URL) || 'https://jsonplaceholder.typicode.com/todos/1';
	const rawMethod = localStorage.getItem(STORAGE_KEYS.METHOD) as HttpMethod | null;
	const method: HttpMethod =
		rawMethod && ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'].includes(rawMethod) ? rawMethod : 'GET';
	let headers: HeaderKV[] = [];
	const savedHeaders = localStorage.getItem(STORAGE_KEYS.HEADERS);
	if (savedHeaders) {
		try {
			headers = JSON.parse(savedHeaders);
		} catch {
			// Ignore parse errors for invalid headers data
		}
	}
	const body = localStorage.getItem(STORAGE_KEYS.BODY) || '';
	let sendAsRawText = false;
	const savedRaw = localStorage.getItem(STORAGE_KEYS.RAW_BODY_MODE);
	if (savedRaw) {
		try {
			sendAsRawText = JSON.parse(savedRaw);
		} catch {
			// Ignore parse errors for invalid raw body mode
		}
	}
	let useEditorContent = false;
	const savedUse = localStorage.getItem(STORAGE_KEYS.USE_EDITOR_CONTENT);
	if (savedUse) {
		try {
			useEditorContent = JSON.parse(savedUse);
		} catch {
			// Ignore parse errors for invalid use editor content flag
		}
	}

	return { url, method, headers, body, sendAsRawText, useEditorContent };
};

export const requestSettings = writable<RequestSettingsState>(getInitial());

// Persist on change (browser only)
if (typeof window !== 'undefined') {
	requestSettings.subscribe((s) => {
		try {
			localStorage.setItem(STORAGE_KEYS.URL, s.url);
			localStorage.setItem(STORAGE_KEYS.METHOD, s.method);
			localStorage.setItem(STORAGE_KEYS.HEADERS, JSON.stringify(s.headers ?? []));
			localStorage.setItem(STORAGE_KEYS.BODY, s.body ?? '');
			localStorage.setItem(STORAGE_KEYS.RAW_BODY_MODE, JSON.stringify(!!s.sendAsRawText));
			localStorage.setItem(STORAGE_KEYS.USE_EDITOR_CONTENT, JSON.stringify(!!s.useEditorContent));
		} catch {
			// ignore storage errors
		}
	});
}
