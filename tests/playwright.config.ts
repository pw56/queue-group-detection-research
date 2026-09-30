import { defineConfig } from '@playwright/test';

export default defineConfig({
  // Codespaces上ではブラウザの画面を表示しない（ヘッドレス）
  use: {
    headless: true,
    screenshot: 'on', // 失敗時に自動でスクショを撮る設定（任意）
  },
});
