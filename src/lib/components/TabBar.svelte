<script lang="ts">
	import * as Tabs from '$lib/components/ui/tabs';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import * as DropdownMenu from '$lib/components/ui/dropdown-menu';
	import { tabsStore } from '$lib/stores/tabs.svelte';
	import { logger } from '$lib/logger';
	import { LL } from '$i18n/i18n-svelte';
	import { Plus, X, MoreVertical, Copy, Edit2, Download, Upload, FileJson } from 'lucide-svelte';

	// State for tab renaming
	let renamingTabId = $state<string | null>(null);
	let renameInput = $state<string>('');

	// Handle tab selection
	function handleTabChange(value: string | undefined) {
		if (value) {
			tabsStore.switchTab(value);
		}
	}

	// Handle new tab
	function handleNewTab() {
		tabsStore.addTab();
	}

	// Handle close tab
	function handleCloseTab(e: MouseEvent, id: string) {
		e.stopPropagation();
		tabsStore.closeTab(id);
	}

	// Start renaming a tab
	function startRename(id: string) {
		const tab = tabsStore.getTab(id);
		if (tab) {
			renamingTabId = id;
			renameInput = tab.name;
		}
	}

	// Confirm rename
	function confirmRename() {
		if (renamingTabId && renameInput.trim()) {
			tabsStore.renameTab(renamingTabId, renameInput.trim());
			renamingTabId = null;
			renameInput = '';
		}
	}

	// Cancel rename
	function cancelRename() {
		renamingTabId = null;
		renameInput = '';
	}

	// Handle duplicate tab
	function handleDuplicateTab(id: string) {
		tabsStore.duplicateTab(id);
	}

	// Handle export tab
	function handleExportTab(id: string) {
		const tab = tabsStore.getTab(id);
		if (!tab) return;

		const blob = new Blob([tab.jsonContent], { type: 'application/json' });
		const url = URL.createObjectURL(blob);
		const a = document.createElement('a');
		a.href = url;
		a.download = `${tab.name.replace(/[^a-z0-9]/gi, '_')}.json`;
		document.body.appendChild(a);
		a.click();
		document.body.removeChild(a);
		URL.revokeObjectURL(url);
		logger.debug(`[TabBar] Exported tab: ${tab.name}`);
	}

	// Handle import file
	function handleImportFile(event: Event) {
		const input = event.target as HTMLInputElement;
		const file = input.files?.[0];
		if (!file) return;

		const reader = new FileReader();
		reader.onload = (e) => {
			const content = e.target?.result as string;
			const name = file.name.replace(/\.json$/i, '');
			tabsStore.addTab(name, content);
			logger.debug(`[TabBar] Imported file: ${file.name}`);
		};
		reader.readAsText(file);

		// Reset input
		input.value = '';
	}

	// Handle keyboard shortcuts
	function handleKeyDown(e: KeyboardEvent) {
		// Ctrl/Cmd + T: New tab
		if ((e.ctrlKey || e.metaKey) && e.key === 't') {
			e.preventDefault();
			handleNewTab();
		}

		// Ctrl/Cmd + W: Close current tab
		if ((e.ctrlKey || e.metaKey) && e.key === 'w') {
			e.preventDefault();
			if (tabsStore.activeTabId) {
				tabsStore.closeTab(tabsStore.activeTabId);
			}
		}

		// Ctrl/Cmd + Tab: Next tab
		if ((e.ctrlKey || e.metaKey) && e.key === 'Tab' && !e.shiftKey) {
			e.preventDefault();
			const currentIndex = tabsStore.tabs.findIndex((t) => t.id === tabsStore.activeTabId);
			const nextIndex = (currentIndex + 1) % tabsStore.tabs.length;
			if (tabsStore.tabs[nextIndex]) {
				tabsStore.switchTab(tabsStore.tabs[nextIndex].id);
			}
		}

		// Ctrl/Cmd + Shift + Tab: Previous tab
		if ((e.ctrlKey || e.metaKey) && e.key === 'Tab' && e.shiftKey) {
			e.preventDefault();
			const currentIndex = tabsStore.tabs.findIndex((t) => t.id === tabsStore.activeTabId);
			const prevIndex = currentIndex === 0 ? tabsStore.tabs.length - 1 : currentIndex - 1;
			if (tabsStore.tabs[prevIndex]) {
				tabsStore.switchTab(tabsStore.tabs[prevIndex].id);
			}
		}

		// Ctrl/Cmd + 1-9: Switch to tab N
		if ((e.ctrlKey || e.metaKey) && e.key >= '1' && e.key <= '9') {
			e.preventDefault();
			const index = parseInt(e.key) - 1;
			if (tabsStore.tabs[index]) {
				tabsStore.switchTab(tabsStore.tabs[index].id);
			}
		}
	}

	// File input ref for import
	let fileInput: HTMLInputElement;

	$effect(() => {
		// Add keyboard event listener
		window.addEventListener('keydown', handleKeyDown);
		return () => {
			window.removeEventListener('keydown', handleKeyDown);
		};
	});
