/**
 * ESLint 9 flat config for @irexpro/api.
 *
 * Migrated from the legacy `.eslintrc.js` to the ESLint 9 flat config format.
 * Preserves the EXACT effective lint behavior of the legacy config:
 *   - parser: @typescript-eslint/parser
 *   - parserOptions: project=tsconfig.json, tsconfigRootDir, sourceType=module
 *   - plugins: @typescript-eslint
 *   - extends: @typescript-eslint/recommended + prettier recommended
 *   - env: node + jest (mapped to globals)
 *   - ignorePatterns: .eslintrc.js (migrated to ignores; .eslintrc.js itself
 *     is removed by this migration but kept in ignores for safety)
 *   - rules: interface-name-prefix off, explicit-function-return-type off,
 *     explicit-module-boundary-types off, no-explicit-any warn,
 *     no-unused-vars error (argsIgnorePattern ^_)
 *
 * The `plugin:prettier/recommended` legacy config is reproduced directly in
 * flat config (it is: eslint-config-prettier + eslint-plugin-prettier with
 * the `prettier/prettier` rule set to `error`). This avoids the need for the
 * @eslint/eslintrc FlatCompat compatibility shim.
 */
import js from '@eslint/js';
import tseslint from '@typescript-eslint/eslint-plugin';
import tsParser from '@typescript-eslint/parser';
import prettierConfig from 'eslint-config-prettier';
import prettierPlugin from 'eslint-plugin-prettier';
import globals from 'globals';

export default [
  // Base: @eslint/js recommended
  js.configs.recommended,

  // @typescript-eslint/recommended (flat config variant)
  {
    files: ['**/*.ts'],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        project: 'tsconfig.json',
        tsconfigRootDir: import.meta.dirname,
        sourceType: 'module',
      },
      globals: {
        ...globals.node,
        ...globals.jest,
      },
    },
    plugins: {
      '@typescript-eslint': tseslint,
      prettier: prettierPlugin,
    },
    rules: {
      // @typescript-eslint/recommended rules
      ...tseslint.configs['flat/recommended'].rules,
      // Prettier recommended: eslint-config-prettier (disables conflicting
      // formatting rules) + eslint-plugin-prettier (reports prettier errors
      // as ESLint issues).
      ...prettierConfig.rules,
      'prettier/prettier': 'error',
      // Custom rules (preserved from legacy .eslintrc.js)
      '@typescript-eslint/interface-name-prefix': 'off',
      '@typescript-eslint/explicit-function-return-type': 'off',
      '@typescript-eslint/explicit-module-boundary-types': 'off',
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_' },
      ],
    },
  },

  // Ignores (migrated from legacy ignorePatterns)
  {
    ignores: ['.eslintrc.js', 'dist/**', 'node_modules/**'],
  },
];
