<script lang="ts">
	import Globe from 'lucide-svelte/icons/globe';
	import ChevronDown from 'lucide-svelte/icons/chevron-down';
	import Check from 'lucide-svelte/icons/check';
	import * as DropdownMenu from '$lib/components/ui/dropdown-menu';
	import { locale } from '$lib/stores/locale';
	import { setLocale } from '$i18n/i18n-svelte';
	import LL from '$i18n/i18n-svelte';
	import type { Locales } from '$i18n/i18n-types';

	// Available locales
	const locales: { value: Locales; label: string }[] = [
		{ value: 'en', label: 'English' },
		{ value: 'ko', label: '한국어' }
	];

	// Current locale
	let currentLocale = $state<Locales>('en');

	// Subscribe to locale changes
	$effect(() => {
		const unsubscribe = locale.subscribe((value) => {
			currentLocale = value;
			setLocale(value);
		});

		return () => {
			unsubscribe();
		};
	});

	function handleLocaleChange(newLocale: Locales) {
		locale.set(newLocale);
	}
</script>

<DropdownMenu.Root>
	<DropdownMenu.Trigger
		class="inline-flex items-center justify-center gap-2 rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 border border-input bg-background hover:bg-accent hover:text-accent-foreground h-9 px-3"
	>
		<Globe class="h-4 w-4" />
		<span class="hidden sm:inline">
			{locales.find((l) => l.value === currentLocale)?.label}
		</span>
		<ChevronDown class="h-3 w-3" />
	</DropdownMenu.Trigger>
	<DropdownMenu.Content align="end">
		<DropdownMenu.Label>{$LL.header.language()}</DropdownMenu.Label>
		<DropdownMenu.Separator />
		{#each locales as locale}
			<DropdownMenu.Item
				onclick={() => handleLocaleChange(locale.value)}
				class="flex items-center justify-between"
			>
				<span>{locale.label}</span>
				{#if currentLocale === locale.value}
					<Check class="h-4 w-4" />
				{/if}
			</DropdownMenu.Item>
		{/each}
	</DropdownMenu.Content>
</DropdownMenu.Root>
