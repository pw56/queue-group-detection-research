import { chromium } from 'playwright';
import { CONFIG } from './config'; // 設定ファイルをインポート

(async () => {
  // ブラウザを起動（動きが見えるように headless: false）
  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext();
  const page = await context.newPage();

  for (let targetUrlIndex = 0; targetUrlIndex < CONFIG.targetUrl.length; targetUrlIndex++) {
    const targetUrl = CONFIG.targetUrl[targetUrlIndex];

    for (let mediaPathIndex = 0; mediaPathIndex < CONFIG.mediaPath.length; mediaPathIndex++) {
      const mediaPath = CONFIG.mediaPath[mediaPathIndex];

      // 研究用のWebサイトを開く
      await page.goto(targetUrl);
      await page.waitForLoadState('networkidle');

      // 【手順1】指定した秒数待つ
      console.log(`${CONFIG.initialWaitSeconds}秒間、待機します...`);
      await page.waitForTimeout(CONFIG.initialWaitSeconds * 1000);

      // 【手順2】ファイルのアップロード
      console.log('ファイルをアップロードしています...');
      await page.locator('input[type="file"]').setInputFiles(mediaPath);
      await page.waitForTimeout(1000); // 描画の安定待ち

      // Canvas要素の位置（左上の絶対座標）を取得してズレを防止
      const canvas = page.locator('canvas');
      const box = await canvas.boundingBox();
      if (!box) {
        console.error('Canvas要素が見つかりませんでした。');
        continue;
      }

      // 【手順3】多角形ROIを自動でなぞる
      console.log('多角形ROIをなぞっています...');
      const startX = box.x + CONFIG.roiPoints[0].x;
      const startY = box.y + CONFIG.roiPoints[0].y;
      await page.mouse.move(startX, startY);
      await page.mouse.down(); // ペンを画面につける

      for (let i = 1; i < CONFIG.roiPoints.length; i++) {
        const nextX = box.x + CONFIG.roiPoints[i].x;
        const nextY = box.y + CONFIG.roiPoints[i].y;
        await page.mouse.move(nextX, nextY, { steps: 5 }); // 滑らかに動かす
      }
      await page.mouse.up(); // ペンを離す
      await page.waitForTimeout(1000);

      // 【手順4】結果ダウンロードボタンを押す（ファイルの保存）
      console.log('ダウンロードボタンをクリックします...');
      
      // Playwrightでダウンロードイベントを待ち受ける状態を作る
      const downloadPromise = page.waitForEvent('download');
      
      // ダウンロードをトリガーするボタンをクリック
      await page.getByRole('button', { name: CONFIG.downloadButtonName }).click();
      
      // ダウンロード処理の完了を待つ
      const download = await downloadPromise;
      
      // 指定したファイル名でローカルに保存する
      const saveAsName = `url${targetUrlIndex + 1}_media${mediaPathIndex + 1}_${CONFIG.saveAsName}`;
      await download.saveAs(saveAsName);
      console.log(`ファイルを保存しました: ${saveAsName}`);

      await page.waitForTimeout(1000);
    }
  }

  // 終了処理
  await page.waitForTimeout(2000);
  await browser.close();
})();
