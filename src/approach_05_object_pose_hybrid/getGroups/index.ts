import { Groups, GroupDetectionImageSource } from './types';
import { detectPeople } from './detectPeople';
import { convertToGroups } from './convertToGroups';
import { PoseValidator } from './poseValidator';

// グループの検出 (人物をグループに見せかけてそのまま返す)
export async function getGroups(imageSource: GroupDetectionImageSource): Promise<Groups> {

  if (!imageSource) throw new Error("No input data exists");

  let canvas: HTMLCanvasElement | null = null;
  let poseValidator: PoseValidator | null = null;

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

    // 3. メインスレッド用 GPU PoseValidator の初期化
    poseValidator = new PoseValidator();
    await poseValidator.initialize();

    // 4. Promise.all で全候補のバウンディングボックスをマージンなしで createImageBitmap 切り出し
    const crops = await Promise.all(
      detections.map(async (detection) => {
        const { angle, ...restBoundingBox } = detection.boundingBox!;

        // 切り出し座標のクランプ処理（範囲外や幅・高さが0以下になる例外を回避）
        const sx = Math.max(0, Math.min(width - 1, Math.floor(restBoundingBox.originX)));
        const sy = Math.max(0, Math.min(height - 1, Math.floor(restBoundingBox.originY)));
        const sw = Math.max(1, Math.min(width - sx, Math.floor(restBoundingBox.width)));
        const sh = Math.max(1, Math.min(height - sy, Math.floor(restBoundingBox.height)));

        const imageBitmap = await createImageBitmap(canvas!, sx, sy, sw, sh);

        return {
          imageBitmap,
          boundingBox: restBoundingBox
        };
      })
    );

    // 5. GPUを使った高速ループ処理で各切り出し画像を検証
    const validatedPeople = [];
    for (const crop of crops) {
      const isValid = await poseValidator.validateCrop(crop.imageBitmap);
      if (isValid) {
        validatedPeople.push(crop.boundingBox);
      }
    }

    const groups = convertToGroups(validatedPeople);
    return groups;
  } catch (error) {
    throw new Error("Detection error", { cause: error });
  } finally {
    // 解放処理
    if (poseValidator) {
      poseValidator.close();
      poseValidator = null;
    }
    if (canvas) {
      canvas.width = 0;
      canvas.height = 0;
      canvas = null;
    }
  }
}

export * from './types';
