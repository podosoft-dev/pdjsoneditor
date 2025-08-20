<script lang="ts">
	import { Handle, Position } from '@xyflow/svelte';
	import ChevronRight from 'lucide-svelte/icons/chevron-right';
	import ChevronDown from 'lucide-svelte/icons/chevron-down';
	import Maximize2 from 'lucide-svelte/icons/maximize-2';
	import ChevronsDown from 'lucide-svelte/icons/chevrons-down';
	import ChevronsUp from 'lucide-svelte/icons/chevrons-up';
	import { mode } from 'mode-watcher';
	import * as Tooltip from '$lib/components/ui/tooltip/index.js';
	import { onMount, onDestroy } from 'svelte';
	import LL from '$i18n/i18n-svelte';
	import { logger } from '$lib/logger';
	import type { NodeItem } from '$lib/types/json';

	interface Props {
		data: {
			label: string;
			items?: NodeItem[];
			allItems?: NodeItem[];
			isExpanded?: boolean;
			isArray?: boolean;
			nodeId?: string;
			hasToggle?: boolean;
			hasExpandAll?: boolean;
			path?: string;
			hasChildren?: boolean;
			hasParent?: boolean;
			totalCount?: number;
		};
		id: string;
	}

	const { data, id }: Props = $props();
	let nodeElement: HTMLDivElement;

	// Local state for showing all items (independent from global expand)
	let showAllItems = $state(false);

	// Observe size changes and notify parent so it can re-layout siblings
	let ro: ResizeObserver | null = null;

	const MAX_STRING_LENGTH = 20;
	const MAX_DISPLAY_ITEMS = 20; // Maximum items to display (should match JsonGraph.svelte)

	function getValueDisplay(value: string, type: string): string {
		if (type === 'string') return value;
		if (type === 'null') return 'null';
		if (type === 'undefined') return 'undefined';
		return value;
	}

	function truncateString(str: string, maxLength: number): string {
		if (str.length <= maxLength) return str;
		return str.substring(0, maxLength - 3) + '...';
	}

	function needsTooltip(value: string, type: string): boolean {
		const displayValue = getValueDisplay(value, type);
		return displayValue.length > MAX_STRING_LENGTH;
	}

	function getValueColor(type: string): string {
		const isDark = mode.current === 'dark';
		switch (type) {
			case 'string':
				return isDark ? '#10b981' : '#059669'; // Emerald green for strings
			case 'number':
				return isDark ? '#3b82f6' : '#1d4ed8'; // Blue for numbers
			case 'boolean':
				return isDark ? '#f59e0b' : '#d97706'; // Amber for booleans
			case 'null':
				return isDark ? '#6b7280' : '#9ca3af'; // Gray for null values
			case 'key':
				return isDark ? '#8b5cf6' : '#7c3aed'; // Purple for object keys
			case 'reference':
				return isDark ? '#06b6d4' : '#0891b2'; // Cyan for references
			default:
				return isDark ? '#e5e7eb' : '#374151'; // Default text color
		}
	}

	function handleToggle() {
		if (data.nodeId) {
			logger.debug(`[CompactNode] Toggle button clicked for node ${data.nodeId}`);
			window.dispatchEvent(new CustomEvent('nodeToggle', { detail: data.nodeId }));
		}
	}

	function handleExpandAll() {
		if (data.nodeId) {
			window.dispatchEvent(new CustomEvent('nodeExpandAll', { detail: data.nodeId }));
		}
	}

	function handleItemClick(itemPath?: string) {
		if (itemPath) {
			window.dispatchEvent(new CustomEvent('nodeClick', { detail: itemPath }));
		}
	}

	function handleReferenceToggle(itemKey: string) {
		const referenceKey = `${id}-${itemKey}`;
		logger.debug(`[CompactNode] Reference toggle clicked for ${referenceKey}`);
		window.dispatchEvent(new CustomEvent('referenceToggle', { detail: referenceKey }));
	}

	function toggleShowAll() {
		showAllItems = !showAllItems;
		logger.debug(
			`[CompactNode] Toggle show all for ${id} (${data.label}): ${showAllItems}, total items: ${data.items?.length}`
		);

		// Notify parent about show all state change
		window.dispatchEvent(
			new CustomEvent('showAllToggle', {
				detail: {
					nodeId: id,
					showAll: showAllItems
				}
			})
		);
	}

	// Measure on mount and whenever the node's size changes (e.g., expand/collapse)
	onMount(() => {
		ro = new ResizeObserver((entries) => {
			const entry = entries[0];
			const resizeHeight = entry.borderBoxSize?.[0]?.blockSize || entry.contentRect.height;
			// noisy across many nodes; rely on JsonGraph handler for sampled logs

			window.dispatchEvent(
				new CustomEvent('nodeHeightMeasured', {
					detail: {
						nodeId: id,
						actualHeight: resizeHeight
					}
				})
			);
		});

		if (nodeElement) {
			ro.observe(nodeElement);
		}
	});

	onDestroy(() => {
		ro?.disconnect();
		ro = null;
	});
