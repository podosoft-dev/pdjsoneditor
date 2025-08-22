<script lang="ts">
	import { onMount, tick } from 'svelte';
	import {
		SvelteFlow,
		SvelteFlowProvider,
		Controls,
		Background,
		MiniMap,
		type Node as FlowNode,
		type Edge,
		Position,
		type BackgroundVariant
	} from '@xyflow/svelte';
	import '@xyflow/svelte/dist/style.css';
	import CompactNode from './CompactNode.svelte';
	import FitViewController from './FitViewController.svelte';
	import dagre from 'dagre';
	import { mode } from 'mode-watcher';
	import { logger } from '$lib/logger';
	import { graphLoading } from '$lib/stores/graphLoading';
	// Use Vite worker plugin to ensure bundling works in all environments
	// @ts-expect-error - Vite injects a Worker constructor type via ?worker
	import GraphLayoutWorker from '$lib/workers/graphLayout.worker.ts?worker&module';
	import type { JsonValue, NodeItem } from '$lib/types/json';

	interface Props {
		jsonData: JsonValue;
		jsonString?: string; // Original JSON string to preserve number formatting
		class?: string;
	}

	const { jsonData, jsonString, class: className = '' }: Props = $props();

	type NodeData = {
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

	type Node = FlowNode<NodeData>;

	let nodes = $state<Node[]>([]);
	let edges = $state<Edge[]>([]);
	const expandedNodes = $state(new Set<string>()); // Will be populated with all nodes on first load
	const expandedReferences = $state(new Set<string>()); // Will be populated with all references on first load
	const showAllItemsNodes = $state(new Set<string>()); // Track which nodes show all items (not using 'Show more')
	let isFirstLoad = true;
	let previousJsonData: JsonValue | null = null;
	const nodeCallbacks = new Map<string, { toggle: () => void; expandAll: () => void }>();
	let triggerFitView = $state(false);

	// Helper function to get original number format from JSON string
	function getOriginalNumberFormat(
		jsonStr: string,
		path: string,
		parsedValue: number
	): string | null {
		try {
			// For root level properties, create a simple regex
			if (!path.includes('.')) {
				const keyPattern = new RegExp(
					`"${path}"\\s*:\\s*([+-]?\\d*\\.?\\d+(?:[eE][+-]?\\d+)?)`,
					'g'
				);
				const match = keyPattern.exec(jsonStr);
				if (match && parseFloat(match[1]) === parsedValue) {
					return match[1];
				}
			} else {
				// For nested properties, this is more complex
				// For now, just check if it's a whole number that could be a float
				if (Number.isInteger(parsedValue)) {
					// Check if original contains this number with decimal point
					const numberStr = parsedValue.toString();
					const floatPattern = new RegExp(`\\b${numberStr}\\.0\\b`);
					if (floatPattern.test(jsonStr)) {
						return `${numberStr}.0`;
					}
				}
			}
		} catch {
			// If regex fails, return null
		}
		return null;
	}

	const measuredHeights = new Map<string, number>(); // Store actual measured heights
	// --- dynamic reflow when heights change ---
	let reflowScheduled = false;
	let expectedNodeCount = 0; // Number of nodes created at initial load
	let measuredNodeCount = 0; // Number of nodes measured
	let initialLoadComplete = false;

	function scheduleReflow() {
		if (reflowScheduled) {
			logger.debug('[scheduleReflow] Already scheduled, skipping');
			return;
		}
		reflowScheduled = true;
		logger.debug('[scheduleReflow] Scheduling reflow');
		requestAnimationFrame(() => {
			reflowScheduled = false;
			logger.debug('[scheduleReflow] Executing reflow');
			reflowWithMeasuredHeights();
		});
	}

	function reflowWithMeasuredHeights() {
		if (!nodes || nodes.length === 0) {
			logger.debug('[reflowWithMeasuredHeights] No nodes to reflow');
			return;
		}

		logger.debug('[reflowWithMeasuredHeights] Starting reflow with ' + nodes.length + ' nodes');
		logger.debug('[reflowWithMeasuredHeights] Measured heights count: ' + measuredHeights.size);

		// Clone current state and re-run dagre using measured heights
		tempNodes = nodes.map((n) => ({ ...n }));
		tempEdges = edges.map((e) => ({ ...e }));

		layoutNodesWithDagre();

		// Keep current display state; only positions are updated
		nodes = [...tempNodes];
		edges = [...tempEdges];
		logger.debug('[reflowWithMeasuredHeights] Reflow complete');
	}

	// Temporary arrays for building the graph
	let tempNodes: Node[] = [];
	let tempEdges: Edge[] = [];

	const nodeTypes = {
		compact: CompactNode
	};

	let nodeId = 0;

	// ============ Layout Configuration ============
	const LAYOUT_CONFIG = {
		// Node size
		NODE_WIDTH: 280,
		INITIAL_HEIGHT: 100, // Fallback height (should rarely be used)

		// Estimated layout metrics (keep in sync with CompactNode.svelte CSS)
		METRICS: {
			NODE_PADDING_Y: 16, // .compact-node padding 8px top/bottom => 16
			NODE_BORDER_Y: 2, // .compact-node border 1px top/bottom => 2
			HEADER_HEIGHT: 20, // .node-header min-height
			ITEMS_TOP_MARGIN: 4, // .node-items margin-top
			ITEM_ROW_HEIGHT: 24, // .item fixed height
			MORE_BUTTON_HEIGHT: 24 // .more-items-btn height
		},

		// dagre layout settings
		DAGRE: {
			RANK_DIR: 'LR',
			NODE_SEP: 20, // LR mode: vertical spacing between nodes at same x coordinate
			RANK_SEP: 150, // LR mode: horizontal spacing between levels
			EDGE_SEP: 10,
			RANKER: 'network-simplex',
			ALIGN: 'UL',
			MARGIN_X: 50,
			MARGIN_Y: 50
		},

		// Overlap prevention
		OVERLAP: {
			MIN_SPACING: 30, // Minimum spacing between nodes
			X_TOLERANCE: 5 // X coordinate grouping tolerance
		},

		// Others
		MAX_DISPLAY_ITEMS: 20 // Maximum number of items to display
	};

	// Dagre layout configuration
	const dagreGraph = new dagre.graphlib.Graph();
	dagreGraph.setDefaultEdgeLabel(() => ({}));

	let regenTimer: number | null = null;
	let fakeProgressTimer: number | null = null;

	async function performLayoutWithWorker(): Promise<void> {
		// Instantiate bundled worker via Vite's ?worker plugin
		const worker: Worker = new (GraphLayoutWorker as unknown as new () => Worker)();
		const LARGE_GRAPH_NODE_THRESHOLD = 400;
		const isLarge = tempNodes.length >= LARGE_GRAPH_NODE_THRESHOLD;
		const cfg = {
			...LAYOUT_CONFIG,
			DAGRE: {
				...LAYOUT_CONFIG.DAGRE,
				RANKER: isLarge ? 'longest-path' : LAYOUT_CONFIG.DAGRE.RANKER,
				NODE_SEP: isLarge
					? Math.max(16, LAYOUT_CONFIG.DAGRE.NODE_SEP - 4)
					: LAYOUT_CONFIG.DAGRE.NODE_SEP,
				RANK_SEP: isLarge
					? Math.max(80, LAYOUT_CONFIG.DAGRE.RANK_SEP - 40)
					: LAYOUT_CONFIG.DAGRE.RANK_SEP
			}
		};

		graphLoading.set({ active: true, phase: 'build', progress: 0 });

		return new Promise((resolve, reject) => {
			worker.onmessage = (e: MessageEvent) => {
				const data = e.data as {
					type: string;
					nodes?: Node[];
					edges?: Edge[];
					progress?: number;
					message?: string;
					phase?: 'build' | 'layout' | 'finalize';
				};
				if (data.type === 'progress') {
					// Stop fake progress when real progress starts arriving
					if (fakeProgressTimer) {
						clearInterval(fakeProgressTimer);
						fakeProgressTimer = null;
					}
					graphLoading.set({
						active: true,
						phase: data.phase || 'build',
						progress: data.progress || 0
					});
				} else if (data.type === 'done') {
					tempNodes = data.nodes || [];
					graphLoading.set({ active: true, phase: 'finalize', progress: 1 });
					worker.terminate();
					resolve();
				}
			};
			worker.onerror = (err) => {
				worker.terminate();
				reject(err);
			};
			worker.postMessage({
				type: 'layout',
				nodes: tempNodes,
				edges: tempEdges,
				measuredHeights: Array.from(measuredHeights.entries()),
				showAllItemsNodeIds: Array.from(showAllItemsNodes),
				config: cfg
			});
		});
	}

	function estimateDisplayItemCount(node: Node): number {
		if (!node.data?.isExpanded) return 0;
		const total = node.data.items?.length ?? 0;
		const nodeShowsAll = showAllItemsNodes.has(node.id);
		if (nodeShowsAll) return total;
		return Math.min(total, LAYOUT_CONFIG.MAX_DISPLAY_ITEMS);
	}

	function hasMoreButton(node: Node): boolean {
		if (!node.data?.isExpanded) return false;
		const total = node.data.items?.length ?? 0;
		const nodeShowsAll = showAllItemsNodes.has(node.id);
		return total > LAYOUT_CONFIG.MAX_DISPLAY_ITEMS && !nodeShowsAll;
	}

	function estimateNodeHeight(node: Node): number {
		const M = LAYOUT_CONFIG.METRICS;
		// base = vertical padding + header
		let h = M.NODE_PADDING_Y + M.NODE_BORDER_Y + M.HEADER_HEIGHT;
		if (node.data?.isExpanded) {
			const count = estimateDisplayItemCount(node);
			const extraBtn = hasMoreButton(node) ? M.MORE_BUTTON_HEIGHT : 0;
			h += M.ITEMS_TOP_MARGIN + count * M.ITEM_ROW_HEIGHT + extraBtn;
		}
		return Math.max(h, 32); // guard minimum
	}

	function toggleNode(nodeId: string) {
		const wasExpanded = expandedNodes.has(nodeId);
		if (wasExpanded) {
			expandedNodes.delete(nodeId);
			logger.debug(`[toggleNode] Collapsed node: ${nodeId}`);
			// Collapse: remove descendants and show only references in parent items
			const descendants = getDescendantNodeIds(nodeId);
			if (descendants.size > 0) {
				const before = nodes.length;
				nodes = nodes.filter((n) => !descendants.has(n.id));
				edges = edges.filter((e) => !descendants.has(e.source) && !descendants.has(e.target));
				logger.debug(`[toggleNode] Removed ${before - nodes.length} descendant nodes`);
			}
			// Update parent items to references-only
			nodes = nodes.map((n) => {
				if (n.id !== nodeId) return n;
				const all = n.data?.allItems || [];
				const refsOnly = all.filter((it) => it.type === 'reference');
				return { ...n, data: { ...n.data, isExpanded: false, items: refsOnly } } as Node;
			});
			// Clear measured heights to force re-estimation
			measuredHeights.delete(nodeId);
			for (const id of descendants) measuredHeights.delete(id);
			// Reflow current graph without full rebuild
			scheduleReflow();
		} else {
			expandedNodes.add(nodeId);
			logger.debug(`[toggleNode] Expanded node: ${nodeId}`);
			// Expand: update parent items to allItems and incrementally create children
			nodes = nodes.map((n) =>
				n.id === nodeId
					? { ...n, data: { ...n.data, isExpanded: true, items: n.data?.allItems || [] } }
					: n
			);
			measuredHeights.delete(nodeId);
			// Incremental subtree creation to avoid full rebuild
			incrementallyCreateChildren(nodeId);
		}
		logger.debug(`[toggleNode] Expanded nodes count: ${expandedNodes.size}`);
	}

	function getDescendantNodeIds(rootId: string): Set<string> {
		const childrenMap = new Map<string, string[]>();
		for (const e of edges) {
			const arr = childrenMap.get(e.source) || [];
			arr.push(e.target);
			childrenMap.set(e.source, arr);
		}
		const result = new Set<string>();
		const stack: string[] = [...(childrenMap.get(rootId) || [])];
		while (stack.length) {
			const cur = stack.pop()!;
			if (result.has(cur)) continue;
			result.add(cur);
			const kids = childrenMap.get(cur);
			if (kids && kids.length) stack.push(...kids);
		}
		return result;
	}

	function getJsonAtPath(root: JsonValue, pathStr: string): JsonValue | null {
		if (!pathStr) return root;
		const parts = pathStr.split('.').filter(Boolean);
		let cur = root as JsonValue;
		for (const p of parts) {
			if (cur == null) return null;
			if (Array.isArray(cur)) {
				const idx = Number(p);
				if (Number.isNaN(idx)) return null;
				cur = cur[idx];
			} else if (typeof cur === 'object') {
				cur = (cur as Record<string, JsonValue>)[p];
			} else {
				return null;
			}
		}
		return cur as JsonValue;
	}

	function incrementallyCreateChildren(parentId: string) {
		const parent = nodes.find((n) => n.id === parentId);
		if (!parent) {
			scheduleReflow();
			return;
		}
		const parentPath = parent.data?.path || '';
		const parentJson = getJsonAtPath(jsonData as JsonValue, parentPath);
		if (parentJson == null || typeof parentJson !== 'object') {
			scheduleReflow();
			return;
		}

		const nodeShowsAll = showAllItemsNodes.has(parentId);
		const allItems = parent.data?.allItems || [];
		const refItems = allItems.filter((it) => it.type === 'reference');

		// Stash global temp arrays while we reuse createCompactGraph
		const prevTempNodes = tempNodes;
		const prevTempEdges = tempEdges;
		tempNodes = [];
		tempEdges = [];

		refItems.forEach(
			(
				refItem: {
					key: string;
					value: JsonValue;
					isReferenceExpanded?: boolean;
					targetNodeId?: string;
				},
				idx: number
			) => {
				const visible = nodeShowsAll || idx < LAYOUT_CONFIG.MAX_DISPLAY_ITEMS;
				const referenceKey = `${parentId}-${refItem.key}`;
				const isRefExpanded = expandedReferences.has(referenceKey) || true; // default expanded
				if (!visible || !isRefExpanded) return;
				const childId: string = refItem.targetNodeId || `node-${++nodeId}`;
				const childPath = parentPath ? `${parentPath}.${refItem.key}` : refItem.key;
				const childJson = getJsonAtPath(jsonData as JsonValue, childPath);
				// Build subtree starting from this child
				createCompactGraph(
					childJson as JsonValue,
					parentId,
					refItem.key,
					0,
					parentPath ? parentPath.split('.') : [],
					true,
					childId
				);
				// Connect parent to child with reference edge
				tempEdges.push({
					id: `edge-${parentId}-${refItem.key}-${childId}`,
					source: parentId,
					sourceHandle: `${parentId}-${refItem.key}`,
					target: childId,
					type: 'bezier',
					animated: false,
					style: 'stroke: #9ca3af; stroke-width: 1'
				} as Edge);
				expandedReferences.add(referenceKey);
			}
		);

		// Merge new nodes/edges
		if (tempNodes.length > 0) {
			const existing = new Set(nodes.map((n) => n.id));
			nodes = [...nodes, ...tempNodes.filter((n) => !existing.has(n.id))];
			edges = [...edges, ...tempEdges];
		}

		// Restore temp arrays
		tempNodes = prevTempNodes;
		tempEdges = prevTempEdges;

		scheduleReflow();
	}

	function expandAll(nodeId: string) {
		// Find all descendant nodes and expand them
		const toExpand = [nodeId];
		const visited = new Set<string>();

		while (toExpand.length > 0) {
			const current = toExpand.pop()!;
			if (visited.has(current)) continue;

			visited.add(current);
			expandedNodes.add(current);

			// Find children from temp edges
			const children = tempEdges.filter((e) => e.source === current).map((e) => e.target);
			toExpand.push(...children);
		}

		regenerateGraph();
	}

	function createCompactGraph(
		data: JsonValue | null | undefined,
		parentId: string | null = null,
		key: string = 'root',
		level = 0,
		path: string[] = [],
		isFromReference = false,
		preGeneratedNodeId?: string
	) {
		const currentNodeId = preGeneratedNodeId || `node-${nodeId++}`;
		// On first load, expand all nodes
		const isExpanded = isFirstLoad ? true : expandedNodes.has(currentNodeId);
		if (isFirstLoad && !expandedNodes.has(currentNodeId)) {
			expandedNodes.add(currentNodeId);
		}
		const currentPath = key === 'root' ? [] : [...path, key];

		if (data === null || data === undefined) {
			// Leaf node for null/undefined
			const node: Node = {
				id: currentNodeId,
				type: 'compact',
				data: {
					label: `${key} ${data}`,
					items: undefined,
					hasParent: parentId !== null,
					hasChildren: false
				},
				position: { x: 0, y: 0 }, // Position will be calculated by dagre
				sourcePosition: Position.Right,
				targetPosition: Position.Left
			};
			tempNodes.push(node);

			if (parentId && !isFromReference) {
				tempEdges.push({
					id: `edge-${parentId}-${currentNodeId}`,
					source: parentId,
					target: currentNodeId,
					type: 'step',
					animated: false,
					style: 'stroke: #9ca3af; stroke-width: 1'
				});
			}

			return;
		} else if (typeof data === 'object') {
			const isArray = Array.isArray(data);
			const allEntries = isArray
				? data.map((v, i) => [String(i), v] as [string, JsonValue])
				: Object.entries(data);

			// Store total count before limiting
			const totalEntriesCount = allEntries.length;

			// Process all entries (CompactNode will handle display limiting)
			const entries = allEntries;

			// Group primitive values for compact display
			const items: NodeItem[] = [];
			const childObjects: Array<[string, JsonValue, string]> = []; // [key, value, childNodeId]
			const childReferences: Array<{
				key: string;
				isArray: boolean;
				count: number;
				targetNodeId: string;
			}> = [];

			// Pre-generate child node IDs with proper global counter management
			const childNodeIds = new Map<string, string>();
			entries.forEach(([k, v]) => {
				if (v !== null && v !== undefined && typeof v === 'object') {
					nodeId++;
					childNodeIds.set(k, `node-${nodeId}`);
				}
			});

			entries.forEach(([k, v]) => {
				const itemPath = [...currentPath, k].join('.');
				if (v === null || v === undefined) {
					items.push({ key: k, value: String(v), type: 'null', path: itemPath });
				} else if (typeof v === 'object') {
					const childNodeId = childNodeIds.get(k)!;
					childObjects.push([k, v, childNodeId]);
					// Add reference to child object/array in parent node
					if (Array.isArray(v)) {
						childReferences.push({
							key: k,
							isArray: true,
							count: v.length,
							targetNodeId: childNodeId
						});
					} else {
						childReferences.push({
							key: k,
							isArray: false,
							count: Object.keys(v).length,
							targetNodeId: childNodeId
						});
					}
				} else {
					// Map typeof results to our supported types
					let itemType: 'string' | 'number' | 'boolean' | 'null' | 'undefined' = 'string';
					let displayValue = String(v);

					if (typeof v === 'string') {
						itemType = 'string';
					} else if (typeof v === 'number') {
						itemType = 'number';
						// Preserve float format if original JSON string is provided
						if (jsonString) {
							displayValue = getOriginalNumberFormat(jsonString, itemPath, v) || String(v);
						}
					} else if (typeof v === 'boolean') {
						itemType = 'boolean';
					} else if (v === null) {
						itemType = 'null';
					} else if (v === undefined) {
						itemType = 'undefined';
					}

					items.push({ key: k, value: displayValue, type: itemType, path: itemPath });
				}
			});

			// Combine primitive items and child references
			const allItems: NodeItem[] = [...items];
			childReferences.forEach((ref) => {
				const referenceKey = `${currentNodeId}-${ref.key}`;
				const isRefExpanded = isFirstLoad ? true : expandedReferences.has(referenceKey);
				if (isFirstLoad && !expandedReferences.has(referenceKey)) {
					expandedReferences.add(referenceKey);
				}
				allItems.push({
					key: ref.key,
					value: ref.isArray ? `[${ref.count}]` : `{${ref.count}}`,
					type: 'reference',
					path: [...currentPath, ref.key].join('.'),
					targetNodeId: ref.targetNodeId,
					isReferenceExpanded: isRefExpanded
				});
			});

			// Create the main node

			// Store callbacks separately to avoid reactivity issues
			// Always set callbacks for arrays/objects regardless of content
			nodeCallbacks.set(currentNodeId, {
				toggle: () => toggleNode(currentNodeId),
				expandAll: () => expandAll(currentNodeId)
			});

			// Disable general children handle since we use individual reference handles
			const hasChildren = false; // Changed from: level > 0 && childObjects.length > 0
			const hasParent = parentId !== null;

			const node: Node = {
				id: currentNodeId,
				type: 'compact',
				data: {
					label: key,
					// Set items based on expansion state at initial load
					items: isExpanded ? allItems : allItems.filter((item) => item.type === 'reference'),
					allItems: allItems, // Always store all items for height calculation
					isExpanded,
					isArray,
					nodeId: currentNodeId,
					hasToggle: true, // Always true for arrays/objects regardless of content
					hasExpandAll: childObjects.length > 0,
					path: currentPath.join('.'),
					hasChildren,
					hasParent,
					totalCount: totalEntriesCount
				},
				position: { x: 0, y: 0 }, // Position will be calculated by dagre
				sourcePosition: Position.Right,
				targetPosition: Position.Left,
				style: 'width: auto; height: auto'
			};

			tempNodes.push(node);

			if (parentId && !isFromReference) {
				// Only create edge if not coming from a reference
				tempEdges.push({
					id: `edge-${parentId}-${currentNodeId}`,
					source: parentId,
					target: currentNodeId,
					type: 'step',
					animated: false,
					style: 'stroke: #9ca3af; stroke-width: 1'
				});
			}
			// Height calculation removed - dagre will handle positioning

			// Create child object nodes
			if (isExpanded) {
				// Check if parent node shows all items or uses "Show more"
				// On first load, don't show all items by default (respect MAX_DISPLAY_ITEMS)
				const nodeShowsAll = showAllItemsNodes.has(currentNodeId);

				// Show children when expanded
				childObjects.forEach(([k, v, childNodeId]) => {
					const referenceKey = `${currentNodeId}-${k}`;
					const isReferenceExpanded = isFirstLoad ? true : expandedReferences.has(referenceKey);
					if (isFirstLoad && !expandedReferences.has(referenceKey)) {
						expandedReferences.add(referenceKey);
					}

					// Check if this reference item is visible in the parent node
					const referenceIndex = allItems.findIndex(
						(item) => item.key === k && item.type === 'reference'
					);
					const isReferenceVisible =
						nodeShowsAll || referenceIndex < LAYOUT_CONFIG.MAX_DISPLAY_ITEMS;

					// Only create child node if reference is expanded AND visible
					if (isReferenceExpanded && isReferenceVisible) {
						// Create child graph using the pre-generated child node ID
						// Pass isFromReference=true to prevent duplicate edge creation
						createCompactGraph(v, currentNodeId, k, level + 1, currentPath, true, childNodeId);

						// Create edge from parent reference to child node
						if (referenceIndex !== -1) {
							tempEdges.push({
								id: `edge-${currentNodeId}-${k}-${childNodeId}`,
								source: currentNodeId,
								sourceHandle: `${currentNodeId}-${k}`,
								target: childNodeId,
								type: 'bezier',
								animated: false,
								style: 'stroke: #9ca3af; stroke-width: 1'
							});
						}
						// Spacing handled by dagre
					}
				});
			}

			return;
		} else {
			// Primitive value as standalone node
			const node: Node = {
				id: currentNodeId,
				type: 'compact',
				data: {
					label: `${key} ${data}`,
					items: undefined,
					hasParent: parentId !== null,
					hasChildren: false
				},
				position: { x: 0, y: 0 }, // Position will be calculated by dagre
				sourcePosition: Position.Right,
				targetPosition: Position.Left
			};
			tempNodes.push(node);

			if (parentId && !isFromReference) {
				tempEdges.push({
					id: `edge-${parentId}-${currentNodeId}`,
					source: parentId,
					target: currentNodeId,
					type: 'step',
					animated: false,
					style: 'stroke: #9ca3af; stroke-width: 1'
				});
			}

			return;
		}
	}

	function layoutNodesWithDagre() {
		logger.debug('[layoutNodesWithDagre] Starting layout with dagre');
		logger.debug('[layoutNodesWithDagre] Current measured heights count: ' + measuredHeights.size);

		// Use dagre settings from LAYOUT_CONFIG
		dagreGraph.setGraph({
			rankdir: LAYOUT_CONFIG.DAGRE.RANK_DIR,
			nodesep: LAYOUT_CONFIG.DAGRE.NODE_SEP,
			ranksep: LAYOUT_CONFIG.DAGRE.RANK_SEP,
			edgesep: LAYOUT_CONFIG.DAGRE.EDGE_SEP,
			ranker: LAYOUT_CONFIG.DAGRE.RANKER,
			align: LAYOUT_CONFIG.DAGRE.ALIGN,
			marginx: LAYOUT_CONFIG.DAGRE.MARGIN_X,
			marginy: LAYOUT_CONFIG.DAGRE.MARGIN_Y
		});

		dagreGraph.nodes().forEach((n) => dagreGraph.removeNode(n));

		const LARGE_GRAPH_THRESHOLD = 200;
		const DEBUG_SAMPLE_LIMIT = 5;
		const logNodeDetails = tempNodes.length <= LARGE_GRAPH_THRESHOLD;
		let loggedNodeDetails = 0;
		tempNodes.forEach((node) => {
			let nodeHeight;
			const nodeWidth = LAYOUT_CONFIG.NODE_WIDTH;

			// Always use measured height first, fallback to initial value
			const measuredHeight = measuredHeights.get(node.id);
			if (measuredHeight) {
				nodeHeight = measuredHeight;
			} else {
				// Use estimated value (close to actual) to avoid second layout in most cases
				nodeHeight = estimateNodeHeight(node);
			}

			// Set node in dagre - pass only actual height
			dagreGraph.setNode(node.id, {
				width: nodeWidth,
				height: nodeHeight // Pass only actual height, margins handled by nodesep
			});

			if (logNodeDetails && loggedNodeDetails < DEBUG_SAMPLE_LIMIT) {
				const allItemCount = node.data.allItems?.length || 0;
				const displayItemCount = node.data.items?.length || 0;
				logger.debug(
					`[layoutNodesWithDagre] Node ${node.id} (${node.data.label}): height=${nodeHeight}px (${measuredHeight ? 'measured' : 'estimated'}), expanded=${node.data.isExpanded}, displayItems=${displayItemCount}, allItems=${allItemCount}`
				);
				loggedNodeDetails++;
			}
		});

		if (!logNodeDetails) {
			logger.debug(
				`[layoutNodesWithDagre] Nodes=${tempNodes.length}, edges=${tempEdges.length}. Details suppressed (>200).`
			);
		} else if (loggedNodeDetails < tempNodes.length) {
			const omitted = tempNodes.length - loggedNodeDetails;
			if (omitted > 0) logger.debug(`[layoutNodesWithDagre] ...and ${omitted} more nodes.`);
		}

		tempEdges.forEach((edge) => {
			dagreGraph.setEdge(edge.source, edge.target);
		});

		dagre.layout(dagreGraph);
		logger.debug('[layoutNodesWithDagre] Dagre layout complete');

		// Center alignment and position adjustment
		tempNodes = tempNodes.map((node) => {
			const nodeWithPosition = dagreGraph.node(node.id);
			if (nodeWithPosition) {
				return {
					...node,
					// SvelteFlow uses nodeOrigin [0.5, 0.5] so positions are centers
					position: {
						x: nodeWithPosition.x,
						y: nodeWithPosition.y
					},
					sourcePosition: Position.Right,
					targetPosition: Position.Left
				};
			}
			return node;
		});

		// Post-process to fix overlapping nodes
		// Group nodes by x position with tolerance
		const nodesByColumn = new Map<number, Array<{ node: Node; dagreNode: dagre.Node }>>();

		tempNodes.forEach((node) => {
			const dagreNode = dagreGraph.node(node.id);
			if (dagreNode) {
				// Find existing group with similar x coordinate
				let foundKey: number | null = null;
				for (const key of nodesByColumn.keys()) {
					if (Math.abs(dagreNode.x - key) <= LAYOUT_CONFIG.OVERLAP.X_TOLERANCE) {
						foundKey = key;
						break;
					}
				}

				if (foundKey !== null) {
					nodesByColumn.get(foundKey)!.push({ node, dagreNode });
				} else {
					nodesByColumn.set(dagreNode.x, [{ node, dagreNode }]);
				}
			}
		});

		// For each column, check for overlaps and adjust
		let overlapAdjustments = 0;
		nodesByColumn.forEach((nodesInColumn) => {
			if (nodesInColumn.length > 1) {
				// Sort by center y (same as dagre output)
				nodesInColumn.sort((a, b) => a.node.position.y - b.node.position.y);

				// Check for overlaps (positions are centers; convert to top/bottom)
				for (let i = 1; i < nodesInColumn.length; i++) {
					const prevNode = nodesInColumn[i - 1];
					const currNode = nodesInColumn[i];

					const prevHalf = prevNode.dagreNode.height / 2;
					const currHalf = currNode.dagreNode.height / 2;

					const prevBottom = prevNode.node.position.y + prevHalf;
					const currTop = currNode.node.position.y - currHalf;

					// Check if there's overlap or insufficient spacing
					const minSpacing = LAYOUT_CONFIG.OVERLAP.MIN_SPACING;

					if (currTop < prevBottom + minSpacing) {
						const adjustment = prevBottom + minSpacing - currTop;
						currNode.node.position.y += adjustment;
						overlapAdjustments++;

						// Move subsequent nodes as well
						for (let j = i + 1; j < nodesInColumn.length; j++) {
							nodesInColumn[j].node.position.y += adjustment;
						}
					}
				}
			}
		});

		if (overlapAdjustments > 0) {
			logger.debug(`[layoutNodesWithDagre] Adjusted ${overlapAdjustments} overlapping nodes`);
		}
	}

	function regenerateGraph() {
		if (regenTimer) clearTimeout(regenTimer);
		regenTimer = window.setTimeout(() => {
			regenTimer = null;
			_regenerateGraphNow();
		}, 150);
	}

	async function _regenerateGraphNow() {
		logger.debug('[regenerateGraph] Starting graph regeneration');
		// Ensure overlay is painted before heavy work
		graphLoading.set({ active: true, phase: 'build', progress: 0 });
		// Start a gentle fake progress so the user sees movement during synchronous pre-processing
		if (fakeProgressTimer) {
			clearInterval(fakeProgressTimer);
		}
		fakeProgressTimer = window.setInterval(() => {
			let p = 0;
			graphLoading.update((s) => {
				p = Math.min(0.3, (s.progress || 0) + 0.02);
				return { active: true, phase: 'build', progress: p };
			});
			if (p >= 0.3 && fakeProgressTimer) {
				clearInterval(fakeProgressTimer);
				fakeProgressTimer = null;
			}
		}, 150);
		await tick();
		await new Promise((r) => requestAnimationFrame(() => r(null)));
		tempNodes = [];
		tempEdges = [];
		nodeId = 0;
		nodeCallbacks.clear();

		if (jsonData) {
			try {
				const data = typeof jsonData === 'string' ? JSON.parse(jsonData) : jsonData;

				createCompactGraph(data, null, 'root', 0, [], false);

				// Set expected node count at initial load
				if (isFirstLoad) {
					expectedNodeCount = tempNodes.length;
					measuredNodeCount = 0;
					initialLoadComplete = false;
					logger.debug(`[regenerateGraph] Initial load: expecting ${expectedNodeCount} nodes`);
					isFirstLoad = false;
				}

				// Prefill estimated heights so first real measurements don't trigger reflow
				tempNodes.forEach((n) => {
					if (!measuredHeights.has(n.id)) {
						measuredHeights.set(n.id, estimateNodeHeight(n));
					}
				});

				// Apply dagre layout (always use worker to enable progress updates)
				logger.debug(
					`{regenerateGraph] Created ${tempNodes.length} nodes, ${tempEdges.length} edges`
				);
				try {
					await performLayoutWithWorker();
				} catch (err) {
					logger.error('Worker layout failed, falling back to main thread:', err);
					layoutNodesWithDagre();
				}

				// items are already properly set in createCompactGraph, no additional filtering needed

				// Update state arrays all at once
				nodes = [...tempNodes];
				edges = [...tempEdges];
				logger.debug(`[regenerateGraph] Graph regeneration complete`);
				graphLoading.set({ active: false, phase: 'idle', progress: 0 });
				if (fakeProgressTimer) {
					clearInterval(fakeProgressTimer);
					fakeProgressTimer = null;
				}
			} catch (e) {
				logger.error('Invalid JSON:', e);
				nodes = [];
				edges = [];
				graphLoading.set({ active: false, phase: 'idle', progress: 0 });
				if (fakeProgressTimer) {
					clearInterval(fakeProgressTimer);
					fakeProgressTimer = null;
				}
			}
		} else {
			nodes = [];
			edges = [];
			graphLoading.set({ active: false, phase: 'idle', progress: 0 });
			if (fakeProgressTimer) {
				clearInterval(fakeProgressTimer);
				fakeProgressTimer = null;
			}
		}
	}

	$effect(() => {
		if (previousJsonData === null) {
			previousJsonData = jsonData;
			regenerateGraph();
			return;
		}
		previousJsonData = jsonData;
		regenerateGraph();
	});

	onMount(() => {
		const handleToggle = (e: CustomEvent) => {
			const nodeId = e.detail;
			const callbacks = nodeCallbacks.get(nodeId);
			if (callbacks) {
				callbacks.toggle();
			}
		};

		const handleExpandAll = (e: CustomEvent) => {
			const nodeId = e.detail;
			const callbacks = nodeCallbacks.get(nodeId);
			if (callbacks) {
				callbacks.expandAll();
			}
		};

		const handleReferenceToggle = (e: CustomEvent) => {
			const referenceKey = e.detail;
			if (expandedReferences.has(referenceKey)) {
				expandedReferences.delete(referenceKey);
			} else {
				expandedReferences.add(referenceKey);
			}
			regenerateGraph();
		};

		const handleShowAllToggle = (e: CustomEvent) => {
			const { nodeId, showAll } = e.detail;
			if (showAll) {
				showAllItemsNodes.add(nodeId);
			} else {
				showAllItemsNodes.delete(nodeId);
			}
			logger.debug(`[handleShowAllToggle] Node ${nodeId} showAll: ${showAll}`);
			// Only height changes; no need to rebuild the graph
			measuredHeights.delete(nodeId);
			scheduleReflow();
		};

		const handleNodeHeightMeasured = (e: CustomEvent) => {
			const { nodeId, actualHeight } = e.detail;
			const previousHeight = measuredHeights.get(nodeId);

			measuredHeights.set(nodeId, actualHeight);

			// Re-layout only when height has changed or measured for the first time
			const diff =
				previousHeight !== undefined ? Math.abs(previousHeight - actualHeight) : Infinity;
			// Only reflow if difference exceeds 1px to avoid redundant second draw
			if (diff > 1) {
				logger.debug(
					`[handleNodeHeightMeasured] Height changed for ${nodeId}: ${previousHeight || 'initial'} -> ${actualHeight}px (diff=${diff})`
				);
				scheduleReflow();
			}

			// Track initial load
			if (!initialLoadComplete && previousHeight === undefined) {
				measuredNodeCount++;
				if (measuredNodeCount >= expectedNodeCount && expectedNodeCount > 0) {
					logger.debug(
						`[handleNodeHeightMeasured] Initial load complete: ${measuredNodeCount} nodes measured`
					);
					initialLoadComplete = true;
				}
			}
		};

		window.addEventListener('nodeToggle', handleToggle as EventListener);
		window.addEventListener('nodeExpandAll', handleExpandAll as EventListener);
		window.addEventListener('referenceToggle', handleReferenceToggle as EventListener);
		window.addEventListener('showAllToggle', handleShowAllToggle as EventListener);
		window.addEventListener('nodeHeightMeasured', handleNodeHeightMeasured as EventListener);

		return () => {
			window.removeEventListener('nodeToggle', handleToggle as EventListener);
			window.removeEventListener('nodeExpandAll', handleExpandAll as EventListener);
			window.removeEventListener('referenceToggle', handleReferenceToggle as EventListener);
			window.removeEventListener('showAllToggle', handleShowAllToggle as EventListener);
			window.removeEventListener('nodeHeightMeasured', handleNodeHeightMeasured as EventListener);
			nodes = [];
			edges = [];
			expandedNodes.clear();
			expandedReferences.clear();
			nodeCallbacks.clear();
			measuredHeights.clear();
			expectedNodeCount = 0;
			measuredNodeCount = 0;
			initialLoadComplete = false;
			isFirstLoad = true;
		};
	});
</script>

<SvelteFlowProvider>
	<div
		class="h-full {className}"
		style="background-color: var(--color-background); position: relative;"
	>
		<SvelteFlow
			{nodes}
			{edges}
			{nodeTypes}
			minZoom={0.3}
			maxZoom={2}
			nodeOrigin={[0.5, 0.5]}
			attributionPosition="bottom-left"
			style="background-color: {mode.current === 'dark' ? '#0a0a0a' : '#fafafa'};"
		>
			<FitViewController {triggerFitView} />
			<Controls />
			<Background variant={'dots' as BackgroundVariant} />
			<MiniMap />
		</SvelteFlow>

		{#if $graphLoading.active}
			<div class="graph-loading-overlay" aria-live="polite" aria-busy="true">
				<div class="spinner"></div>
				<div class="text">Loading</div>
			</div>
		{/if}
	</div>
</SvelteFlowProvider>

<style>
	:global(.svelte-flow) {
		background-color: var(--color-background) !important;
	}

	:global(.svelte-flow__renderer) {
		background-color: transparent;
	}

	:global(.svelte-flow__background) {
		background-color: transparent;
	}

	:global(.svelte-flow__node) {
		font-size: 12px;
		cursor: pointer;
	}

	:global(.svelte-flow__edge-path) {
		stroke: var(--color-muted-foreground);
		stroke-width: 1;
		transition: stroke 0.2s;
		fill: none;
	}

	:global(.svelte-flow__edge:hover .svelte-flow__edge-path) {
		stroke: var(--color-foreground);
		stroke-width: 1.5;
	}

	:global(.svelte-flow__controls) {
		background: var(--color-card);
		border: 1px solid var(--color-border);
		border-radius: 4px;
		box-shadow: 0 1px 3px 0 rgb(0 0 0 / 0.1);
	}

	:global(.svelte-flow__controls-button) {
		background: transparent;
		border: none;
		border-radius: 2px;
		transition: background 0.2s;
		color: var(--color-foreground);
	}

	:global(.svelte-flow__controls-button:hover) {
		background: var(--color-muted);
	}

	:global(.svelte-flow__minimap) {
		background: var(--color-card);
		border: 1px solid var(--color-border);
		border-radius: 4px;
		box-shadow: 0 1px 3px 0 rgb(0 0 0 / 0.1);
		opacity: 0.9;
	}

	:global(.svelte-flow__background) {
		background-color: transparent;
	}

	:global(.svelte-flow__background pattern) {
		stroke: var(--color-border) !important;
	}

	:global(.svelte-flow__handle) {
		background: var(--color-muted-foreground);
		border: 1px solid var(--color-border);
		width: 8px;
		height: 8px;
		transition:
			background-color 0.2s,
			filter 0.2s;
	}

	:global(.svelte-flow__handle:hover) {
		background: var(--color-foreground);
		filter: brightness(1.2);
	}

	:global(.svelte-flow__attribution) {
		display: none;
	}

	.graph-loading-overlay {
		position: absolute;
		top: 0;
		left: 0;
		right: 0;
		bottom: 0;
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 12px;
		background: color-mix(in oklab, var(--color-background) 70%, transparent);
		pointer-events: none;
		z-index: 1000;
	}

	.spinner {
		width: 18px;
		height: 18px;
		border: 2px solid var(--color-border);
		border-top-color: var(--color-foreground);
		border-radius: 50%;
		animation: spin 0.9s linear infinite;
	}

	@keyframes spin {
		from {
			transform: rotate(0deg);
		}
		to {
			transform: rotate(360deg);
		}
	}
</style>
