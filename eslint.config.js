import eslint from '@eslint/js';
import prettier from 'eslint-config-prettier';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import globals from 'globals';
import tseslint from 'typescript-eslint';

const typeCheckedFiles = ['frontend/**/*.{ts,tsx}', 'backend/src/**/*.ts', 'backend/tests/**/*.ts'];
const prismaConfigFiles = ['backend/prisma.config.ts'];

export default tseslint.config(
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/build/**',
      '**/coverage/**',
      '**/.vite/**',
      'backend/src/generated/prisma/**',
    ],
  },
  {
    ...eslint.configs.recommended,
    files: [...typeCheckedFiles, ...prismaConfigFiles],
  },
  ...tseslint.configs.recommendedTypeChecked.map((config) => ({
    ...config,
    files: typeCheckedFiles,
  })),
  ...tseslint.configs.recommended.map((config) => ({
    ...config,
    files: prismaConfigFiles,
  })),
  {
    files: typeCheckedFiles,
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      'no-unused-vars': 'off',
      '@typescript-eslint/consistent-type-imports': [
        'error',
        { fixStyle: 'inline-type-imports', prefer: 'type-imports' },
      ],
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
        },
      ],
    },
  },
  {
    files: ['frontend/src/**/*.{ts,tsx}'],
    languageOptions: {
      globals: globals.browser,
    },
  },
  {
    files: ['frontend/src/**/*.{ts,tsx}'],
    ...reactHooks.configs.flat.recommended,
  },
  {
    files: ['frontend/src/**/*.{ts,tsx}'],
    ...reactRefresh.configs.vite,
  },
  {
    files: [
      'frontend/vite.config.ts',
      'frontend/tests/**/*.ts',
      'backend/src/**/*.ts',
      'backend/tests/**/*.ts',
      ...prismaConfigFiles,
    ],
    languageOptions: {
      globals: globals.node,
    },
  },
  prettier,
);
