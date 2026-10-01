import { chromium } from 'playwright';
import StreamZip from 'node-stream-zip';
import * as fs from 'fs';
import { CONFIG } from './config'; // 設定ファイルをインポート

(async () => {
  // ブラウザを起動（動きが見えるように headless: false）
  const browser = await chromium.launch({ headless: false });

  // 組み合わせごとの処理を定義
  const tasks = CONFIG.approaches.flatMap((approach) =>
    CONFIG.mediaPath.map((mediaPath) => async () => {
      const context = await browser.newContext();
      const page = await context.newPage();

      try {
        // 研究用のWebサイトを開く
        await page.goto(approach.targetUrl);
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
          await context.close();
          return;
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
        await download.saveAs(approach.fileName);
        console.log(`ファイルを保存しました: ${approach.fileName}`);

        // ZIPファイルを解凍して元ファイルを削除
        try {
          const zip = new StreamZip.async({ file: approach.fileName });
          await zip.extract(null, './');
          await zip.close();
          console.log(`ファイルを解凍しました: ${approach.fileName}`);

          fs.unlinkSync(approach.fileName);
          console.log(`元のZIPファイルを削除しました: ${approach.fileName}`);
        } catch (err) {
          console.error(`ZIP解凍処理に失敗しました: ${approach.fileName}`, err);
        }

        await page.waitForTimeout(1000);
      } finally {
        await context.close();
      }
    })
  );

  // すべての組み合わせを並列で実行
  await Promise.all(tasks.map((task) => task()));

  // 終了処理
  await page.waitForTimeout(2000);
  await browser.close();
})();
