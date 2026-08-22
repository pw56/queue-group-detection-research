import { ObjectDetector, FilesetResolver, Detection, Category } from '@mediapipe/tasks-vision';
import { GroupDetectionImageSource, BoundingBoxRect } from './types';
import { workerPoolManager } from './workerManager';

let objectDetector: ObjectDetector | null = null;

// OOM防止: メインスレッドで canvas を1つ使い回す
let sharedCanvas: HTMLCanvasElement | null = null;
let sharedCtx: CanvasRenderingContext2D | null = null;

// 連続稼働時のOOMを防ぐため、検出結果バッファをスコープ外で宣言して使い回す
let candidateDetectionsBuffer: Detection[] = [];
let filteredDetectionsBuffer: Detection[] = [];
let evaluatedDetectionsBuffer: Detection[] = [];

// 領域の重なり具合（IoU / Intersection over Union）を算出する関数
function calculateIoU(boxA: BoundingBoxRect, boxB: BoundingBoxRect): number {
  const x1 = Math.max(boxA.originX, boxB.originX);
  const y1 = Math.max(boxA.originY, boxB.originY);
  const x2 = Math.min(boxA.originX + boxA.width, boxB.originX + boxB.width);
  const y2 = Math.min(boxA.originY + boxA.height, boxB.originY + boxB.height);

  const intersectionWidth = Math.max(0, x2 - x1);
  const intersectionHeight = Math.max(0, y2 - y1);
  const intersectionArea = intersectionWidth * intersectionHeight;

  if (intersectionArea === 0) return 0;

  const areaA = boxA.width * boxA.height;
  const areaB = boxB.width * boxB.height;

  // 小さい方の領域に対する被りの割合（包含判定用）
  const minArea = Math.min(areaA, areaB);
  const overlapRatio = intersectionArea / minArea;

  const unionArea = areaA + areaB - intersectionArea;
  const iou = intersectionArea / unionArea;

  return Math.max(iou, overlapRatio);
}

// 2つのバウンディングボックスのうち面積が大きい方の判定
function getLargerBox(boxA: BoundingBoxRect, boxB: BoundingBoxRect): BoundingBoxRect {
  const areaA = boxA.width * boxA.height;
  const areaB = boxB.width * boxB.height;
  return areaA >= areaB ? boxA : boxB;
}

// Detectorの初期化
async function initializeDetector(): Promise<void> {
  if (!objectDetector) {
    const vision = await FilesetResolver.forVisionTasks(
      "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision/wasm"
    );
    
    objectDetector = await ObjectDetector.createFromOptions(vision, {
      baseOptions: {
        modelAssetPath: "https://storage.googleapis.com/mediapipe-models/object_detector/efficientdet_lite0/float16/1/efficientdet_lite0.tflite",
        delegate: "GPU"
      },
      runningMode: "IMAGE"
    });
  }
}

