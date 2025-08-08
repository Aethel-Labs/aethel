import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default [
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/build/**',
      '**/.next/**',
      '**/coverage/**',
      '**/*.min.js',
      '**/logs/**',
    ],
  },

  js.configs.recommended,
  ...tseslint.configs.recommended,

  {
    files: ['**/*.{js,mjs,cjs,ts,mts,cts,tsx}'],
    languageOptions: {
      globals: {
        ...globals.node,
        ...globals.es2022,
      },
      ecmaVersion: 2022,
      sourceType: 'module',
    },
    rules: {
      'no-console': 'off',
      'no-debugger': 'error',
      'no-alert': 'error',
      'no-eval': 'error',
      'no-implied-eval': 'error',

      eqeqeq: ['error', 'always'],
      curly: ['warn', 'multi-line'],
      'no-else-return': 'warn',
      'no-empty-function': 'warn',
      'no-return-assign': 'error',
      'no-throw-literal': 'error',

      'no-unreachable': 'error',
      'no-unused-expressions': 'error',
      'no-useless-return': 'warn',

      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
          destructuredArrayIgnorePattern: '^_',
        },
      ],
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/explicit-function-return-type': 'off',
      '@typescript-eslint/explicit-module-boundary-types': 'off',
      '@typescript-eslint/no-inferrable-types': 'warn',
      '@typescript-eslint/no-non-null-assertion': 'off',
      '@typescript-eslint/prefer-for-of': 'error',
      '@typescript-eslint/consistent-type-imports': 'off',

      'no-unused-vars': 'off',
      'no-undef': 'off',
      'no-redeclare': 'off',
      '@typescript-eslint/no-redeclare': 'error',

      'no-process-exit': 'off',
      'no-new-require': 'error',
      'no-path-concat': 'error',
      'no-sync': 'warn',
    },
  },

  {
    files: ['**/*.config.{js,mjs,ts}', '**/eslint.config.mjs', '**/src/index.ts'],
    rules: {
      'no-console': 'off',
      'no-process-exit': 'off',
    },
  },

  {
    files: ['**/*.test.{js,ts}', '**/*.spec.{js,ts}', '**/tests/**/*.{js,ts}'],
    languageOptions: {
      globals: {
        ...globals.jest,
        ...globals.node,
      },
    },
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/explicit-function-return-type': 'off',
    },
  },
];
