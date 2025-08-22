import { logger } from '$lib/logger';
import { generateSampleJSON } from '$lib/utils/faker-generator';

// Generate sample JSON data for new tabs using faker
function getDefaultJSON(): string {
	return JSON.stringify(generateSampleJSON(), null, 2);
}

// Tab data interface
export interface TabData {
	id: string;
	name: string;
	jsonContent: string;
	parsedJson?: unknown; // Cache parsed JSON for faster tab switching
	editorState?: {
		cursorPosition?: number;
		selection?: { from: number; to: number };
		scrollPosition?: number;
	};
	graphState?: {
		expandedNodes: Set<string>;
		showAllItemsNodes: Set<string>;
		zoom?: number;
		pan?: { x: number; y: number };
	};
	metadata?: {
		source?: 'file' | 'url' | 'paste' | 'manual';
		lastModified?: Date;
	};
	requestSettings?: {
		url: string;
		method: string;
		headers: Array<{ key: string; value: string }>;
		body: string;
		sendAsRawText: boolean;
		useEditorContent: boolean;
	};
}

// Tabs store class using Svelte 5 runes
class TabsStore {
	tabs = $state<TabData[]>([]);
	activeTabId = $state<string>('');
	private saveTimeout: ReturnType<typeof setTimeout> | null = null;

	constructor() {
		// Only initialize on client side
		if (typeof window !== 'undefined') {
			// Initialize with one default tab
			this.addTab('Tab 1', getDefaultJSON());
		}
	}

	// Add a new tab
	addTab(name?: string, content?: string) {
		const jsonContent = content || getDefaultJSON();

		// Try to parse the JSON content
		let parsedJson = null;
		try {
			parsedJson = JSON.parse(jsonContent);
		} catch {
			// Ignore parse errors
		}

		const newTab: TabData = {
			id: crypto.randomUUID(),
			name: name || `Tab ${this.tabs.length + 1}`,
			jsonContent,
			parsedJson,
			graphState: {
				expandedNodes: new Set<string>(),
				showAllItemsNodes: new Set<string>()
			},
			requestSettings: {
				url: 'https://jsonplaceholder.typicode.com/todos/1',
				method: 'GET',
				headers: [],
				body: '',
				sendAsRawText: false,
				useEditorContent: false
			}
		};

		this.tabs.push(newTab);
		this.activeTabId = newTab.id;
		logger.debug(`[TabsStore] Added new tab: ${newTab.name} (${newTab.id})`);

		// Trigger graph update for the new tab
		this.triggerGraphUpdate();

		// Save to localStorage after adding
		this.debouncedSave();

		return newTab.id;
	}

	// Switch to a different tab
	switchTab(id: string) {
		const tab = this.tabs.find((t) => t.id === id);
		if (!tab) {
			logger.warn(`[TabsStore] Tab not found: ${id}`);
			return;
		}

		// Save current tab state before switching
		this.saveCurrentTabState();

		// Switch to new tab
		this.activeTabId = id;
		logger.debug(`[TabsStore] Switched to tab: ${tab.name} (${id})`);

		// Trigger graph update for the new tab
		this.triggerGraphUpdate();

		// Save to localStorage after switching (to persist activeTabId)
		this.debouncedSave();
	}

	// Close a tab
	closeTab(id: string) {
		const index = this.tabs.findIndex((t) => t.id === id);
		if (index === -1) {
			logger.warn(`[TabsStore] Cannot close tab - not found: ${id}`);
			return;
		}

		// Don't allow closing the last tab
		if (this.tabs.length === 1) {
			logger.warn('[TabsStore] Cannot close the last tab');
			return;
		}

		const tabName = this.tabs[index].name;
		this.tabs.splice(index, 1);
		logger.debug(`[TabsStore] Closed tab: ${tabName} (${id})`);

		// If closing active tab, switch to adjacent tab
		if (this.activeTabId === id && this.tabs.length > 0) {
			const newIndex = Math.min(index, this.tabs.length - 1);
			this.activeTabId = this.tabs[newIndex].id;
			logger.debug(`[TabsStore] Switched to tab: ${this.tabs[newIndex].name}`);
			this.triggerGraphUpdate();
		}

		// Save to localStorage after closing
		this.debouncedSave();
	}

	// Rename a tab
	renameTab(id: string, newName: string) {
		const tab = this.tabs.find((t) => t.id === id);
		if (!tab) {
			logger.warn(`[TabsStore] Cannot rename tab - not found: ${id}`);
			return;
		}

		const oldName = tab.name;
		tab.name = newName;
		logger.debug(`[TabsStore] Renamed tab from "${oldName}" to "${newName}" (${id})`);

		// Save to localStorage after renaming
		this.debouncedSave();
	}

	// Duplicate a tab
	duplicateTab(id: string) {
		const tab = this.tabs.find((t) => t.id === id);
		if (!tab) {
			logger.warn(`[TabsStore] Cannot duplicate tab - not found: ${id}`);
			return;
		}

		const newTab: TabData = {
			...tab,
			id: crypto.randomUUID(),
			name: `${tab.name} (copy)`,
			parsedJson: tab.parsedJson, // Copy the cached parsed JSON
			graphState: tab.graphState
				? {
						expandedNodes: new Set(tab.graphState.expandedNodes),
						showAllItemsNodes: new Set(tab.graphState.showAllItemsNodes),
						zoom: tab.graphState.zoom,
						pan: tab.graphState.pan ? { ...tab.graphState.pan } : undefined
					}
				: {
						expandedNodes: new Set<string>(),
						showAllItemsNodes: new Set<string>()
					},
			requestSettings: tab.requestSettings
				? {
						...tab.requestSettings,
						headers: tab.requestSettings.headers ? [...tab.requestSettings.headers] : []
					}
				: {
						url: 'https://jsonplaceholder.typicode.com/todos/1',
						method: 'GET',
						headers: [],
						body: '',
						sendAsRawText: false,
						useEditorContent: false
					}
		};

		this.tabs.push(newTab);
		this.activeTabId = newTab.id;
		logger.debug(`[TabsStore] Duplicated tab: ${tab.name} -> ${newTab.name} (${newTab.id})`);
		this.triggerGraphUpdate();

		// Save to localStorage after duplicating
		this.debouncedSave();

		return newTab.id;
	}

