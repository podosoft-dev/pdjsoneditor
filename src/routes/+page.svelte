<script lang="ts">
	import { onMount } from 'svelte';
	import JsonEditor from '$lib/components/JsonEditor.svelte';
	import JsonGraph from '$lib/components/JsonGraph.svelte';
	import TabBar from '$lib/components/TabBar.svelte';
	import { tabsStore } from '$lib/stores/tabs.svelte';
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
		Copy,
		RefreshCw
	} from 'lucide-svelte';
	import { mode, toggleMode } from 'mode-watcher';
	import LanguageSwitcher from '$lib/components/LanguageSwitcher.svelte';
	import LL from '$i18n/i18n-svelte';
	import { toast } from 'svelte-sonner';
	import type { JsonValue } from '$lib/types/json';
	import { STORAGE_KEYS } from '$lib/constants';
	import { requestJson, type HttpMethod } from '$lib/services/http';
	import { logger } from '$lib/logger';
	import { regenerateJSONValues, generateSampleJSON } from '$lib/utils/faker-generator';

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

	// Get active tab's JSON value (not used directly, kept for reference)
	// let jsonValue = $derived(tabsStore.getActiveTab()?.jsonContent || '');

	// Create a local state for the editor that syncs with the active tab
	let editorValue = $state('');

	// Update editor value when tab changes
	$effect(() => {
		const activeTab = tabsStore.getActiveTab();
		if (activeTab) {
			editorValue = activeTab.jsonContent;
			// Use cached parsed JSON if available for instant switching
			if (activeTab.parsedJson !== undefined) {
				parsedJson = activeTab.parsedJson as JsonValue;
				error = activeTab.parsedJson ? '' : $LL.editor.invalidJson();
			} else {
				// Parse if not cached
				try {
					parsedJson = JSON.parse(activeTab.jsonContent);
					error = '';
				} catch (e) {
					error = e instanceof Error ? e.message : $LL.editor.invalidJson();
					parsedJson = null;
				}
			}
		}
	});

	// Update tab content when editor changes
	$effect(() => {
		const activeTab = tabsStore.getActiveTab();
		if (activeTab && editorValue !== activeTab.jsonContent) {
			tabsStore.updateActiveTabContent(editorValue);
		}
	});

	let parsedJson = $state<JsonValue | null>(null);
	let error = $state<string>('');
	let editorRef = $state<JsonEditor | null>(null);
	let parseTimeout: ReturnType<typeof setTimeout>;

	// LocalStorage keys are centralized in $lib/constants

	// Local state for URL input (for two-way binding)
	let urlInputLocal = $state<string>('');

	// Get current tab's request settings (derived)
	let httpMethod = $derived(tabsStore.getActiveTab()?.requestSettings?.method || 'GET');
	let customHeaders = $derived(tabsStore.getActiveTab()?.requestSettings?.headers || []);
	let customBody = $derived(tabsStore.getActiveTab()?.requestSettings?.body || '');
	let sendAsRawText = $derived(tabsStore.getActiveTab()?.requestSettings?.sendAsRawText || false);
	let useEditorContent = $derived(
		tabsStore.getActiveTab()?.requestSettings?.useEditorContent || false
	);

	// Sync local URL input with tab's URL
	$effect(() => {
		const tabUrl =
			tabsStore.getActiveTab()?.requestSettings?.url ||
			'https://jsonplaceholder.typicode.com/todos/1';
		urlInputLocal = tabUrl;
	});

	// UI state (not tab-specific)
	let isLoading = $state<boolean>(false);
	let isDialogOpen = $state<boolean>(false);
	let tempHeaders = $state<Array<{ key: string; value: string }>>([]);
	let tempBody = $state<string>('');
	let tempSendAsRawText = $state<boolean>(false);
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
		// Save to active tab
		tabsStore.updateActiveTabRequestSettings({
			headers: [...tempHeaders],
			body: tempBody,
			sendAsRawText: tempSendAsRawText,
			useEditorContent: tempUseEditorContent
		});

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
			Object.values(STORAGE_KEYS).forEach((key) => {
				localStorage.removeItem(key);
			});

			// Reset tab's request settings to defaults
			tabsStore.updateActiveTabRequestSettings({
				url: 'https://jsonplaceholder.typicode.com/todos/1',
				method: 'GET',
				headers: [],
				body: '',
				sendAsRawText: false,
				useEditorContent: false
			});
			httpStatusCode = null;
			responseTime = null;
			error = '';

			// Reset temp values
			tempHeaders = [{ key: '', value: '' }];
			tempBody = '';
			tempSendAsRawText = false;
			tempUseEditorContent = false;

			// Close dialog
			isDialogOpen = false;
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

	function saveUrlAndMethod(url?: string, method?: string) {
		const activeTab = tabsStore.getActiveTab();
		if (!activeTab) return;

		tabsStore.updateActiveTabRequestSettings({
			url: url ?? activeTab.requestSettings?.url ?? '',
			method: method ?? activeTab.requestSettings?.method ?? 'GET'
		});
	}

	function clearJson() {
		const activeTab = tabsStore.getActiveTab();
		if (activeTab) {
			tabsStore.updateActiveTabContent('');
			// Update local state immediately
			editorValue = '';
			parsedJson = null;
		}
		error = '';
	}

	async function copyJson() {
		try {
			await navigator.clipboard.writeText(editorValue);
			toast.success($LL.header.copySuccess());
		} catch (e) {
			logger.error('Failed to copy to clipboard:', e);
			// Fallback for older browsers
			try {
				const textArea = document.createElement('textarea');
				textArea.value = editorValue;
				document.body.appendChild(textArea);
				textArea.focus();
				textArea.select();
				document.execCommand('copy');
				document.body.removeChild(textArea);
				toast.success($LL.header.copySuccess());
			} catch (fallbackError) {
				logger.error('Fallback copy failed:', fallbackError);
				toast.error($LL.header.copyError());
			}
		}
	}

	function formatJson() {
		try {
			const activeTab = tabsStore.getActiveTab();
			if (activeTab) {
				const parsed = JSON.parse(activeTab.jsonContent);
				const formatted = JSON.stringify(parsed, null, 2);
				tabsStore.updateActiveTabContent(formatted);
				// Update local state immediately
				editorValue = formatted;
				parsedJson = parsed;
				error = '';
			}
		} catch (e) {
			error = e instanceof Error ? e.message : $LL.editor.invalidJson();
		}
	}

	function minifyJson() {
		try {
			const activeTab = tabsStore.getActiveTab();
			if (activeTab) {
				const parsed = JSON.parse(activeTab.jsonContent);
				const minified = JSON.stringify(parsed);
				tabsStore.updateActiveTabContent(minified);
				// Update local state immediately
				editorValue = minified;
				parsedJson = parsed;
				error = '';
			}
		} catch (e) {
			error = e instanceof Error ? e.message : $LL.editor.invalidJson();
		}
	}

	function regenerateValues() {
		try {
			const activeTab = tabsStore.getActiveTab();
			if (activeTab) {
				let regenerated;

				// Check if current JSON is empty or invalid
				if (!activeTab.jsonContent || activeTab.jsonContent.trim() === '') {
					// Generate new sample JSON
					regenerated = generateSampleJSON();
				} else {
					try {
						// Try to parse existing JSON
						const parsed = JSON.parse(activeTab.jsonContent);
						// Regenerate values while preserving structure
						regenerated = regenerateJSONValues(parsed);
					} catch {
						// If parsing fails, generate new sample JSON
						regenerated = generateSampleJSON();
					}
				}

				const formatted = JSON.stringify(regenerated, null, 2);
				tabsStore.updateActiveTabContent(formatted);
				// Update local state immediately
				editorValue = formatted;
				parsedJson = regenerated as JsonValue;
				error = '';
				toast.success($LL.editor.regenerateSuccess());
			}
		} catch (e) {
			logger.error('Failed to regenerate JSON values:', e);
			toast.error($LL.editor.invalidJson());
		}
	}

	async function fetchJsonFromUrl() {
		if (!urlInputLocal.trim()) {
			error = $LL.editor.urlRequired();
			return;
		}

		// Save the URL before fetching
		saveUrlAndMethod(urlInputLocal, undefined);

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
				url: urlInputLocal,
				headers: customHeaders,
				editorJson: editorValue,
				customBody,
				sendAsRawText,
				useEditorContent,
				signal: abortController.signal
			});
			const endTime = performance.now();
			responseTime = Math.round(endTime - startTime);
			httpStatusCode = res.status;

			if (res.data !== undefined) {
				const formattedJson = JSON.stringify(res.data, null, 2);
				tabsStore.updateActiveTabContent(formattedJson);
				// Also update the local parsed JSON immediately
				parsedJson = res.data as JsonValue;
			} else if (res.rawText !== undefined) {
				// Non-JSON response shown as text
				const responseObj = { response: res.rawText };
				const formattedJson = JSON.stringify(responseObj, null, 2);
				tabsStore.updateActiveTabContent(formattedJson);
				// Also update the local parsed JSON immediately
				parsedJson = responseObj as JsonValue;
			}

			if (res.ok && error && (error.includes('fetch') || error.includes('HTTP'))) {
				error = '';
			}
		} catch (e) {
			if ((e as Error)?.name === 'AbortError') {
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
		saveUrlAndMethod(urlInputLocal, undefined);
	}

	function handleMethodChange(newMethod: string) {
		saveUrlAndMethod(undefined, newMethod);
	}

	$effect(() => {
		const currentJsonValue = editorValue;
		// console.log('[Page Effect] JSON value changed, length:', currentJsonValue.length);

		// Clear previous timeout
		if (parseTimeout) {
			clearTimeout(parseTimeout);
		}

		// Set new timeout for 500ms delay
		parseTimeout = setTimeout(async () => {
			// console.log('[Page Effect] Parsing JSON after timeout');
			try {
				// Activate graph loading overlay before parsing to improve perceived responsiveness with large inputs
				const mod = await import('$lib/stores/graphLoading');
				mod.graphLoading.set({ active: true, phase: 'build', progress: 0 });
				parsedJson = JSON.parse(currentJsonValue);
				error = '';

				// Update cached parsed JSON in the active tab
				const activeTab = tabsStore.getActiveTab();
				if (activeTab) {
					activeTab.parsedJson = parsedJson;
				}
			} catch (e) {
				error = e instanceof Error ? e.message : $LL.editor.invalidJson();
				parsedJson = null;

				// Update cached parsed JSON in the active tab
				const activeTab = tabsStore.getActiveTab();
				if (activeTab) {
					activeTab.parsedJson = null;
				}
			}
		}, 500);

		return () => {
			if (parseTimeout) {
				clearTimeout(parseTimeout);
			}
		};
	});

	onMount(() => {
		const handleNodeClick = (e: CustomEvent) => {
			const path = e.detail;
			if (path && editorRef) {
				editorRef.navigateToPath(path);
			}
		};

		const handleTabChanged = () => {
			// Force re-render of graph when tab changes
			const activeTab = tabsStore.getActiveTab();
			if (activeTab) {
				editorValue = activeTab.jsonContent;
				// Use cached parsed JSON if available for instant switching
				if (activeTab.parsedJson !== undefined) {
					parsedJson = activeTab.parsedJson as JsonValue;
					error = activeTab.parsedJson ? '' : $LL.editor.invalidJson();
				} else {
					// Parse if not cached
					try {
						parsedJson = JSON.parse(activeTab.jsonContent);
						error = '';
					} catch (e) {
						error = e instanceof Error ? e.message : $LL.editor.invalidJson();
						parsedJson = null;
					}
				}
			}
		};

		window.addEventListener('nodeClick', handleNodeClick as EventListener);
		window.addEventListener('tabChanged', handleTabChanged as EventListener);

		return () => {
			window.removeEventListener('nodeClick', handleNodeClick as EventListener);
			window.removeEventListener('tabChanged', handleTabChanged as EventListener);
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

	<!-- Tab Bar -->
	<TabBar />

	<Resizable.PaneGroup direction="horizontal" class="flex-1">
		<Resizable.Pane defaultSize={30} minSize={20}>
			<div class="h-full flex flex-col overflow-hidden">
				<div class="flex flex-col border-b bg-muted/50">
					<div class="h-8 flex items-center px-2 flex-shrink-0 gap-1">
						<DropdownMenu.Root>
							<DropdownMenu.Trigger
								class="inline-flex items-center justify-center h-7 px-2 text-xs gap-1 rounded-md border border-input bg-background hover:bg-accent hover:text-accent-foreground"
							>
								{httpMethod}
								<ChevronDown class="h-3 w-3" />
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
							bind:value={urlInputLocal}
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
						<Button
							size="sm"
							variant="ghost"
							onclick={regenerateValues}
							class="h-7 px-2 text-sm flex items-center gap-1"
							title={$LL.editor.regenerateTooltip()}
						>
							<RefreshCw class="w-3 h-3" />
							{$LL.editor.regenerate()}
						</Button>
					</div>
				</div>
				<div class="flex-1 overflow-hidden">
					{#key tabsStore.activeTabId}
						<JsonEditor bind:value={editorValue} bind:this={editorRef} class="h-full w-full" />
					{/key}
				</div>
			</div>
		</Resizable.Pane>

		<Resizable.Handle withHandle />

		<Resizable.Pane defaultSize={50} minSize={20}>
			<div class="h-full flex flex-col overflow-hidden">
				<div class="flex-1 overflow-hidden">
					{#key tabsStore.activeTabId}
						{#if parsedJson}
							<JsonGraph jsonData={parsedJson} jsonString={editorValue} class="h-full" />
						{:else}
							<div class="h-full flex items-center justify-center text-muted-foreground">
								{$LL.editor.placeholder()}
							</div>
						{/if}
					{/key}
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
					<div class={tempHeaders.length >= 4 ? 'max-h-48 overflow-y-auto space-y-2' : 'space-y-2'}>
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
