import { test } from '@playwright/test';
import { chromium } from 'playwright';
import StreamZip from 'node-stream-zip';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { CONFIG } from './experiment-config'; // 設定ファイルをインポート

test('実験スクリプトの実行', async () => {
  // 実験処理が完了するまでタイムアウトを無効化（0 = 制限なし）
  test.setTimeout(0);
  
  const browser = await chromium.launch({
  args: [
    '--enable-unsafe-webgpu',       // WebGPUを有効化
    '--use-gl=angle',               // グラフィックスバックエンドの設定
    '--ignore-gpu-blocklist',       // GPUの互換性制限を解除
  ]
});

  // ヘルパー関数: 配列を指定サイズごとに分割
  const chunkArray = <T>(array: T[], size: number): T[][] => {
    const chunks: T[][] = [];
    for (let i = 0; i < array.length; i += size) {
      chunks.push(array.slice(i, i + size));
    }
    return chunks;
  };

  // 動画メディアと画像メディアに仕分け
  const videoMediaList = CONFIG.mediaList.filter(item => {
    const ext = path.extname(item.mediaPath).toLowerCase();
    return ['.mp4', '.webm', '.ogg', '.mov'].includes(ext);
  });

  const imageMediaList = CONFIG.mediaList.filter(item => {
    const ext = path.extname(item.mediaPath).toLowerCase();
    return !['.mp4', '.webm', '.ogg', '.mov'].includes(ext);
  });

  // アプローチごとに順次処理を呼び出す
  for (let approachIndex = 0; approachIndex < CONFIG.approaches.length; approachIndex++) {
    const approach = CONFIG.approaches[approachIndex];

    const processItem = async (item: typeof CONFIG.mediaList[number]) => {
      const mediaPath = item.mediaPath;
      const roiJsonPath = item.roiJsonPath;

      const context = await browser.newContext();
      const page = await context.newPage();

      try {
        // 研究用のWebサイトを開く
        for (let i = 0; i < 3; i++) {
          try {
            await page.goto(approach.targetUrl, { waitUntil: 'domcontentloaded' });
            break;
          } catch (e) {
            if (i === 2) throw e;
            await page.waitForTimeout(1000);
          }
        }

        // 【手順1】指定した秒数待つ
        console.log(`${CONFIG.initialWaitSeconds}秒間、待機します...`);
        await page.waitForTimeout(CONFIG.initialWaitSeconds * 1000);

        // CONFIG.approachesの2回目以降（approachIndex >= 1）の場合、先にROI JSONをアップロード
        if (approachIndex >= 1 && roiJsonPath) {
          console.log('ROI処理する輪郭のデータをアップロードしています...');
          await page.getByLabel('ROI処理する輪郭のデータをアップロード (任意)').setInputFiles(roiJsonPath);
        }

        // 【手順2】ファイルのアップロード
        console.log('ファイルをアップロードしています...');
        await page.getByLabel('入力する画像・動画をアップロード').setInputFiles(mediaPath);
        
        // Canvas要素を取得し、画面に表示されるまで待機する
        const canvas = page.locator('canvas');
        await canvas.waitFor({ state: 'visible' });

        // 描画および内部処理が安定するまで少し待機
        await page.waitForTimeout(2000);

        // Canvas要素生存確認
        const box = await canvas.boundingBox();
        if (!box) {
          console.error('Canvas要素が見つかりませんでした。');
          await context.close();
          return;
        }

        // 【手順3】多角形ROIを自動でなぞる
        console.log('多角形ROIをなぞっています...');
        const startX = CONFIG.roiPoints[0].x;
        const startY = CONFIG.roiPoints[0].y;
        await page.mouse.move(startX, startY);
        await page.mouse.down(); // ペンを画面につける

        for (let i = 1; i < CONFIG.roiPoints.length; i++) {
          const nextX = CONFIG.roiPoints[i].x;
          const nextY = CONFIG.roiPoints[i].y;
          await page.mouse.move(nextX, nextY, { steps: 5 }); // 滑らかに動かす
        }
        await page.mouse.up(); // ペンを離す

        // 動画ファイルの場合のみ、動画の再生終了を待機する
        const ext = path.extname(mediaPath).toLowerCase();
        if (['.mp4', '.webm', '.ogg', '.mov'].includes(ext)) {
          const videoLocator = page.locator('video');
          await videoLocator.waitFor({ state: 'attached' });
          await page.waitForFunction(
            (el) => {
              const video = el as HTMLVideoElement;
              return video.ended || video.paused;
            },
            await videoLocator.elementHandle(),
            { timeout: 0 }
          );
        }

        await page.waitForTimeout(3000);

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
    };

    // 画像ファイルを4並列で処理
    const imageChunks = chunkArray(imageMediaList, 4);
    for (const chunk of imageChunks) {
      await Promise.all(chunk.map(item => processItem(item)));
    }

    // 動画ファイルをシングル（1つずつ順次）で処理
    for (const item of videoMediaList) {
      await processItem(item);
    }
  }

  // 終了処理
  await browser.close();
});
