<script lang="ts">
	import { onMount } from 'svelte';
	import { EditorView, basicSetup } from 'codemirror';
	import { EditorState } from '@codemirror/state';
	import { json } from '@codemirror/lang-json';
	import { oneDark } from '@codemirror/theme-one-dark';
	import { mode } from 'mode-watcher';
	import { logger } from '$lib/logger';

	interface Props {
		value: string;
		class?: string;
	}

	let { value = $bindable(''), class: className = '' }: Props = $props();

	export function navigateToPath(path: string) {
		if (!view) return;

		const doc = view.state.doc;
		const text = doc.toString();

		try {
			JSON.parse(text); // Validate JSON
			const pathParts = path.split('.');
			let line = 1;

			// Simple line counting - find the line containing the path
			const lines = text.split('\n');
			for (let i = 0; i < lines.length; i++) {
				if (pathParts.length > 0 && lines[i].includes(`"${pathParts[pathParts.length - 1]}"`)) {
					line = i + 1;
					break;
				}
			}

			// Scroll to line
			const lineInfo = doc.line(line);
			view.dispatch({
				selection: { anchor: lineInfo.from, head: lineInfo.to },
				scrollIntoView: true
			});
			view.focus();
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