</script>

<div class="border-b bg-muted/10">
	<div class="flex items-center px-2 py-1">
		<Tabs.Root value={tabsStore.activeTabId} onValueChange={handleTabChange} class="flex-1">
			<Tabs.List class="h-9 gap-1 bg-transparent p-0">
				{#each tabsStore.tabs as tab (tab.id)}
					<Tabs.Trigger
						value={tab.id}
						class="relative h-8 min-w-[120px] max-w-[200px] gap-2 rounded-t-md px-3 text-sm data-[state=active]:bg-background data-[state=active]:shadow-md data-[state=active]:border data-[state=active]:border-border data-[state=inactive]:bg-muted/30 data-[state=inactive]:hover:bg-muted/50 transition-colors"
					>
						{#if renamingTabId === tab.id}
							<Input
								bind:value={renameInput}
								class="h-6 px-1 text-sm"
								onclick={(e) => e.stopPropagation()}
								onkeydown={(e) => {
									if (e.key === 'Enter') {
										confirmRename();
									} else if (e.key === 'Escape') {
										cancelRename();
									}
								}}
								onblur={confirmRename}
								autofocus
							/>
						{:else}
							<div class="flex items-center gap-2 overflow-hidden w-full" title={tab.name}>
								<FileJson class="h-3 w-3 flex-shrink-0" />
								<span class="truncate">{tab.name}</span>
								{#if tab.metadata?.lastModified}
									<span class="text-muted-foreground flex-shrink-0">•</span>
								{/if}
							</div>
						{/if}

						<div class="ml-auto flex items-center gap-1">
							<DropdownMenu.Root>
								<DropdownMenu.Trigger onclick={(e) => e.stopPropagation()}>
									{#snippet child({ props })}
										<div
											{...props}
											class="h-4 w-4 opacity-50 hover:opacity-100 inline-flex items-center justify-center rounded-md hover:bg-accent hover:text-accent-foreground"
										>
											<MoreVertical class="h-3 w-3" />
										</div>
									{/snippet}
								</DropdownMenu.Trigger>
								<DropdownMenu.Content align="end" class="w-40">
									<DropdownMenu.Item onclick={() => startRename(tab.id)}>
										<Edit2 class="mr-2 h-3 w-3" />
										{$LL.tabs.rename()}
									</DropdownMenu.Item>
									<DropdownMenu.Item onclick={() => handleDuplicateTab(tab.id)}>
										<Copy class="mr-2 h-3 w-3" />
										{$LL.tabs.duplicate()}
									</DropdownMenu.Item>
									<DropdownMenu.Item onclick={() => handleExportTab(tab.id)}>
										<Download class="mr-2 h-3 w-3" />
										{$LL.tabs.exportJson()}
									</DropdownMenu.Item>
									<DropdownMenu.Separator />
									<DropdownMenu.Item
										onclick={() => tabsStore.closeTab(tab.id)}
										disabled={tabsStore.tabs.length === 1}
										class="text-destructive focus:text-destructive"
									>
										<X class="mr-2 h-3 w-3" />
										{$LL.tabs.closeTab()}
									</DropdownMenu.Item>
								</DropdownMenu.Content>
							</DropdownMenu.Root>

							{#if tabsStore.tabs.length > 1}
								<Button
									variant="ghost"
									size="icon"
									class="h-4 w-4 opacity-50 hover:opacity-100"
									onclick={(e) => handleCloseTab(e, tab.id)}
								>
									<X class="h-3 w-3" />
								</Button>
							{/if}
						</div>
					</Tabs.Trigger>
				{/each}
			</Tabs.List>
		</Tabs.Root>

		<div class="ml-2 flex items-center gap-1">
			<Button
				variant="ghost"
				size="icon"
				class="h-8 w-8"
				onclick={handleNewTab}
				title={$LL.tabs.newTab()}
			>
				<Plus class="h-4 w-4" />
			</Button>

			<DropdownMenu.Root>
				<DropdownMenu.Trigger
					class="inline-flex items-center justify-center rounded-md h-8 w-8 hover:bg-accent hover:text-accent-foreground transition-colors"
					title={$LL.tabs.import()}
				>
					<Upload class="h-4 w-4" />
				</DropdownMenu.Trigger>
				<DropdownMenu.Content align="end">
					<DropdownMenu.Item onclick={() => fileInput?.click()}>
						<FileJson class="mr-2 h-3 w-3" />
						{$LL.tabs.importJsonFile()}
					</DropdownMenu.Item>
				</DropdownMenu.Content>
			</DropdownMenu.Root>
		</div>
	</div>
</div>

<input
	bind:this={fileInput}
	type="file"
	accept=".json,application/json"
	class="hidden"
	onchange={handleImportFile}
/>