// 人物の検出
export async function detectPeople(imageSource: GroupDetectionImageSource): Promise<Detection[]> {

  if (!objectDetector)
    await initializeDetector();

  if (!imageSource) throw new Error("No input data exists");

  try {
    const result = objectDetector!.detect(imageSource);
    
    // バッファのクリア（参照破棄）
    for (let i = 0; i < candidateDetectionsBuffer.length; i++) {
      (candidateDetectionsBuffer as any)[i] = null;
    }
    candidateDetectionsBuffer.length = 0;

    for (let i = 0; i < filteredDetectionsBuffer.length; i++) {
      (filteredDetectionsBuffer as any)[i] = null;
    }
    filteredDetectionsBuffer.length = 0;

    for (let i = 0; i < evaluatedDetectionsBuffer.length; i++) {
      (evaluatedDetectionsBuffer as any)[i] = null;
    }
    evaluatedDetectionsBuffer.length = 0;

    for (let i = 0; i < result.detections.length; i++) {
      const detection = result.detections[i];
      const isLowScorePerson = detection.categories.some((category: Category) => {
        return category.categoryName === 'person' && category.score >= 0.05;
      });
      if (isLowScorePerson && detection.boundingBox) {
        candidateDetectionsBuffer.push(detection);
      }
    }

    if (candidateDetectionsBuffer.length === 0) {
      return [];
    }

    const imgWidth = imageSource.naturalWidth || imageSource.width;
    const imgHeight = imageSource.naturalHeight || imageSource.height;

    // 非表示キャンバスの生成および「入力画像サイズが変わった時のみ」キャンバスサイズを変更
    if (!sharedCanvas) {
      sharedCanvas = document.createElement('canvas');
      sharedCanvas.width = imgWidth;
      sharedCanvas.height = imgHeight;
      sharedCtx = sharedCanvas.getContext('2d', { willReadFrequently: true });
    } else if (sharedCanvas.width !== imgWidth || sharedCanvas.height !== imgHeight) {
      sharedCanvas.width = imgWidth;
      sharedCanvas.height = imgHeight;
    }
    
    if (!sharedCtx) {
      throw new Error("Failed to get 2d context from canvas");
    }

    sharedCtx.clearRect(0, 0, sharedCanvas.width, sharedCanvas.height);
    sharedCtx.drawImage(imageSource, 0, 0);

    // Promise.all でバウンディングボックス候補を同時にワーカーマネージャーへ投入
    const verificationPromises = candidateDetectionsBuffer.map(async (detection, index) => {
      const bbox = detection.boundingBox!;
      
      const sx = Math.max(0, Math.floor(bbox.originX));
      const sy = Math.max(0, Math.floor(bbox.originY));
      const sw = Math.min(sharedCanvas!.width - sx, Math.floor(bbox.width));
      const sh = Math.min(sharedCanvas!.height - sy, Math.floor(bbox.height));

      if (sw <= 0 || sh <= 0) {
        return { isPerson: false, index, refinedRect: undefined };
      }

      const rect: BoundingBoxRect = { originX: sx, originY: sy, width: sw, height: sh };

      const imageBitmap = await createImageBitmap(sharedCanvas!, sx, sy, sw, sh);

      try {
        const res = await workerPoolManager.processCandidate(
          imageBitmap,
          rect,
          index,
          imgWidth,
          imgHeight
        );
        return { isPerson: res.isPerson, index, refinedRect: res.refinedRect };
      } catch (err) {
        imageBitmap.close();
        return { isPerson: false, index, refinedRect: undefined };
      }
    });

    const results = await Promise.all(verificationPromises);

    for (const res of results) {
      if (res.isPerson) {
        const detection = candidateDetectionsBuffer[res.index];
        // 骨格に基づくマージン適用済みの refinedRect が存在すれば適用
        if (res.refinedRect && detection.boundingBox) {
          detection.boundingBox.originX = res.refinedRect.originX;
          detection.boundingBox.originY = res.refinedRect.originY;
          detection.boundingBox.width = res.refinedRect.width;
          detection.boundingBox.height = res.refinedRect.height;
        }
        filteredDetectionsBuffer.push(detection);
      }
    }

    // 重複除去の閾値（同じ人物で重なり合っている場合は「大きい方」を残す）
    const OVERLAP_THRESHOLD = 0.4;

    for (let i = 0; i < filteredDetectionsBuffer.length; i++) {
      const current = filteredDetectionsBuffer[i];
      if (!current || !current.boundingBox) continue;

      let currentBox: BoundingBoxRect = {
        originX: current.boundingBox.originX,
        originY: current.boundingBox.originY,
        width: current.boundingBox.width,
        height: current.boundingBox.height
      };

      let isSuppressed = false;

      for (let j = 0; j < evaluatedDetectionsBuffer.length; j++) {
        const existing = evaluatedDetectionsBuffer[j];
        if (!existing || !existing.boundingBox) continue;

        const existingBox: BoundingBoxRect = {
          originX: existing.boundingBox.originX,
          originY: existing.boundingBox.originY,
          width: existing.boundingBox.width,
          height: existing.boundingBox.height
        };

        const overlap = calculateIoU(currentBox, existingBox);

        if (overlap > OVERLAP_THRESHOLD) {
          // 被り率が高い同一判定人物の場合、より大きいバウンディングボックスを残す
          const larger = getLargerBox(currentBox, existingBox);
          if (larger === currentBox) {
            // 現在の候補の方が大きいため、既存のものを入れ替える
            evaluatedDetectionsBuffer[j] = current;
          }
          isSuppressed = true;
          break;
        }
      }

      if (!isSuppressed) {
        evaluatedDetectionsBuffer.push(current);
      }
    }

    const finalResult = [...evaluatedDetectionsBuffer];

    // 明示的な参照の解放
    for (let i = 0; i < candidateDetectionsBuffer.length; i++) {
      (candidateDetectionsBuffer as any)[i] = null;
    }
    candidateDetectionsBuffer.length = 0;

    for (let i = 0; i < filteredDetectionsBuffer.length; i++) {
      (filteredDetectionsBuffer as any)[i] = null;
    }
    filteredDetectionsBuffer.length = 0;

    for (let i = 0; i < evaluatedDetectionsBuffer.length; i++) {
      (evaluatedDetectionsBuffer as any)[i] = null;
    }
    evaluatedDetectionsBuffer.length = 0;

    return finalResult;
  } catch (error) {
    throw new Error("Detection error", { cause: error });
  }
}
