<script lang="ts">
	import { onMount } from 'svelte';
	import JsonEditor from '$lib/components/JsonEditor.svelte';
	import JsonGraph from '$lib/components/JsonGraph.svelte';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import * as DropdownMenu from '$lib/components/ui/dropdown-menu';
	import * as Dialog from '$lib/components/ui/dialog';
	import { Textarea } from '$lib/components/ui/textarea';
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
		Trash2
	} from 'lucide-svelte';
	import { mode, toggleMode } from 'mode-watcher';
	import LanguageSwitcher from '$lib/components/LanguageSwitcher.svelte';
	import LL from '$i18n/i18n-svelte';
	import type { JsonValue } from '$lib/types/json';

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
	let urlInput = $state<string>('https://jsonplaceholder.typicode.com/todos/1');
	let isLoading = $state<boolean>(false);
	let httpMethod = $state<string>('GET');
	let isDialogOpen = $state<boolean>(false);
	let customHeaders = $state<Array<{ key: string; value: string }>>([
		{ key: 'Content-Type', value: 'application/json' }
	]);
	let customBody = $state<string>('');

	const httpMethods = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'] as const;

	function addHeader() {
		customHeaders = [...customHeaders, { key: '', value: '' }];
	}

	function removeHeader(index: number) {
		customHeaders = customHeaders.filter((_, i) => i !== index);
	}

	function updateHeader(index: number, field: 'key' | 'value', value: string) {
		customHeaders = customHeaders.map((header, i) =>
			i === index ? { ...header, [field]: value } : header
		);
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
		error = '';

		try {
			// Build headers from custom headers
			const headers: Record<string, string> = {};
			customHeaders.forEach((header) => {
				if (header.key && header.value) {
					headers[header.key] = header.value;
				}
			});

			const options: RequestInit = {
				method: httpMethod,
				headers
			};

			// For POST, PUT, PATCH requests, include body
			if (['POST', 'PUT', 'PATCH'].includes(httpMethod)) {
				if (customBody.trim()) {
					// Use custom body if provided
					options.body = customBody;
				} else if (jsonValue.trim()) {
					// Otherwise use editor content
					try {
						const bodyData = JSON.parse(jsonValue);
						options.body = JSON.stringify(bodyData);
					} catch {
						options.body = '{}';
					}
				}
			}

			const response = await fetch(urlInput, options);

			if (!response.ok) {
				throw new Error(`HTTP ${response.status}: ${response.statusText}`);
			}

			const contentType = response.headers.get('content-type');
			if (!contentType || !contentType.includes('application/json')) {
				console.warn('Response is not JSON, attempting to parse anyway');
			}

			const data = await response.json();
			jsonValue = JSON.stringify(data, null, 2);
			error = '';
		} catch (e) {
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
										onclick={() => (httpMethod = method)}
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
							class="h-7 text-xs flex-1"
							disabled={isLoading}
						/>
						<Button
							size="sm"
							variant="ghost"
							onclick={() => (isDialogOpen = true)}
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
		{#if error}
			<span class="ml-auto text-destructive">{error}</span>
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
					{#each customHeaders as header, index}
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
							<Button
								variant="ghost"
								size="icon"
								onclick={() => removeHeader(index)}
								disabled={customHeaders.length === 1 && index === 0}
							>
								<Trash2 class="h-4 w-4" />
							</Button>
						</div>
					{/each}
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
				<Textarea
					placeholder={$LL.editor.bodyPlaceholder()}
					bind:value={customBody}
					class="min-h-[150px] font-mono text-sm"
				/>
			</div>
		</div>

		<Dialog.Footer>
			<Button variant="outline" onclick={() => (isDialogOpen = false)}>
				{$LL.editor.cancel()}
			</Button>
			<Button onclick={() => (isDialogOpen = false)}>
				{$LL.editor.save()}
			</Button>
		</Dialog.Footer>
	</Dialog.Content>
</Dialog.Root>
