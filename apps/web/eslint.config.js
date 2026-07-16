import eslint from '@eslint/js'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import globals from 'globals'
import tseslint from 'typescript-eslint'

export default [
  {
    ignores: ['dist'],
  },
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  {
    ...reactHooks.configs.flat.recommended,
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      globals: globals.browser,
    },
  },
  {
    ...reactRefresh.configs.vite,
    files: ['**/*.{ts,tsx}'],
  },
  {
    files: ['**/*.config.ts'],
    languageOptions: {
      globals: globals.node,
    },
  },
]
