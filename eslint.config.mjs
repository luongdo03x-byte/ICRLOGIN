import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/out/**',
      '.worktrees/**',
      '.superpowers/**'
    ]
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.ts', '**/*.tsx'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unused-vars': ['error', {
        argsIgnorePattern: '^_',
        varsIgnorePattern: '^_',
        caughtErrorsIgnorePattern: '^_',
        ignoreRestSiblings: true
      }],
      'no-empty': ['error', { allowEmptyCatch: true }]
    }
  },
  {
    files: ['apps/desktop/src/main/index.ts'],
    rules: {
      'no-control-regex': 'off'
    }
  },
  {
    files: [
      'apps/desktop/src/main/windows-process-inspector.ts',
      'apps/desktop/src/main/windows-process-metrics.ts'
    ],
    rules: {
      'no-useless-escape': 'off'
    }
  },
  {
    files: ['tools/**/*.mjs'],
    languageOptions: {
      globals: {
        process: 'readonly',
        console: 'readonly',
        document: 'readonly'
      }
    }
  }
);
