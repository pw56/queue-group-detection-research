import { Groups, GroupDetectionImageSource } from './types';
import { detectPeople } from './detectPeople';
import { convertToGroups } from './convertToGroups';
import { WorkerManager } from './workerManager';

// グループの検出 (人物をグループに見せかけてそのまま返す)
export async function getGroups(imageSource: GroupDetectionImageSource): Promise<Groups> {

  if (!imageSource) throw new Error("No input data exists");

  let workerManager: WorkerManager | null = null;
  let canvas: HTMLCanvasElement | null = null;

  try {
    // 1. オブジェクト検出で人物の候補（低い信頼度）を取得
    const detections = await detectPeople(imageSource);

    if (detections.length === 0) {
      return convertToGroups([]);
    }

    // 画像サイズ取得
    const width = imageSource.naturalWidth || imageSource.width;
    const height = imageSource.naturalHeight || imageSource.height;

    // 2. 元画像描画用の非表示キャンバスを作成
    canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error("Failed to get 2D context");
    ctx.drawImage(imageSource, 0, 0);

    // 3. ワーカーマネージャーの初期化（ワーカー数の固定）
    workerManager = new WorkerManager(4);
    await workerManager.initialize(width, height);

    // 4. Promise.all で候補のバウンディングボックスから createImageBitmap でマージンなしで切り出し、同時にワーカーに投入
    const processPromises = detections.map(async (detection) => {
      const { angle, ...restBoundingBox } = detection.boundingBox!;
      
      // 画像の切り出し座標（キャンバス範囲外へのはみ出しをクランプ）
      const sx = Math.max(0, Math.floor(restBoundingBox.originX));
      const sy = Math.max(0, Math.floor(restBoundingBox.originY));
      const sw = Math.min(width - sx, Math.floor(restBoundingBox.width));
      const sh = Math.min(height - sy, Math.floor(restBoundingBox.height));

      // createImageBitmap によりバウンディングボックスの範囲で切り出し
      const imageBitmap = await createImageBitmap(canvas!, sx, sy, Math.max(1, sw), Math.max(1, sh));

      // ワーカーに依頼
      return workerManager!.processJob({
        imageBitmap,
        boundingBox: restBoundingBox
      });
    });

    // 5. 並列処理の結果を待機
    const workerResults = await Promise.all(processPromises);

    // 6. ポーズ検出により人物として正しく認定された候補のみ抽出
    const validatedPeople = workerResults
      .filter(result => result.isValidPerson)
      .map(result => result.boundingBox);

    const groups = convertToGroups(validatedPeople);
    return groups;
  } catch (error) {
    throw new Error("Detection error", { cause: error });
  } finally {
    // メモリ破棄・解放処理
    if (workerManager) {
      workerManager.terminate();
    }
    if (canvas) {
      canvas.width = 0;
      canvas.height = 0;
      canvas = null;
    }
  }
}

export * from './types';
