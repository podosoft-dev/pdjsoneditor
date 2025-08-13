<script lang="ts">
	import { onMount } from 'svelte';
	import JsonEditor from '$lib/components/JsonEditor.svelte';
	import JsonGraph from '$lib/components/JsonGraph.svelte';
    import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import * as DropdownMenu from '$lib/components/ui/dropdown-menu';
	import * as Dialog from '$lib/components/ui/dialog';
	import { Textarea } from '$lib/components/ui/textarea';
	import { Checkbox } from '$lib/components/ui/checkbox/index.js';
	import * as Resizable from '$lib/components/ui/resizable/index.js';
	import {
		FileCode2,
		Minimize2,
		Moon,
		Sun,
		ArrowRight,
		Loader,
		ChevronDown,
		Check,
		Settings2,
		Plus,
		Trash2,
		X,
		Copy
	} from 'lucide-svelte';
	import { mode, toggleMode } from 'mode-watcher';
	import LanguageSwitcher from '$lib/components/LanguageSwitcher.svelte';
	import LL from '$i18n/i18n-svelte';
    import { toast } from 'svelte-sonner';
    import type { JsonValue } from '$lib/types/json';
    import { STORAGE_KEYS } from '$lib/constants';
    import { requestJson, type HttpMethod } from '$lib/services/http';

	// 	let jsonValue = $state(`{
	//   "name": "John Doe",
	//   "age": 30,
	//   "email": "john.doe@example.com",
	//   "isActive": true,
	//   "address": {
	//     "street": "123 Main St",
	//     "city": "New York",
	//     "country": "USA",
	//     "zipCode": "10001"
	//   },
	//   "hobbies": ["reading", "coding", "gaming"],
	//   "skills": [
	//     {
	//       "name": "JavaScript",
	//       "level": "Expert"
	//     },
	//     {
	//       "name": "Python",
	//       "level": "Intermediate"
	//     },
	//     {
	//       "name": "Go",
	//       "level": "Beginner"
	//     }
	//   ],
	//   "metadata": {
	//     "createdAt": "2025-01-08T10:00:00Z",
	//     "updatedAt": "2025-01-08T15:30:00Z",
	//     "version": 1.0
	//   }
	// }`);

	let jsonValue = $state(`{
	"id": "0001",
	"type": "donut",
	"name": "Cake",
	"ppu": 0.55,
	"batters":
		{
			"batter":
				[
					{ "id": "1001", "type": "Regular" },
					{ "id": "1002", "type": "Chocolate" },
					{ "id": "1003", "type": "Blueberry" },
					{ "id": "1004", "type": "Devil's Food" }
				]
		},
	"topping":
		[
			{ "id": "5001", "type": "None" },
			{ "id": "5002", "type": "Glazed" },
			{ "id": "5005", "type": "Sugar" },
			{ "id": "5007", "type": "Powdered Sugar" },
			{ "id": "5006", "type": "Chocolate with Sprinkles" },
			{ "id": "5003", "type": "Chocolate" },
			{ "id": "5004", "type": "Maple" }
		]
}`);

	let parsedJson = $state<JsonValue | null>(null);
	let error = $state<string>('');
	let editorRef: JsonEditor;
	let parseTimeout: ReturnType<typeof setTimeout>;

    // LocalStorage keys are centralized in $lib/constants

	// Initialize with empty values (will be populated from localStorage in onMount)
	let urlInput = $state<string>('https://jsonplaceholder.typicode.com/todos/1');
	let isLoading = $state<boolean>(false);
    let httpMethod = $state<string>('GET');
	let isDialogOpen = $state<boolean>(false);
	let customHeaders = $state<Array<{ key: string; value: string }>>([]);
	let tempHeaders = $state<Array<{ key: string; value: string }>>([]);
	let customBody = $state<string>('');
	let tempBody = $state<string>('');
	let sendAsRawText = $state<boolean>(false);
	let tempSendAsRawText = $state<boolean>(false);
	let useEditorContent = $state<boolean>(false);
	let tempUseEditorContent = $state<boolean>(false);
	let httpStatusCode = $state<number | null>(null);
	let responseTime = $state<number | null>(null);

    const httpMethods = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'] as const;

    // Track in-flight request for cancellation
    let abortController: AbortController | null = null;

	function openSettingsDialog() {
		// Copy current headers to temp, ensure it's a proper array
		if (customHeaders && customHeaders.length > 0) {
			tempHeaders = customHeaders.map((h) => ({ ...h }));
		} else {
			tempHeaders = [{ key: '', value: '' }];
		}
		tempBody = customBody || '';
		tempSendAsRawText = sendAsRawText;
		tempUseEditorContent = useEditorContent;
		isDialogOpen = true;
	}

	function saveSettings() {
		// Save temp to actual
		customHeaders = [...tempHeaders];
		customBody = tempBody;
		sendAsRawText = tempSendAsRawText;
		useEditorContent = tempUseEditorContent;

		// Save to localStorage
		localStorage.setItem(STORAGE_KEYS.HEADERS, JSON.stringify(customHeaders));
		localStorage.setItem(STORAGE_KEYS.BODY, customBody);
		localStorage.setItem(STORAGE_KEYS.RAW_BODY_MODE, JSON.stringify(sendAsRawText));
		localStorage.setItem(STORAGE_KEYS.USE_EDITOR_CONTENT, JSON.stringify(useEditorContent));

		isDialogOpen = false;
	}

	function cancelSettings() {
		// Reset temp
		tempHeaders = [...customHeaders];
		tempBody = customBody;
		tempSendAsRawText = sendAsRawText;
		tempUseEditorContent = useEditorContent;
		isDialogOpen = false;
	}

	function clearAllSettings() {
		if (confirm($LL.editor.clearAllConfirm())) {
			// Clear all localStorage keys
			Object.values(STORAGE_KEYS).forEach(key => {
				localStorage.removeItem(key);
			});

			// Reset all values to defaults
			urlInput = 'https://jsonplaceholder.typicode.com/todos/1';
			httpMethod = 'GET';
			customHeaders = [];
			customBody = '';
			sendAsRawText = false;
			useEditorContent = false;
			httpStatusCode = null;
			responseTime = null;
			error = '';

			// Reset temp values
			tempHeaders = [{ key: '', value: '' }];
			tempBody = '';
			tempSendAsRawText = false;
			tempUseEditorContent = false;

			// Save reset URL and method to localStorage
			saveUrlAndMethod();
		}
	}

	function addHeader() {
		tempHeaders = [...tempHeaders, { key: '', value: '' }];
	}

	function removeHeader(index: number) {
		tempHeaders = tempHeaders.filter((_, i) => i !== index);
	}

	function updateHeader(index: number, field: 'key' | 'value', value: string) {
		tempHeaders = tempHeaders.map((header, i) =>
			i === index ? { ...header, [field]: value } : header
		);
	}

	function saveUrlAndMethod() {
		localStorage.setItem(STORAGE_KEYS.URL, urlInput);
		localStorage.setItem(STORAGE_KEYS.METHOD, httpMethod);
	}

	function clearJson() {
		jsonValue = '';
		error = '';
	}

	async function copyJson() {
		try {
			await navigator.clipboard.writeText(jsonValue);
			toast.success($LL.header.copySuccess());
		} catch (e) {
			console.error('Failed to copy to clipboard:', e);
			// Fallback for older browsers
			try {
				const textArea = document.createElement('textarea');
				textArea.value = jsonValue;
				document.body.appendChild(textArea);
				textArea.focus();
				textArea.select();
				document.execCommand('copy');
				document.body.removeChild(textArea);
				toast.success($LL.header.copySuccess());
			} catch (fallbackError) {
				console.error('Fallback copy failed:', fallbackError);
				toast.error($LL.header.copyError());
			}
		}
	}

	function formatJson() {
		try {
			const parsed = JSON.parse(jsonValue);
			jsonValue = JSON.stringify(parsed, null, 2);
			error = '';
		} catch (e) {
			error = e instanceof Error ? e.message : $LL.editor.invalidJson();
		}
	}

	function minifyJson() {
		try {
			const parsed = JSON.parse(jsonValue);
			jsonValue = JSON.stringify(parsed);
			error = '';
		} catch (e) {
			error = e instanceof Error ? e.message : $LL.editor.invalidJson();
		}
	}

    async function fetchJsonFromUrl() {
        if (!urlInput.trim()) {
            error = $LL.editor.urlRequired();
            return;
        }

        isLoading = true;
        // Only clear error if it's a fetch-related error
        if (error && (error.includes('fetch') || error.includes('HTTP'))) {
            error = '';
        }
        httpStatusCode = null;
        responseTime = null;

        try {
            // Cancel previous request if any
            if (abortController) {
                abortController.abort();
            }
            abortController = new AbortController();

            const startTime = performance.now();
            const res = await requestJson({
                method: httpMethod as HttpMethod,
                url: urlInput,
                headers: customHeaders,
                editorJson: jsonValue,
                customBody,
                sendAsRawText,
                useEditorContent,
                signal: abortController.signal
            });
            const endTime = performance.now();
            responseTime = Math.round(endTime - startTime);
            httpStatusCode = res.status;

            if (res.data !== undefined) {
                jsonValue = JSON.stringify(res.data, null, 2);
            } else if (res.rawText !== undefined) {
                // Non-JSON 응답은 텍스트로 보여줌
                jsonValue = JSON.stringify({ response: res.rawText }, null, 2);
            }

            if (res.ok && error && (error.includes('fetch') || error.includes('HTTP'))) {
                error = '';
            }
        } catch (e) {
            if ((e as any)?.name === 'AbortError') {
                // silently ignore aborted request
                return;
            }
            if (e instanceof Error) {
                if (e.message.includes('Failed to fetch')) {
                    error = $LL.editor.fetchError();
                } else {
                    error = e.message;
                }
            } else {
                error = $LL.editor.fetchError();
            }
        } finally {
            isLoading = false;
        }
    }

	function handleUrlKeydown(e: KeyboardEvent) {
		if (e.key === 'Enter') {
			fetchJsonFromUrl();
		}
	}

	function handleUrlBlur() {
		saveUrlAndMethod();
	}

	function handleMethodChange(newMethod: string) {
		httpMethod = newMethod;
		saveUrlAndMethod();
	}

	$effect(() => {
		const currentJsonValue = jsonValue;
		// console.log('[Page Effect] JSON value changed, length:', currentJsonValue.length);

		// Clear previous timeout
		if (parseTimeout) {
			clearTimeout(parseTimeout);
		}

		// Set new timeout for 500ms delay
		parseTimeout = setTimeout(() => {
			// console.log('[Page Effect] Parsing JSON after timeout');
			try {
				parsedJson = JSON.parse(currentJsonValue);
				error = '';
			} catch (e) {
				error = e instanceof Error ? e.message : $LL.editor.invalidJson();
				parsedJson = null;
			}
		}, 500);

		return () => {
			if (parseTimeout) {
				clearTimeout(parseTimeout);
			}
		};
	});

	onMount(() => {
		// Load saved values from localStorage
		const savedUrl = localStorage.getItem(STORAGE_KEYS.URL);
		const savedMethod = localStorage.getItem(STORAGE_KEYS.METHOD);
		const savedHeaders = localStorage.getItem(STORAGE_KEYS.HEADERS);
		const savedBody = localStorage.getItem(STORAGE_KEYS.BODY);
		const savedRawBodyMode = localStorage.getItem(STORAGE_KEYS.RAW_BODY_MODE);
		const savedUseEditorContent = localStorage.getItem(STORAGE_KEYS.USE_EDITOR_CONTENT);

		if (savedUrl) {
			urlInput = savedUrl;
		}
		if (savedMethod && httpMethods.includes(savedMethod as any)) {
			httpMethod = savedMethod;
		}
		if (savedHeaders) {
			try {
				const parsed = JSON.parse(savedHeaders);
				if (Array.isArray(parsed) && parsed.length > 0) {
					// Ensure it's a proper array assignment
					customHeaders = [...parsed];
				} else {
					// Keep empty if no headers saved
					customHeaders = [];
				}
			} catch (e) {
				console.error('Failed to parse saved headers:', e);
				// Keep empty on error
				customHeaders = [];
			}
		} else {
			// Keep empty if nothing saved
			customHeaders = [];
		}

		if (savedBody !== null && savedBody !== undefined && savedBody !== '') {
			customBody = savedBody;
		}

		if (savedRawBodyMode !== null) {
			try {
				sendAsRawText = JSON.parse(savedRawBodyMode);
			} catch (e) {
				console.error('Failed to parse saved raw body mode:', e);
				sendAsRawText = false;
			}
		}

		if (savedUseEditorContent !== null) {
			try {
				useEditorContent = JSON.parse(savedUseEditorContent);
			} catch (e) {
				console.error('Failed to parse saved use editor content:', e);
				useEditorContent = false;
			}
		}

		const handleNodeClick = (e: CustomEvent) => {
			const path = e.detail;
			if (path && editorRef) {
				editorRef.navigateToPath(path);
			}
		};

		window.addEventListener('nodeClick', handleNodeClick as EventListener);

		return () => {
			window.removeEventListener('nodeClick', handleNodeClick as EventListener);
		};
	});
