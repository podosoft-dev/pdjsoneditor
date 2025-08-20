export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';

export type HeaderKV = { key: string; value: string };

function normalizeAndBuildHeaders(pairs: HeaderKV[]): Record<string, string> {
	const headers: Record<string, string> = {};
	for (const h of pairs) {
		if (!h?.key || !h?.value) continue;
		// Overwrite case-insensitively
		const existing = Object.keys(headers).find((k) => k.toLowerCase() === h.key.toLowerCase());
		if (existing) delete headers[existing];
		headers[h.key] = h.value;
	}
	return headers;
}

export interface RequestJsonOptions {
	method: HttpMethod;
	url: string;
	headers: HeaderKV[];
	editorJson: string;
	customBody: string;
	sendAsRawText: boolean;
	useEditorContent: boolean;
	signal?: AbortSignal;
}

export interface RequestJsonResult {
	ok: boolean;
	status: number;
	data?: unknown;
	rawText?: string;
	contentType?: string | null;
}

export async function requestJson(opts: RequestJsonOptions): Promise<RequestJsonResult> {
	const {
		method,
		url,
		headers: headerPairs,
		editorJson,
		customBody,
		sendAsRawText,
		useEditorContent,
		signal
	} = opts;

	const headers = normalizeAndBuildHeaders(headerPairs);
	const init: RequestInit = { method, headers, signal };

	if (method === 'POST' || method === 'PUT' || method === 'PATCH') {
		const bodyContent = (useEditorContent ? editorJson : customBody).trim();
		if (bodyContent) {
			if (sendAsRawText) {
				(init as any).body = bodyContent;
			} else {
				// Ensure JSON body is valid and set proper content-type
				const parsed = JSON.parse(bodyContent);
				(init as any).body = JSON.stringify(parsed);
				// Upsert Content-Type to application/json
				const hasCT = Object.keys(headers).some((k) => k.toLowerCase() === 'content-type');
				if (hasCT) {
					const ctKey = Object.keys(headers).find((k) => k.toLowerCase() === 'content-type')!;
					headers[ctKey] = 'application/json';
				} else {
					headers['Content-Type'] = 'application/json';
				}
			}
		}
	}

	const resp = await fetch(url, init);
	const result: RequestJsonResult = { ok: resp.ok, status: resp.status };

	const contentType = resp.headers.get('content-type');
	result.contentType = contentType;

	// 204/205 or no content
	if (resp.status === 204 || resp.status === 205) {
		return result;
	}

	const text = await resp.text();
	if (text && contentType?.toLowerCase().includes('application/json')) {
		try {
			result.data = JSON.parse(text);
		} catch {
			// Fallback to text if parsing fails
			result.rawText = text;
		}
	} else {
		// Try JSON parse anyway, else return raw text
		try {
			result.data = JSON.parse(text);
		} catch {
			result.rawText = text;
		}
	}

	return result;
}
