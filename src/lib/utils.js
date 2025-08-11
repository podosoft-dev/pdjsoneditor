import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { tv } from 'tailwind-variants';

export function cn(...inputs) {
	return twMerge(clsx(inputs));
}

export { tv };
