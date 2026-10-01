import { test } from '@playwright/test';
import { chromium } from 'playwright';
import StreamZip from 'node-stream-zip';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { CONFIG } from './config'; // 設定ファイルをインポート

test('実験スクリプトの実行', async () => {
  const browser = await chromium.launch();

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

        // 保存先ディレクトリパスの構築
        const approachName = path.parse(approach.fileName).name;
        const mediaName = path.parse(mediaPath).name;
        const outputDir = path.join('experimental_results', approachName, mediaName);
        fs.mkdirSync(outputDir, { recursive: true });

        const tempZipPath = path.join(outputDir, approach.fileName);
        
        // 指定したファイル名でローカルに保存する
        await download.saveAs(tempZipPath);
        console.log(`ファイルを保存しました: ${tempZipPath}`);

        // ZIPファイルを解凍して元ファイルを削除
        try {
          const zip = new StreamZip.async({ file: tempZipPath });
          await zip.extract(null, outputDir);
          await zip.close();
          console.log(`ファイルを解凍しました: ${outputDir}`);

          fs.unlinkSync(tempZipPath);
          console.log(`元のZIPファイルを削除しました: ${tempZipPath}`);
        } catch (err) {
          console.error(`ZIP解凍処理に失敗しました: ${tempZipPath}`, err);
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
  await browser.close();
});
