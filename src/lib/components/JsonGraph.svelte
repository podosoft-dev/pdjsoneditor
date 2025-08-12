<script lang="ts">
	import { onMount } from 'svelte';
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
	import type { JsonValue, JsonObject, NodeItem, JsonStructure } from '$lib/types/json';

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

	// Helper function to extract JSON structure (keys only, not values)
	function getJsonStructure(obj: JsonValue | null | undefined): JsonStructure | string | null {
		if (obj === null || obj === undefined) return null;
		if (typeof obj !== 'object') return typeof obj;

		if (Array.isArray(obj)) {
			// For arrays, track length and structure of first element
			return {
				_type: 'array',
				_length: obj.length,
				_sample: obj.length > 0 ? getJsonStructure(obj[0]) : null
			};
		}

		// For objects, track keys and their structures
		const structure: JsonStructure = { _type: 'object' };
		for (const key in obj) {
			structure[key] = getJsonStructure((obj as JsonObject)[key]);
		}
		return structure;
	}

	// Compare two JSON structures to detect structural changes
	function hasStructuralChange(
		oldStruct: JsonStructure | string | null,
		newStruct: JsonStructure | string | null
	): boolean {
		if (oldStruct === newStruct) return false;
		if (oldStruct === null || newStruct === null) return true;
		if (typeof oldStruct !== typeof newStruct) return true;

		if (typeof oldStruct === 'string') {
			return oldStruct !== newStruct; // Type change
		}

		if (
			typeof oldStruct === 'object' &&
			typeof newStruct === 'object' &&
			oldStruct._type === 'array' &&
			newStruct._type === 'array'
		) {
			// Consider it structural if array length changes significantly (more than 20% or by more than 10 items)
			const oldLength = oldStruct._length ?? 0;
			const newLength = newStruct._length ?? 0;
			const lengthDiff = Math.abs(oldLength - newLength);
			const percentChange = lengthDiff / Math.max(oldLength, 1);
			if (lengthDiff > 10 || percentChange > 0.2) return true;

			// Check sample structure
			return hasStructuralChange(oldStruct._sample ?? null, newStruct._sample ?? null);
		}

		if (
			typeof oldStruct === 'object' &&
			typeof newStruct === 'object' &&
			oldStruct._type === 'object' &&
			newStruct._type === 'object'
		) {
			// Check if keys are different
			const oldKeys = Object.keys(oldStruct).filter((k) => k !== '_type');
			const newKeys = Object.keys(newStruct).filter((k) => k !== '_type');

			if (oldKeys.length !== newKeys.length) return true;

			for (const key of oldKeys) {
				if (!newKeys.includes(key)) return true;
				const oldValue = oldStruct[key] ?? null;
				const newValue = newStruct[key] ?? null;
				if (
					hasStructuralChange(
						oldValue as JsonStructure | string | null,
						newValue as JsonStructure | string | null
					)
				)
					return true;
			}
		}

		return false;
	}
	const measuredHeights = new Map<string, number>(); // Store actual measured heights
	// --- dynamic reflow when heights change ---
	let reflowScheduled = false;
	let expectedNodeCount = 0; // Number of nodes created at initial load
	let measuredNodeCount = 0; // Number of nodes measured
	let initialLoadComplete = false;

	function scheduleReflow() {
		if (reflowScheduled) {
			console.log('[scheduleReflow] Already scheduled, skipping');
			return;
		}
		reflowScheduled = true;
		console.log('[scheduleReflow] Scheduling reflow');
		requestAnimationFrame(() => {
			reflowScheduled = false;
			console.log('[scheduleReflow] Executing reflow');
			reflowWithMeasuredHeights();
		});
	}

	function reflowWithMeasuredHeights() {
		if (!nodes || nodes.length === 0) {
			console.log('[reflowWithMeasuredHeights] No nodes to reflow');
			return;
		}

		console.log('[reflowWithMeasuredHeights] Starting reflow with', nodes.length, 'nodes');
		console.log('[reflowWithMeasuredHeights] Measured heights:', [...measuredHeights.entries()]);

		// Clone current state and re-run dagre using measured heights
		tempNodes = nodes.map((n) => ({ ...n }));
		tempEdges = edges.map((e) => ({ ...e }));

		layoutNodesWithDagre();

		// Keep current display state; only positions are updated
		nodes = [...tempNodes];
		edges = [...tempEdges];
		console.log('[reflowWithMeasuredHeights] Reflow complete');
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
		INITIAL_HEIGHT: 100, // Initial height before measurement

		// dagre layout settings
		DAGRE: {
			RANK_DIR: 'LR',
			NODE_SEP: 20, // LR mode: vertical spacing between nodes at same x coordinate
			RANK_SEP: 50, // LR mode: horizontal spacing between levels
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

	// Initial node height (used until actual measurements arrive)
	function getInitialNodeHeight(): number {
		return LAYOUT_CONFIG.INITIAL_HEIGHT;
	}

	function toggleNode(nodeId: string) {
		const wasExpanded = expandedNodes.has(nodeId);
		if (wasExpanded) {
			expandedNodes.delete(nodeId);
			console.log(`[toggleNode] Collapsed node: ${nodeId}`);
		} else {
			expandedNodes.add(nodeId);
			console.log(`[toggleNode] Expanded node: ${nodeId}`);
		}
		console.log(`[toggleNode] Current expanded nodes:`, [...expandedNodes]);
		// Force complete regeneration of the graph
		regenerateGraph();
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
		console.log('[layoutNodesWithDagre] Starting layout with dagre');
		console.log('[layoutNodesWithDagre] Current measured heights:', [...measuredHeights.entries()]);

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

		tempNodes.forEach((node) => {
			let nodeHeight;
			const nodeWidth = LAYOUT_CONFIG.NODE_WIDTH;

			// Always use measured height first, fallback to initial value
			const measuredHeight = measuredHeights.get(node.id);
			if (measuredHeight) {
				nodeHeight = measuredHeight;
			} else {
				// Use initial value if no measurement (will be replaced soon)
				nodeHeight = getInitialNodeHeight();
			}

			// Set node in dagre - pass only actual height
			dagreGraph.setNode(node.id, {
				width: nodeWidth,
				height: nodeHeight // Pass only actual height, margins handled by nodesep
			});

			// Debug log
			const allItemCount = node.data.allItems?.length || 0;
			const displayItemCount = node.data.items?.length || 0;
			console.log(
				`[layoutNodesWithDagre] Node ${node.id} (${node.data.label}): height=${nodeHeight}px (${measuredHeight ? 'measured' : 'initial'}), expanded=${node.data.isExpanded}, displayItems=${displayItemCount}, allItems=${allItemCount}`
			);
		});

		tempEdges.forEach((edge) => {
			dagreGraph.setEdge(edge.source, edge.target);
		});

		dagre.layout(dagreGraph);
		console.log('[layoutNodesWithDagre] Dagre layout complete');

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
			console.log(`[layoutNodesWithDagre] Adjusted ${overlapAdjustments} overlapping nodes`);
		}
	}

	function regenerateGraph() {
		console.log('[regenerateGraph] Starting graph regeneration');
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
					console.log(`[regenerateGraph] Initial load: expecting ${expectedNodeCount} nodes`);
					isFirstLoad = false;
				}

				// Apply dagre layout
				console.log(
					`[regenerateGraph] Created ${tempNodes.length} nodes, ${tempEdges.length} edges`
				);
				layoutNodesWithDagre();

				// items are already properly set in createCompactGraph, no additional filtering needed

				// Update state arrays all at once
				nodes = [...tempNodes];
				edges = [...tempEdges];
				console.log(`[regenerateGraph] Graph regeneration complete`);
			} catch (e) {
				console.error('Invalid JSON:', e);
				nodes = [];
				edges = [];
			}
		} else {
			nodes = [];
			edges = [];
		}
	}

	$effect(() => {
		// Check if jsonData has changed
		if (previousJsonData === null) {
			// Initial load
			previousJsonData = jsonData;
			regenerateGraph();
			return;
		}

		// First check if the entire JSON is completely different (like URL fetch or paste)
		const jsonString = JSON.stringify(jsonData);
		const previousString = JSON.stringify(previousJsonData);

		if (jsonString === previousString) {
			// No change at all
			return;
		}

		// Check for structural changes
		const oldStructure = getJsonStructure(previousJsonData);
		const newStructure = getJsonStructure(jsonData);
		const isStructuralChange = hasStructuralChange(oldStructure, newStructure);

		// Also consider it a major change if the root keys are completely different
		// For arrays, check if one is array and other is not
		const oldIsArray = Array.isArray(previousJsonData);
		const newIsArray = Array.isArray(jsonData);

		let rootKeysChanged = false;
		if (oldIsArray !== newIsArray) {
			// Type change between array and object
			rootKeysChanged = true;
		} else if (!oldIsArray && !newIsArray) {
			// Both are objects, compare keys
			const oldRootKeys =
				previousJsonData && typeof previousJsonData === 'object'
					? Object.keys(previousJsonData).sort().join(',')
					: '';
			const newRootKeys =
				jsonData && typeof jsonData === 'object' ? Object.keys(jsonData).sort().join(',') : '';
			rootKeysChanged = oldRootKeys !== newRootKeys;
		}

		if (isStructuralChange || rootKeysChanged) {
			// Major structural change - reset all expansion states
			console.log('[JsonGraph] Structural change detected, resetting expansion states');
			expandedNodes.clear();
			expandedReferences.clear();
			showAllItemsNodes.clear();
			isFirstLoad = true;
			previousJsonData = jsonData;
		} else {
			// Only values changed - preserve expansion states
			console.log('[JsonGraph] Value change detected, preserving expansion states');
			previousJsonData = jsonData;
		}

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
			console.log(`[handleShowAllToggle] Node ${nodeId} showAll: ${showAll}`);
			regenerateGraph();
		};

		const handleNodeHeightMeasured = (e: CustomEvent) => {
			const { nodeId, actualHeight } = e.detail;
			const previousHeight = measuredHeights.get(nodeId);

			measuredHeights.set(nodeId, actualHeight);

			// Re-layout only when height has changed or measured for the first time
			if (previousHeight !== actualHeight) {
				console.log(
					`[handleNodeHeightMeasured] Height changed for ${nodeId}: ${previousHeight || 'initial'} -> ${actualHeight}px`
				);
				scheduleReflow();
			}

			// Track initial load
			if (!initialLoadComplete && previousHeight === undefined) {
				measuredNodeCount++;
				if (measuredNodeCount >= expectedNodeCount && expectedNodeCount > 0) {
					console.log(
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
	<div class="h-full {className}" style="background-color: var(--color-background);">
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
</style>
