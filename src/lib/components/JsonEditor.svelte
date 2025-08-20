<script lang="ts">
	import { onMount } from 'svelte';
	import { EditorView, basicSetup } from 'codemirror';
	import { EditorState } from '@codemirror/state';
	import { json } from '@codemirror/lang-json';
	import { syntaxTree } from '@codemirror/language';
	import { oneDark } from '@codemirror/theme-one-dark';
	import { mode } from 'mode-watcher';
	import { logger } from '$lib/logger';

	interface Props {
		value: string;
		class?: string;
	}

	let { value = $bindable(''), class: className = '' }: Props = $props();

	// Build a map of JSON paths to their character positions using CodeMirror's syntax tree
	function buildPathToPositionMap(state: EditorState): Map<string, { start: number; end: number }> {
		const pathMap = new Map<string, { start: number; end: number }>();
		const tree = syntaxTree(state);
		
		// Helper to get text content of a node
		function getNodeText(from: number, to: number): string {
			return state.doc.sliceString(from, to);
		}
		
		// Recursive function to traverse with path context
		function traverse(cursor: any, path: string[] = []) {
			do {
				const nodeName = cursor.name;
				
				if (nodeName === 'Property') {
					// Handle object properties
					let propertyKey = '';
					let valueStart = -1;
					let valueEnd = -1;
					let valueType = '';
					
					if (cursor.firstChild()) {
						// Get property name
						if (cursor.name === 'PropertyName') {
							const keyText = getNodeText(cursor.from, cursor.to);
							propertyKey = keyText.replace(/^"|"$/g, '');
						}
						
						// Skip to value (past the colon)
						while (cursor.nextSibling()) {
							if (cursor.name !== ':') {
								valueStart = cursor.from;
								valueEnd = cursor.to;
								valueType = cursor.name;
								break;
							}
						}
						
						// Store the path and position
						if (propertyKey && valueStart !== -1) {
							const valuePath = [...path, propertyKey];
							const pathStr = valuePath.join('.');
							
							if (pathStr) {
								pathMap.set(pathStr, { start: valueStart, end: valueEnd });
							}
							
							// If value is an array, handle array elements specially
							if (valueType === 'Array') {
								if (cursor.firstChild()) {
									// We're now inside the array, process its elements
									let index = 0;
									do {
										if (cursor.name === 'Object') {
											const elementPath = [...valuePath, index.toString()];
											const elementPathStr = elementPath.join('.');
											
											if (elementPathStr) {
												pathMap.set(elementPathStr, { start: cursor.from, end: cursor.to });
											}
											
											// Traverse into the object
											if (cursor.firstChild()) {
												traverse(cursor, elementPath);
												cursor.parent();
											}
											
											index++;
										} else if (cursor.name === 'Array') {
											const elementPath = [...valuePath, index.toString()];
											const elementPathStr = elementPath.join('.');
											
											if (elementPathStr) {
												pathMap.set(elementPathStr, { start: cursor.from, end: cursor.to });
											}
											
											// Recursive array
											if (cursor.firstChild()) {
												traverse(cursor, elementPath);
												cursor.parent();
											}
											
											index++;
										} else if (cursor.name !== '[' && cursor.name !== ']' && cursor.name !== ',' && cursor.name !== '⚠') {
											// Primitive values in array
											const elementPath = [...valuePath, index.toString()];
											const elementPathStr = elementPath.join('.');
											
											if (elementPathStr) {
												pathMap.set(elementPathStr, { start: cursor.from, end: cursor.to });
											}
											
											index++;
										}
									} while (cursor.nextSibling());
									cursor.parent();
								}
							} else if (valueType === 'Object') {
								// If value is an object, traverse it normally
								if (cursor.firstChild()) {
									traverse(cursor, valuePath);
									cursor.parent();
								}
							}
						}
						
						cursor.parent();
					}
				} else if (nodeName === 'Array') {
					// Handle array elements
					let index = 0;
					if (cursor.firstChild()) {
						do {
							// Only process actual elements (skip syntax tokens)
							if (cursor.name === 'Object') {
								// For object elements, store the indexed path and traverse
								const elementPath = [...path, index.toString()];
								const pathStr = elementPath.join('.');
								
								// Store the position of this array element
								if (pathStr) {
									pathMap.set(pathStr, { start: cursor.from, end: cursor.to });
								}
								
								// Traverse into the object to get its properties
								if (cursor.firstChild()) {
									traverse(cursor, elementPath);
									cursor.parent();
								}
								
								index++;
							} else if (cursor.name === 'Array') {
								// For nested arrays
								const elementPath = [...path, index.toString()];
								const pathStr = elementPath.join('.');
								
								if (pathStr) {
									pathMap.set(pathStr, { start: cursor.from, end: cursor.to });
								}
								
								// Traverse into the nested array
								if (cursor.firstChild()) {
									traverse(cursor, elementPath);
									cursor.parent();
								}
								
								index++;
							} else if (cursor.name !== '[' && cursor.name !== ']' && cursor.name !== ',' && cursor.name !== '⚠') {
								// For primitive values
								const elementPath = [...path, index.toString()];
								const pathStr = elementPath.join('.');
								
								if (pathStr) {
									pathMap.set(pathStr, { start: cursor.from, end: cursor.to });
								}
								
								index++;
							}
						} while (cursor.nextSibling());
						cursor.parent();
					}
				} else if (nodeName === 'Object' && path.length > 0) {
					// For nested objects in arrays, traverse their properties
					if (cursor.firstChild()) {
						traverse(cursor, path);
						cursor.parent();
					}
				} else if (nodeName === 'JsonText') {
					// Root of JSON document
					if (cursor.firstChild()) {
						// Root can be object or array
						if (cursor.name === 'Object' || cursor.name === 'Array') {
							if (cursor.firstChild()) {
								traverse(cursor, []);
								cursor.parent();
							}
						}
						cursor.parent();
					}
				}
			} while (cursor.nextSibling());
		}
		
		// Start traversal
		const cursor = tree.cursor();
		traverse(cursor);
		
		return pathMap;
	}

	export function navigateToPath(path: string) {
		if (!view) return;

		try {
			// Build the path to position map using syntax tree
			const pathMap = buildPathToPositionMap(view.state);
			
			// Look up the position for this path
			const position = pathMap.get(path);
			
			if (position) {
				// Navigate to the found position
				view.dispatch({
					selection: { anchor: position.start, head: position.end },
					scrollIntoView: true
				});
				view.focus();
				logger.debug(`[JsonEditor] Navigated to path: ${path} at position ${position.start}-${position.end}`);
			} else {
				logger.warn(`[JsonEditor] Path not found: ${path}`);
			}
		} catch (e) {
			logger.error('Failed to navigate to path:', e);
		}
	}

	let editorElement: HTMLDivElement;
	let view: EditorView;
	let skipNextUpdate = false;

	// Create editor extensions
	const createExtensions = () => {
		const extensions = [
			basicSetup,
			json(),
			EditorView.updateListener.of((update) => {
				if (update.docChanged && !skipNextUpdate) {
					// console.log('[Editor] Doc changed, updating value');
					value = update.state.doc.toString();
				}
			}),
			EditorView.theme({
				'&': {
					height: '100%',
					display: 'flex',
					flexDirection: 'column'
				},
				'.cm-scroller': {
					overflow: 'auto',
					flex: '1',
					minHeight: '0'
				},
				'.cm-content': {
					fontSize: '14px',
					lineHeight: '1.6',
					minHeight: '100%'
				},
				'.cm-gutters': {
					minHeight: '100%'
				}
			})
		];

		// Add dark theme only in dark mode
		if (mode.current === 'dark') {
			extensions.splice(2, 0, oneDark);
		}

		return extensions;
	};

	onMount(() => {
		const state = EditorState.create({
			doc: value,
			extensions: createExtensions()
		});

		view = new EditorView({
			state,
			parent: editorElement
		});

		return () => {
			view.destroy();
		};
	});

	// Track value changes and update editor
	$effect(() => {
		const currentValue = value;

		if (!view) return;

		const editorContent = view.state.doc.toString();

		// Only update if value actually differs from editor content
		if (currentValue !== editorContent) {
			// console.log('[Effect] Updating editor with new value');
			skipNextUpdate = true;
			view.dispatch({
				changes: {
					from: 0,
					to: view.state.doc.length,
					insert: currentValue
				}
			});
			// Reset flag after a microtask
			queueMicrotask(() => {
				skipNextUpdate = false;
			});
		}
	});

	// Recreate editor when mode changes
	$effect(() => {
		if (!editorElement || !view) return;

		// Track mode changes
		const currentMode = mode.current;

		return () => {
			// This cleanup runs when mode changes
			if (view && mode.current !== currentMode) {
				const currentContent = view.state.doc.toString();
				const state = EditorState.create({
					doc: currentContent,
					extensions: createExtensions()
				});
				view.setState(state);
			}
		};
	});
</script>

<div
	bind:this={editorElement}
	class="{className} overflow-hidden"
	style="display: flex; flex-direction: column;"
></div>
