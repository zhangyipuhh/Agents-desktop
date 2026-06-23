/**
 * ESLint Flat Config（v9+ 格式）
 *
 * - TypeScript strict
 * - Vue 3 推荐规则
 * - 禁止 any 类型
 */

import js from '@eslint/js';
import tsParser from '@typescript-eslint/parser';
import tsPlugin from '@typescript-eslint/eslint-plugin';
import vueParser from 'vue-eslint-parser';
import vuePlugin from 'eslint-plugin-vue';

export default [
  {
    ignores: [
      'dist/**',
      'dist-electron/**',
      'out/**',
      'node_modules/**',
      'coverage/**',
      '*.config.js',
      '*.config.cjs',
    ],
  },
  js.configs.recommended,
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      parser: tsParser,
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: {
        window: 'readonly',
        document: 'readonly',
        console: 'readonly',
        process: 'readonly',
        setTimeout: 'readonly',
        clearTimeout: 'readonly',
        setInterval: 'readonly',
        clearInterval: 'readonly',
        Promise: 'readonly',
        URL: 'readonly',
        Buffer: 'readonly',
      },
    },
    plugins: { '@typescript-eslint': tsPlugin },
    rules: {
      ...tsPlugin.configs.recommended.rules,
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      'no-unused-vars': 'off',
    },
  },
  {
    files: ['**/*.vue'],
    languageOptions: {
      parser: vueParser,
      parserOptions: {
        parser: tsParser,
        ecmaVersion: 2022,
        sourceType: 'module',
        extraFileExtensions: ['.vue'],
      },
      globals: {
        window: 'readonly',
        document: 'readonly',
        console: 'readonly',
      },
    },
    plugins: { vue: vuePlugin, '@typescript-eslint': tsPlugin },
    rules: {
      ...(vuePlugin.configs['flat/recommended']?.[1]?.rules ?? {}),
      'vue/multi-word-component-names': 'off',
      'vue/comment-directive': 'off',
      'vue/component-name-in-template-casing': 'off',
      'vue/html-indent': 'off',
      'vue/max-attributes-per-line': 'off',
      'vue/singleline-html-element-content-newline': 'off',
      'vue/html-self-closing': 'off',
      'vue/attributes-order': 'off',
      'vue/html-closing-bracket-newline': 'off',
      'vue/first-attribute-linebreak': 'off',
      '@typescript-eslint/no-explicit-any': 'error',
    },
  },
];