</script>

<div class="h-screen flex flex-col bg-background">
	<!-- Header -->
	<header class="h-12 border-b bg-card flex items-center px-4">
		<h1 class="text-base font-semibold">{$LL.header.title()}</h1>
		<div class="ml-auto flex items-center gap-2">
			<LanguageSwitcher />
			<Button size="sm" variant="ghost" onclick={toggleMode} class="h-8 w-8 px-0">
				{#if mode.current === 'light'}
					<Moon class="h-4 w-4" />
				{:else}
					<Sun class="h-4 w-4" />
				{/if}
			</Button>
		</div>
	</header>

	<Resizable.PaneGroup direction="horizontal" class="flex-1">
		<Resizable.Pane defaultSize={30} minSize={20}>
			<div class="h-full flex flex-col overflow-hidden">
				<div class="flex flex-col border-b bg-muted/50">
					<div class="h-8 flex items-center px-2 flex-shrink-0 gap-1">
						<DropdownMenu.Root>
							<DropdownMenu.Trigger>
								<Button variant="outline" size="sm" class="h-7 px-2 text-xs gap-1">
									{httpMethod}
									<ChevronDown class="h-3 w-3" />
								</Button>
							</DropdownMenu.Trigger>
							<DropdownMenu.Content align="start">
								{#each httpMethods as method}
									<DropdownMenu.Item
										onclick={() => handleMethodChange(method)}
										class="flex items-center justify-between"
									>
										<span>{method}</span>
										{#if httpMethod === method}
											<Check class="h-3 w-3" />
										{/if}
									</DropdownMenu.Item>
								{/each}
							</DropdownMenu.Content>
						</DropdownMenu.Root>
						<Input
							type="url"
							placeholder={$LL.editor.urlPlaceholder()}
							bind:value={urlInput}
							onkeydown={handleUrlKeydown}
							onblur={handleUrlBlur}
							class="h-7 text-xs flex-1"
							disabled={isLoading}
						/>
						<Button
							size="sm"
							variant="ghost"
							onclick={openSettingsDialog}
							class="h-7 px-2"
							title={$LL.editor.requestSettings()}
						>
							<Settings2 class="w-3 h-3" />
						</Button>
						<Button
							size="sm"
							variant="ghost"
							onclick={fetchJsonFromUrl}
							disabled={isLoading}
							class="h-7 px-2 text-sm flex items-center gap-1"
						>
							{#if isLoading}
								<Loader class="w-3 h-3 animate-spin" />
							{:else}
								<ArrowRight class="w-3 h-3" />
							{/if}
							{$LL.editor.go()}
						</Button>
					</div>
					<div class="h-8 flex items-center justify-end px-2 flex-shrink-0 gap-1 border-t">
						<Button
							size="sm"
							variant="ghost"
							onclick={clearJson}
							class="h-7 px-2 text-sm flex items-center gap-1"
							title={$LL.header.clear()}
						>
							<X class="w-3 h-3" />
							{$LL.header.clear()}
						</Button>
						<Button
							size="sm"
							variant="ghost"
							onclick={copyJson}
							class="h-7 px-2 text-sm flex items-center gap-1"
							title={$LL.header.copy()}
						>
							<Copy class="w-3 h-3" />
							{$LL.header.copy()}
						</Button>
						<Button
							size="sm"
							variant="ghost"
							onclick={formatJson}
							class="h-7 px-2 text-sm flex items-center gap-1"
						>
							<FileCode2 class="w-3 h-3" />
							{$LL.header.format()}
						</Button>
						<Button
							size="sm"
							variant="ghost"
							onclick={minifyJson}
							class="h-7 px-2 text-sm flex items-center gap-1"
						>
							<Minimize2 class="w-3 h-3" />
							{$LL.header.minify()}
						</Button>
					</div>
				</div>
				<div class="flex-1 overflow-hidden">
					<JsonEditor bind:value={jsonValue} bind:this={editorRef} class="h-full w-full" />
				</div>
			</div>
		</Resizable.Pane>

		<Resizable.Handle withHandle />

		<Resizable.Pane defaultSize={50} minSize={20}>
			<div class="h-full flex flex-col overflow-hidden">
				<div class="flex-1 overflow-hidden">
					{#if parsedJson}
						<JsonGraph jsonData={parsedJson} jsonString={jsonValue} class="h-full" />
					{:else}
						<div class="h-full flex items-center justify-center text-muted-foreground">
							{$LL.editor.placeholder()}
						</div>
					{/if}
				</div>
			</div>
		</Resizable.Pane>
	</Resizable.PaneGroup>

	<!-- Footer -->
	<footer class="h-8 border-t bg-card flex items-center px-4 text-sm text-muted-foreground">
		<span>{$LL.footer.ready()}</span>
		{#if httpStatusCode !== null}
			<span class="ml-4 flex items-center gap-2">
				<span
					class={httpStatusCode >= 200 && httpStatusCode < 300
						? 'text-green-600'
						: httpStatusCode >= 400
							? 'text-red-600'
							: 'text-yellow-600'}
				>
					HTTP {httpStatusCode}
				</span>
				{#if responseTime !== null}
					<span class="text-muted-foreground">|</span>
					<span>{responseTime}ms</span>
				{/if}
			</span>
		{/if}
		{#if error}
			<span class="ml-4 text-destructive">{error}</span>
		{/if}
		<div class="ml-auto flex items-center gap-1">
			<span
				>Copyright © <a href="https://podosoft.io" target="_blank" class="hover:underline"
					>PODOSOFT.</a
				></span
			>
		</div>
	</footer>
</div>

<!-- HTTP Request Settings Dialog -->
<Dialog.Root bind:open={isDialogOpen}>
	<Dialog.Content class="sm:max-w-[600px]">
		<Dialog.Header>
			<Dialog.Title>{$LL.editor.requestSettings()}</Dialog.Title>
			<Dialog.Description>
				{$LL.editor.requestSettingsDescription()}
			</Dialog.Description>
		</Dialog.Header>

		<div class="space-y-4">
			<!-- Headers Section -->
			<div>
				<h4 class="text-sm font-medium mb-2">{$LL.editor.headers()}</h4>
				<div class="space-y-2">
					<div class={tempHeaders.length >= 4 ? "max-h-48 overflow-y-auto space-y-2" : "space-y-2"}>
						{#each tempHeaders as header, index}
							<div class="flex gap-2">
								<Input
									placeholder={$LL.editor.headerKey()}
									value={header.key}
									oninput={(e) => updateHeader(index, 'key', e.currentTarget.value)}
									class="flex-1"
								/>
								<Input
									placeholder={$LL.editor.headerValue()}
									value={header.value}
									oninput={(e) => updateHeader(index, 'value', e.currentTarget.value)}
									class="flex-1"
								/>
								<Button variant="ghost" size="icon" onclick={() => removeHeader(index)}>
									<Trash2 class="h-4 w-4" />
								</Button>
							</div>
						{/each}
					</div>
					<Button variant="outline" size="sm" onclick={addHeader} class="w-full">
						<Plus class="h-4 w-4 mr-2" />
						{$LL.editor.addHeader()}
					</Button>
				</div>
			</div>

			<!-- Body Section -->
			<div>
				<h4 class="text-sm font-medium mb-2">{$LL.editor.body()}</h4>
				<p class="text-xs text-muted-foreground mb-2">
					{$LL.editor.bodyDescription()}
				</p>
				<div class="space-y-3 mb-3">
					<div class="flex items-center space-x-2">
						<Checkbox id="use-editor-content" bind:checked={tempUseEditorContent} />
						<label for="use-editor-content" class="text-sm cursor-pointer">
							{$LL.editor.useEditorContent()}
						</label>
					</div>
					<div class="flex items-center space-x-2">
						<Checkbox id="raw-body-mode" bind:checked={tempSendAsRawText} />
						<label for="raw-body-mode" class="text-sm cursor-pointer">
							{$LL.editor.sendAsRawText()}
						</label>
					</div>
				</div>
				<Textarea
					placeholder={$LL.editor.bodyPlaceholder()}
					bind:value={tempBody}
					class="min-h-[150px] font-mono text-sm"
				/>
			</div>
		</div>

		<Dialog.Footer class="!flex !justify-between !items-center !flex-row">
			<Button variant="destructive" onclick={clearAllSettings}>
				{$LL.editor.clearAll()}
			</Button>
			<div class="flex gap-2">
				<Button variant="outline" onclick={cancelSettings}>
					{$LL.editor.cancel()}
				</Button>
				<Button onclick={saveSettings}>
					{$LL.editor.save()}
				</Button>
			</div>
		</Dialog.Footer>
	</Dialog.Content>
</Dialog.Root>
