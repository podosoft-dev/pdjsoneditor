<script lang="ts">
	import { useSvelteFlow } from '@xyflow/svelte';
	import { onMount } from 'svelte';
	
	interface Props {
		triggerFitView: boolean;
	}
	
	const { triggerFitView }: Props = $props();
	const { fitView } = useSvelteFlow();
	
	let hasInitialized = false;
	
	// Standard fitView options to ensure consistency
	const fitViewOptions = { 
		padding: 0.1,
		duration: 300,
		minZoom: 0.3,
		maxZoom: 2
	};
	
	$effect(() => {
		if (triggerFitView && hasInitialized) {
			// Small delay to ensure nodes are properly rendered
			setTimeout(() => {
				fitView(fitViewOptions);
			}, 50);
		}
	});
	
	onMount(() => {
		// Initial fitView with a delay to ensure graph is ready
		setTimeout(() => {
			fitView(fitViewOptions);
			hasInitialized = true;
		}, 200);
	});
</script>

<!-- This component has no visual elements -->