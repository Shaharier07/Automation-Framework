// ESLint flat config — TypeScript framework code (support, pages, steps, utils, config, scripts).
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import globals from 'globals';

export default tseslint.config(
  { ignores: ['node_modules/**', 'reports/**', 'screenshots/**', 'api/**', 'cucumber.js', 'eslint.config.mjs'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.ts'],
    languageOptions: { globals: { ...globals.node } },
    rules: {
      'no-console': 'off',
      eqeqeq: ['error', 'always'],
      'no-var': 'error',
      'prefer-const': 'error',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', caughtErrors: 'none' }],
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-floating-promises': 'off',
    },
  },
  {
    // No fixed sleeps anywhere (skill: wait-and-sync-rules)
    files: ['pages/**/*.ts', 'support/**/*.ts', 'utils/**/*.ts'],
    rules: {
      'no-restricted-syntax': [
        'error',
        { selector: "CallExpression[callee.property.name=/^(waitForTimeout|pause)$/]", message: 'Fixed sleeps are forbidden — wait for a condition (skill: wait-and-sync-rules).' },
        { selector: "NewExpression[callee.name='Promise'] CallExpression[callee.name='setTimeout']", message: 'Fixed sleeps are forbidden — wait for a condition (skill: wait-and-sync-rules).' },
      ],
    },
  },
  {
    // Step definitions must stay thin: no raw selectors, no waits — use page objects.
    files: ['step-definitions/**/*.ts'],
    rules: {
      'no-restricted-syntax': [
        'error',
        { selector: "CallExpression[callee.property.name=/^(locator|\\$|\\$\\$|waitForTimeout|pause)$/]", message: 'Selectors/waits belong in page objects (pages/), not step definitions.' },
      ],
    },
  },
);
