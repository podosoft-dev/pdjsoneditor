<script lang="ts">
	import '../app.css';
	import favicon from '$lib/assets/favicon.svg';
	import { ModeWatcher } from 'mode-watcher';
	import { Toaster } from '$lib/components/ui/sonner';
	import { onMount } from 'svelte';
	import { loadLocale } from '$i18n/i18n-util.sync';
	import { setLocale } from '$i18n/i18n-svelte';
	import { locale } from '$lib/stores/locale';
	import type { Locales } from '$i18n/i18n-types';

	const { children } = $props();

	// Initialize i18n on mount
	onMount(() => {
		const unsubscribe = locale.subscribe((value) => {
			loadLocale(value);
			setLocale(value);
		});

		// Load initial locale
		const initialLocale = (localStorage.getItem('locale') as Locales) || 'en';
		locale.set(initialLocale);

		return unsubscribe;
	});
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
</svelte:head>

<ModeWatcher />
<Toaster />
{@render children?.()}
