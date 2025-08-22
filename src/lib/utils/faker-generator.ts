import { faker } from '@faker-js/faker';

/**
 * Generate a sample JSON with faker data
 * This creates a realistic data structure with various types (about 30 lines)
 */
export function generateSampleJSON(): unknown {
	return {
		id: faker.string.uuid(),
		user: {
			name: faker.person.fullName(),
			email: faker.internet.email(),
			age: faker.number.int({ min: 18, max: 65 }),
			isActive: faker.datatype.boolean()
		},
		address: {
			street: faker.location.streetAddress(),
			city: faker.location.city(),
			country: faker.location.country(),
			zipCode: faker.location.zipCode()
		},
		products: Array.from({ length: 3 }, () => ({
			id: faker.string.uuid(),
			name: faker.commerce.productName(),
			price: faker.number.float({ min: 10, max: 1000, fractionDigits: 2 }),
			inStock: faker.datatype.boolean()
		})),
		tags: Array.from({ length: 5 }, () => faker.word.adjective()),
		metadata: {
			createdAt: faker.date.past({ years: 1 }).toISOString(),
			updatedAt: faker.date.recent({ days: 7 }).toISOString(),
			version: faker.system.semver()
		},
		settings: {
			theme: faker.helpers.arrayElement(['light', 'dark', 'auto']),
			notifications: faker.datatype.boolean()
		},
		nullValue: null,
		emptyArray: []
	};
}

/**
 * Regenerate JSON values while preserving the structure
 * @param json - The original JSON object
 * @returns A new JSON with the same structure but regenerated values
 */
export function regenerateJSONValues(json: unknown): unknown {
	if (json === null) {
		return faker.helpers.maybe(() => faker.lorem.word(), { probability: 0.5 }) ?? null;
	}

	if (Array.isArray(json)) {
		// Keep array length but regenerate values
		return json.map((item) => regenerateJSONValues(item));
	}

	if (typeof json === 'object' && json !== null) {
		const result: Record<string, unknown> = {};
		for (const [key, value] of Object.entries(json)) {
			result[key] = regenerateJSONValues(value);
		}
		return result;
	}

	// Regenerate primitive values based on type and context
	return generateValueByType(json);
}

/**
 * Generate a new value based on the type and characteristics of the original value
 */
function generateValueByType(value: unknown): unknown {
	// Handle null
	if (value === null) {
		return faker.helpers.maybe(() => faker.lorem.word(), { probability: 0.5 }) ?? null;
	}

	// Handle boolean
	if (typeof value === 'boolean') {
		return faker.datatype.boolean();
	}

	// Handle number
	if (typeof value === 'number') {
		if (Number.isInteger(value)) {
			// Estimate range based on value magnitude
			const magnitude = Math.abs(value);
			if (magnitude <= 100) {
				return faker.number.int({ min: 0, max: 100 });
			} else if (magnitude <= 1000) {
				return faker.number.int({ min: 100, max: 1000 });
			} else if (magnitude <= 10000) {
				return faker.number.int({ min: 1000, max: 10000 });
			} else {
				return faker.number.int({ min: 10000, max: 1000000 });
			}
		} else {
			// Float number
			const magnitude = Math.abs(value);
			if (magnitude <= 1) {
				return faker.number.float({ min: 0, max: 1, fractionDigits: 3 });
			} else if (magnitude <= 100) {
				return faker.number.float({ min: 0, max: 100, fractionDigits: 2 });
			} else {
				return faker.number.float({ min: 100, max: 10000, fractionDigits: 2 });
			}
		}
	}

	// Handle string - try to detect the type of string
	if (typeof value === 'string') {
		// UUID pattern
		if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)) {
			return faker.string.uuid();
		}

		// Email pattern
		if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
			return faker.internet.email();
		}

		// URL pattern
		if (/^https?:\/\/.+/.test(value)) {
			// Check if it's an image URL
			if (/\.(jpg|jpeg|png|gif|svg|webp)/i.test(value)) {
				return faker.image.url();
			}
			return faker.internet.url();
		}

		// Date ISO string pattern
		if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(value)) {
			return faker.date.recent({ days: 365 }).toISOString();
		}

		// Phone number pattern
		if (/^[\d\s\-()+ ]+$/.test(value) && value.length >= 10) {
			return faker.phone.number();
		}

		// Zip code pattern
		if (/^\d{5}(-\d{4})?$/.test(value)) {
			return faker.location.zipCode();
		}

		// Currency code pattern (3 uppercase letters)
		if (/^[A-Z]{3}$/.test(value)) {
			return faker.finance.currencyCode();
		}

		// Version pattern
		if (/^\d+\.\d+\.\d+/.test(value)) {
			return faker.system.semver();
		}

		// Status-like strings
		const statusPatterns = [
			'pending',
			'completed',
			'active',
			'inactive',
			'failed',
			'success',
			'processing'
		];
		if (statusPatterns.includes(value.toLowerCase())) {
			return faker.helpers.arrayElement(statusPatterns);
		}

		// Theme-like strings
		if (['light', 'dark', 'auto'].includes(value.toLowerCase())) {
			return faker.helpers.arrayElement(['light', 'dark', 'auto']);
		}

		// Language codes
		if (/^[a-z]{2}(-[A-Z]{2})?$/.test(value)) {
			return faker.helpers.arrayElement(['en', 'ko', 'ja', 'es', 'fr', 'de', 'zh', 'pt']);
		}

		// Names (simple heuristic - capitalize first letter)
		if (value.length < 20 && /^[A-Z][a-z]+(\s[A-Z][a-z]+)?$/.test(value)) {
			return faker.person.fullName();
		}

		// Single word
		if (value.length < 20 && !/\s/.test(value)) {
			return faker.word.noun();
		}

		// Default to lorem text of similar length
		if (value.length < 50) {
			return faker.lorem.words(Math.ceil(value.length / 5));
		} else if (value.length < 200) {
			return faker.lorem.sentence();
		} else {
			return faker.lorem.paragraph();
		}
	}

	// Default case - return the original value
	return value;
}
