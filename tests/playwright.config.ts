import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  // Codespaces上ではブラウザの画面を表示しない（ヘッドレス）
  use: {
    viewport: { width: 1920, height: 1080 }, // すべてのテストのデフォルトサイズを設定 (未指定時は 1280x720)
    headless: true,
    screenshot: 'on', // 失敗時に自動でスクショを撮る設定（任意）
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ]
});