</script>

<div class="compact-node" bind:this={nodeElement}>
	{#if data.hasParent}
		<Handle
			type="target"
			position={Position.Left}
			class="!w-1.5 !h-1.5"
			style="left: -3px; background-color: {mode.current === 'dark'
				? '#6b7280'
				: '#9ca3af'}; border-color: {mode.current === 'dark' ? '#4b5563' : '#6b7280'};"
		/>
	{/if}

	{#if data.hasToggle || (data.items && data.items.length > 0)}
		<div class="node-header">
			{#if data.hasToggle}
				<button
					class="toggle-btn"
					onclick={handleToggle}
					aria-label={data.isExpanded ? 'Collapse' : 'Expand'}
				>
					{#if data.isExpanded}
						<ChevronDown size={12} />
					{:else}
						<ChevronRight size={12} />
					{/if}
				</button>
			{/if}

			<span class="label" style="color: {getValueColor('key')}">
				{data.label}
			</span>

			<span class="brackets">
				{data.isArray ? '[' : '{'}
				{#if !data.isExpanded && data.totalCount !== undefined}
					<span class="count">{data.totalCount}</span>
				{/if}
				{data.isArray ? ']' : '}'}
			</span>

			{#if data.hasExpandAll}
				<button class="expand-all-btn" onclick={handleExpandAll} aria-label="Expand all">
					<Maximize2 size={10} />
				</button>
			{/if}
		</div>

		{#if data.isExpanded}
			<div class="node-items">
				{#if data.items && data.items.length > 0}
					{@const hasMoreItems = data.items.length > MAX_DISPLAY_ITEMS}
					{@const displayItems = showAllItems ? data.items : data.items.slice(0, MAX_DISPLAY_ITEMS)}
					{@const remainingCount = data.items.length - MAX_DISPLAY_ITEMS}
					{#each displayItems as item}
						<div class="item-wrapper">
							<button
								class="item {item.type === 'reference' ? 'item-reference' : ''}"
								onclick={() => handleItemClick(item.path)}
							>
								<span
									class="item-key"
									style="color: {getValueColor(item.type === 'reference' ? 'key' : item.type)}"
								>
									{item.key}
								</span>
								{#if needsTooltip(item.value, item.type)}
									<Tooltip.Provider>
										<Tooltip.Root>
											<Tooltip.Trigger>
												<span class="item-value" style="color: {getValueColor(item.type)}">
													{truncateString(
														getValueDisplay(item.value, item.type),
														MAX_STRING_LENGTH
													)}
												</span>
											</Tooltip.Trigger>
											<Tooltip.Content>
												<p>{getValueDisplay(item.value, item.type)}</p>
											</Tooltip.Content>
										</Tooltip.Root>
									</Tooltip.Provider>
								{:else}
									<span class="item-value" style="color: {getValueColor(item.type)}">
										{getValueDisplay(item.value, item.type)}
									</span>
								{/if}
							</button>
							{#if item.type === 'reference' && item.targetNodeId}
								<button
									class="reference-handle-btn"
									onclick={() => handleReferenceToggle(item.key)}
									aria-label="Toggle reference"
									style="position: absolute; right: -10px; top: 50%; transform: translateY(-50%);"
								>
									<Handle
										type="source"
										position={Position.Right}
										id={`${id}-${item.key}`}
										class="!w-2.5 !h-2.5 item-handle"
										style="position: relative; background-color: {item.isReferenceExpanded
											? mode.current === 'dark'
												? '#10b981'
												: '#059669'
											: mode.current === 'dark'
												? '#6b7280'
												: '#9ca3af'}; border-color: {item.isReferenceExpanded
											? mode.current === 'dark'
												? '#059669'
												: '#047857'
											: mode.current === 'dark'
												? '#4b5563'
												: '#6b7280'};"
									/>
								</button>
							{/if}
						</div>
					{/each}
					{#if hasMoreItems}
						{#if !showAllItems}
							<button class="more-items-btn" onclick={toggleShowAll}>
								<ChevronsDown size={14} />
								<span>{$LL.graph.showMore({ count: remainingCount })}</span>
							</button>
						{:else}
							<button class="more-items-btn" onclick={toggleShowAll}>
								<ChevronsUp size={14} />
								<span>{$LL.graph.showLess()}</span>
							</button>
						{/if}
					{/if}
				{/if}
			</div>
		{/if}
	{:else if data.hasToggle}
		<div class="node-header">
			<button
				class="toggle-btn"
				onclick={handleToggle}
				aria-label={data.isExpanded ? 'Collapse' : 'Expand'}
			>
				{#if data.isExpanded}
					<ChevronDown size={12} />
				{:else}
					<ChevronRight size={12} />
				{/if}
			</button>
			<span class="label" style="color: {getValueColor('key')}">
				{data.label}
			</span>
			<span class="brackets">
				{data.isArray ? '[]' : '{}'}
			</span>
			{#if data.hasExpandAll}
				<button class="expand-all-btn" onclick={handleExpandAll} aria-label="Expand all">
					<Maximize2 size={10} />
				</button>
			{/if}
		</div>
	{:else}
		<div class="node-header">
			<span class="label">
				{data.label}
			</span>
		</div>
	{/if}

	{#if data.hasChildren}
		<Handle
			type="source"
			position={Position.Right}
			class="!w-1.5 !h-1.5"
			style="right: -3px; background-color: {mode.current === 'dark'
				? '#6b7280'
				: '#9ca3af'}; border-color: {mode.current === 'dark' ? '#4b5563' : '#6b7280'};"
		/>
	{/if}
</div>

<style>
	.compact-node {
		background: var(--color-card);
		border: 1px solid var(--color-border);
		border-radius: 4px;
		padding: 8px 12px;
		font-size: 13px;
		min-width: auto;
		position: relative;
		box-shadow: 0 1px 2px 0 rgb(0 0 0 / 0.05);
		transition: box-shadow 0.2s;
	}

	.compact-node:hover {
		box-shadow: 0 4px 6px -1px rgb(0 0 0 / 0.1);
	}

	.node-header {
		display: flex;
		align-items: center;
		gap: 4px;
		white-space: nowrap;
		min-height: 20px; /* keep in sync with JsonGraph METRICS.HEADER_HEIGHT */
		line-height: 20px;
	}

	.toggle-btn {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 14px;
		height: 14px;
		padding: 0;
		background: transparent;
		border: none;
		cursor: pointer;
		color: var(--color-muted-foreground);
		transition: color 0.2s;
	}

	.toggle-btn:hover {
		color: var(--color-foreground);
	}

	.expand-all-btn {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 14px;
		height: 14px;
		padding: 0;
		margin-left: 4px;
		background: transparent;
		border: none;
		cursor: pointer;
		color: var(--color-muted-foreground);
		transition: color 0.2s;
	}

	.expand-all-btn:hover {
		color: var(--color-foreground);
	}

	.label {
		font-weight: 500;
		background: none;
		border: none;
		padding: 0;
		margin: 0;
		cursor: pointer;
		font-family: inherit;
		font-size: inherit;
		transition: opacity 0.2s;
	}

	.label:hover {
		opacity: 0.8;
	}

	.brackets {
		color: var(--color-muted-foreground);
		display: flex;
		align-items: center;
		gap: 2px;
	}

	.count {
		font-size: 11px;
		color: var(--color-muted-foreground);
	}

	.node-items {
		margin-top: 4px;
		padding-left: 18px;
		border-left: 1px solid var(--color-border);
	}

	.item-wrapper {
		position: relative;
		display: flex;
		align-items: center;
	}

	.reference-handle-btn {
		padding: 0;
		background: transparent;
		border: none;
		cursor: pointer;
		width: 10px;
		height: 10px;
		display: flex;
		align-items: center;
		justify-content: center;
		z-index: 10;
	}

	:global(.item-handle) {
		transition:
			background-color 0.2s,
			filter 0.2s !important;
		cursor: pointer;
	}

	.reference-handle-btn:hover :global(.item-handle) {
		filter: brightness(1.3);
	}

	.item {
		display: grid;
		grid-template-columns: 85px 1fr;
		gap: 8px;
		padding: 2px 4px;
		white-space: nowrap;
		align-items: center;
		background: none;
		border: none;
		cursor: pointer;
		font-family: inherit;
		font-size: inherit;
		width: 100%;
		text-align: left;
		border-radius: 2px;
		transition: background-color 0.2s;
		height: 24px; /* keep in sync with JsonGraph METRICS.ITEM_ROW_HEIGHT */
		box-sizing: border-box;
	}

	.item:hover {
		background-color: var(--color-muted);
	}

	.item-key {
		font-weight: 500;
		text-align: left;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.item-value {
		font-weight: 400;
		text-align: left;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		display: block;
		width: 100%;
	}

	.item-reference {
		font-style: italic;
		opacity: 0.8;
	}

	.item-reference .item-value {
		font-family: inherit;
	}

	.more-items-btn {
		display: flex;
		align-items: center;
		gap: 4px;
		width: 100%;
		height: 24px; /* keep in sync with JsonGraph METRICS.MORE_BUTTON_HEIGHT */
		box-sizing: border-box;
		padding: 4px 8px;
		margin-top: 4px;
		font-size: 12px;
		line-height: 16px;
		color: var(--color-muted-foreground);
		background: transparent;
		border: 1px dashed var(--color-border);
		border-radius: 4px;
		cursor: pointer;
		transition:
			background-color 0.2s,
			color 0.2s,
			border-color 0.2s;
		text-align: left;
	}

	.more-items-btn:hover {
		background: var(--color-muted);
		color: var(--color-foreground);
		border-color: var(--color-muted-foreground);
	}
</style>
