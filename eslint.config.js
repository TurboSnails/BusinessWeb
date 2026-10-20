import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import tseslint from 'typescript-eslint'

// 只检查前端源码；脚本与服务端（.mjs）后续再逐步纳入
export default tseslint.config(
  { ignores: ['dist', 'node_modules', 'public', 'src/data/details/**'] },
  {
    files: ['src/**/*.{ts,tsx}'],
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    languageOptions: { ecmaVersion: 2022, globals: globals.browser },
    plugins: { 'react-hooks': reactHooks },
    linterOptions: { reportUnusedDisableDirectives: 'error' },
    rules: {
      ...reactHooks.configs.recommended.rules,
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrors: 'none' }],
      // `cond && fn()` / 三元调用是本仓库的常见写法
      '@typescript-eslint/no-unused-expressions': ['error', { allowShortCircuit: true, allowTernary: true }],
      'no-empty': ['error', { allowEmptyCatch: true }],
      // 清洗不可见字符的正则是有意为之；JSX 文本里的全角空格用于排版
      'no-control-regex': 'off',
      'no-irregular-whitespace': ['error', { skipJSXText: true, skipStrings: true, skipTemplates: true }],
      // 存量较多，先以警告形式逐步收敛
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/ban-ts-comment': 'warn',
      'no-useless-escape': 'warn',
    },
  },
)