	// Update JSON content of active tab
	updateActiveTabContent(content: string) {
		const tab = this.getActiveTab();
		if (!tab) return;

		tab.jsonContent = content;

		// Try to parse and cache the JSON
		try {
			tab.parsedJson = JSON.parse(content);
		} catch {
			tab.parsedJson = null;
		}

		tab.metadata = {
			...tab.metadata,
			lastModified: new Date()
		};

		// Auto-save after content update
		this.debouncedSave();
	}

	// Update request settings for active tab
	updateActiveTabRequestSettings(settings: Partial<TabData['requestSettings']>) {
		const tab = this.getActiveTab();
		if (!tab) return;

		tab.requestSettings = {
			...tab.requestSettings,
			...settings
		} as TabData['requestSettings'];

		this.debouncedSave();
	}

	// Debounced save to localStorage
	private debouncedSave() {
		if (typeof window === 'undefined') return;

		if (this.saveTimeout) {
			clearTimeout(this.saveTimeout);
		}

		this.saveTimeout = setTimeout(() => {
			this.saveToStorage();
		}, 1000);
	}

	// Save current tab state (called before switching tabs)
	saveCurrentTabState() {
		const tab = this.getActiveTab();
		if (!tab) return;

		// The editor and graph components will handle saving their states
		// through event listeners
		logger.debug(`[TabsStore] Saved state for tab: ${tab.name}`);
	}

	// Get active tab
	getActiveTab(): TabData | undefined {
		return this.tabs.find((t) => t.id === this.activeTabId);
	}

	// Get tab by ID
	getTab(id: string): TabData | undefined {
		return this.tabs.find((t) => t.id === id);
	}

	// Update graph state for active tab
	updateActiveTabGraphState(graphState: Partial<TabData['graphState']>) {
		const tab = this.getActiveTab();
		if (!tab) return;

		tab.graphState = {
			...tab.graphState,
			...graphState
		} as TabData['graphState'];
	}

	// Update editor state for active tab
	updateActiveTabEditorState(editorState: Partial<TabData['editorState']>) {
		const tab = this.getActiveTab();
		if (!tab) return;

		tab.editorState = {
			...tab.editorState,
			...editorState
		};
	}

	// Trigger graph update event
	private triggerGraphUpdate() {
		// Dispatch custom event to notify graph component to re-render
		if (typeof window !== 'undefined') {
			window.dispatchEvent(new CustomEvent('tabChanged'));
		}
	}

	// Clear all tabs and reset
	reset() {
		this.tabs = [];
		this.activeTabId = '';
		this.addTab('Tab 1', getDefaultJSON());
		logger.debug('[TabsStore] Store reset');
	}

	// Load tabs from localStorage (for persistence)
	loadFromStorage() {
		try {
			const stored = localStorage.getItem('pdjsoneditor_tabs');
			if (!stored) return;

			const data = JSON.parse(stored);
			if (!data.tabs || !Array.isArray(data.tabs)) return;

			// Reconstruct tabs with Set objects
			this.tabs = data.tabs.map((tab: TabData) => ({
				...tab,
				graphState: tab.graphState
					? {
							...tab.graphState,
							expandedNodes: new Set(tab.graphState.expandedNodes || []),
							showAllItemsNodes: new Set(tab.graphState.showAllItemsNodes || [])
						}
					: {
							expandedNodes: new Set<string>(),
							showAllItemsNodes: new Set<string>()
						}
			}));

			if (data.activeTabId && this.tabs.find((t) => t.id === data.activeTabId)) {
				this.activeTabId = data.activeTabId;
			} else if (this.tabs.length > 0) {
				this.activeTabId = this.tabs[0].id;
			}

			logger.debug(`[TabsStore] Loaded ${this.tabs.length} tabs from storage`);
		} catch (error) {
			logger.error('[TabsStore] Failed to load from storage:', error);
		}
	}

	// Save tabs to localStorage
	saveToStorage() {
		try {
			const data = {
				tabs: this.tabs.map((tab) => ({
					...tab,
					graphState: tab.graphState
						? {
								...tab.graphState,
								expandedNodes: Array.from(tab.graphState.expandedNodes),
								showAllItemsNodes: Array.from(tab.graphState.showAllItemsNodes)
							}
						: undefined
				})),
				activeTabId: this.activeTabId
			};

			localStorage.setItem('pdjsoneditor_tabs', JSON.stringify(data));
			logger.debug('[TabsStore] Saved tabs to storage');
		} catch (error) {
			logger.error('[TabsStore] Failed to save to storage:', error);
		}
	}
}

// Create singleton instance
export const tabsStore = new TabsStore();

// Initialize on client side
if (typeof window !== 'undefined') {
	// Load from storage on initialization
	tabsStore.loadFromStorage();

	// If no tabs after loading, create default tab
	if (tabsStore.tabs.length === 0) {
		tabsStore.addTab('Tab 1', getDefaultJSON());
	}
}
