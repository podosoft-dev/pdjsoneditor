import js from '@eslint/js';
import typescript from '@typescript-eslint/eslint-plugin';
import typescriptParser from '@typescript-eslint/parser';
import svelte from 'eslint-plugin-svelte';
import svelteParser from 'svelte-eslint-parser';
import prettier from 'eslint-config-prettier';
import globals from 'globals';

export default [
	js.configs.recommended,
	...svelte.configs['flat/recommended'],
	prettier,
	...svelte.configs['flat/prettier'],
	{
		languageOptions: {
			globals: {
				...globals.browser,
				...globals.node
			}
		}
	},
	{
		files: ['**/*.{js,ts,svelte}'],
		languageOptions: {
			parser: typescriptParser,
			parserOptions: {
				ecmaVersion: 2022,
				sourceType: 'module',
				extraFileExtensions: ['.svelte']
			}
		},
		plugins: {
			'@typescript-eslint': typescript
		},
		rules: {
			'@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
			'@typescript-eslint/no-explicit-any': 'warn',
			'no-console': 'off',
			'prefer-const': 'off',
			'no-var': 'error',
			'no-undef': 'off',
			'no-unused-vars': 'off'
		}
	},
	{
		files: ['**/*.svelte'],
		languageOptions: {
			parser: svelteParser,
			parserOptions: {
				parser: typescriptParser
			}
		},
		rules: {
			'svelte/no-at-html-tags': 'off',
			'svelte/valid-compile': ['error', { ignoreWarnings: true }],
			'svelte/require-each-key': 'off',
			'svelte/no-dupe-else-if-blocks': 'off',
			'svelte/prefer-svelte-reactivity': 'off'
		}
	},
	{
		ignores: [
			// Build output
			'.svelte-kit/**',
			'build/**',
			'dist/**',
			'node_modules/**',
			// Test reports
			'playwright-report/**',
			'test-results/**',
			'coverage/**',
			// Config and generated files
			'*.config.js',
			'*.config.ts',
			'.DS_Store',
			'*.min.js',
			// Temporary files
			'*.tmp',
			'*.log',
			'.env',
			'.env.*',
			'!.env.example',
			'vite.config.js.timestamp-*',
			'vite.config.ts.timestamp-*',
			// IDE
			'.vscode/**',
			'.idea/**',
			// Documentation
			'CLAUDE.md',
			'*.md',
			// Generated i18n files
			'src/i18n/i18n-*.ts'
		]
	}
];
