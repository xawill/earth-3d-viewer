import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';
import angular from 'angular-eslint';
import prettierPlugin from 'eslint-plugin-prettier';
import prettierConfig from 'eslint-config-prettier';
import noSecrets from 'eslint-plugin-no-secrets';

export default tseslint.config(
	// Global ignores
	{
		ignores: ['node_modules/**', 'dist/**', 'public/**'],
	},

	// TypeScript + Angular
	{
		files: ['**/*.ts'],
		extends: [
			eslint.configs.recommended,
			...tseslint.configs.recommended,
			...tseslint.configs.stylistic,
			...angular.configs.tsRecommended,
		],
		processor: angular.processInlineTemplates,
		plugins: {
			'no-secrets': noSecrets,
			prettier: prettierPlugin,
		},
		rules: {
			// Security
			'no-secrets/no-secrets': 'warn',

			// Prettier
			'prettier/prettier': 'error',

			// General JS best practices
			'block-scoped-var': 'error',
			eqeqeq: 'warn',
			'no-var': 'warn',
			'prefer-arrow-callback': 'warn',
			'prefer-const': 'warn',
			'no-return-assign': 'warn',
			'no-console': 'warn',
			'no-debugger': 'error',
			'no-restricted-properties': [
				'error',
				{ object: 'describe', property: 'only' },
				{ object: 'it', property: 'only' },
			],

			// TypeScript
			'@typescript-eslint/parameter-properties': [
				'error',
				{
					allow: ['public readonly', 'private readonly', 'protected readonly'],
				},
			],
			'@typescript-eslint/consistent-type-assertions': [
				'warn',
				{
					assertionStyle: 'as',
					objectLiteralTypeAssertions: 'never',
				},
			],
			'@typescript-eslint/naming-convention': [
				'warn',
				{
					selector: ['function', 'method'],
					format: ['camelCase'],
					leadingUnderscore: 'allow',
				},
			],
			'@typescript-eslint/no-non-null-assertion': 'off',
			'@typescript-eslint/explicit-function-return-type': 'off',
			'@typescript-eslint/explicit-module-boundary-types': 'off',
			'@typescript-eslint/no-inferrable-types': 'warn',
			'@typescript-eslint/no-empty-function': 'warn',
			'@typescript-eslint/member-ordering': [
				'error',
				{
					default: [
						// Signatures
						'signature',
						'call-signature',

						// Static fields
						'public-static-field',
						'protected-static-field',
						'private-static-field',

						// Decorated fields (@Input, @Output, @ViewChild, etc.)
						'public-decorated-field',
						'protected-decorated-field',
						'private-decorated-field',

						// Instance fields (signal inputs/outputs, computed, regular fields)
						'public-instance-field',
						'protected-instance-field',
						'private-instance-field',

						// Constructor
						'constructor',

						// Decorated methods (@HostListener)
						'public-decorated-method',
						'protected-decorated-method',
						'private-decorated-method',

						// Accessors
						'public-static-get',
						'protected-static-get',
						'private-static-get',
						'public-static-set',
						'protected-static-set',
						'private-static-set',
						'public-instance-get',
						'protected-instance-get',
						'private-instance-get',
						'public-instance-set',
						'protected-instance-set',
						'private-instance-set',

						// Methods (lifecycle hooks are public, then rest)
						'public-instance-method',
						'protected-instance-method',
						'private-instance-method',

						// Static methods
						'public-static-method',
						'protected-static-method',
						'private-static-method',
					],
				},
			],
			'@typescript-eslint/no-explicit-any': 'warn',
			'@typescript-eslint/explicit-member-accessibility': [
				'error',
				{
					accessibility: 'no-public',
				},
			],
			'@typescript-eslint/no-unused-vars': [
				'error',
				{
					argsIgnorePattern: '^_',
					varsIgnorePattern: '^_',
				},
			],

			// Angular
			'@angular-eslint/directive-selector': [
				'error',
				{
					type: 'attribute',
					prefix: 'ce',
					style: 'camelCase',
				},
			],
			'@angular-eslint/component-selector': [
				'error',
				{
					type: 'element',
					prefix: 'ce',
					style: 'kebab-case',
				},
			],
			'@angular-eslint/no-empty-lifecycle-method': 'error',
		},
	},

	// Store files override
	{
		files: ['**/*.store.ts'],
		rules: {
			'@typescript-eslint/member-ordering': 'off',
		},
	},

	// Angular HTML templates
	{
		files: ['**/*.html'],
		extends: [...angular.configs.templateRecommended, ...angular.configs.templateAccessibility],
		plugins: {
			prettier: prettierPlugin,
		},
		rules: {
			'prettier/prettier': 'error',
		},
	},

	// Prettier last (disables conflicting formatting rules)
	prettierConfig
);
