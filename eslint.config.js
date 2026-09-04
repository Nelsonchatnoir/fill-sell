import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{js,jsx}'],
    extends: [
      js.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      ecmaVersion: 2020,
      globals: {
        ...globals.browser,
        // Constantes injectées à la compilation par Vite (`define`,
        // vite.config.js:38-41) : elles n'existent pas dans le source, seul le
        // bundle les porte. Sans cette déclaration, no-undef les signalait
        // alors que le code est correct — et App.jsx les lit déjà derrière un
        // `typeof … !== 'undefined'`, ce qui couvre le cas du dev non buildé.
        // ⚠️ Toute nouvelle clé de `define` doit être ajoutée ICI aussi.
        __FILLSELL_APP_BUILD__: 'readonly',
        __FILLSELL_EXT_MIN_BUILD__: 'readonly',
      },
      parserOptions: {
        ecmaVersion: 'latest',
        ecmaFeatures: { jsx: true },
        sourceType: 'module',
      },
    },
    rules: {
      'no-unused-vars': ['error', { varsIgnorePattern: '^[A-Z_]' }],
    },
  },
])
