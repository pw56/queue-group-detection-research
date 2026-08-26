import { ObjectDetector, FilesetResolver, Detection, Category } from '@mediapipe/tasks-vision';
import { GroupDetectionImageSource, BoundingBoxRect, Person } from '../types';
import { workerPoolManager } from '../workers';
import { deduplicateDetections } from './deduplicateDetections';

let objectDetector: ObjectDetector | null = null;

// OOM防止: メインスレッドで canvas を1つ使い回す
let sharedCanvas: HTMLCanvasElement | null = null;
let sharedCtx: CanvasRenderingContext2D | null = null;

// 連続稼働時のOOMを防ぐため、検出結果バッファをスコープ外で宣言して使い回す
let candidateDetectionsBuffer: Detection[] = [];
let filteredDetectionsBuffer: Detection[] = [];
let evaluatedDetectionsBuffer: Detection[] = [];
let sortedDetectionsBuffer: Detection[] = [];
let finalDetectionsBuffer: Detection[] = [];

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
      runningMode: "IMAGE" // `IMAGE` モードは推論をしても蓄積が発生しないので、パフォーマンス面でもいい
    });
  }
}

// 人物の検出
export async function detectPeople(
  imageSource: GroupDetectionImageSource,
  outResult: Person[] = []
): Promise<Person[]> {

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

    for (let i = 0; i < sortedDetectionsBuffer.length; i++) {
      (sortedDetectionsBuffer as any)[i] = null;
    }
    sortedDetectionsBuffer.length = 0;

    for (let i = 0; i < finalDetectionsBuffer.length; i++) {
      (finalDetectionsBuffer as any)[i] = null;
    }
    finalDetectionsBuffer.length = 0;

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
      outResult.length = 0;
      return outResult;
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
        return { isPerson: false, index, refinedRect: undefined };
      } finally {
        // 成功・失敗に関わらず ImageBitmap を必ず解放して VRAM/GPU メモリ解放を保証
        if (imageBitmap) {
          imageBitmap.close();
        }
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

    deduplicateDetections(
      filteredDetectionsBuffer,
      evaluatedDetectionsBuffer,
      sortedDetectionsBuffer,
      finalDetectionsBuffer
    );

    outResult.length = 0;
    for (let i = 0; i < finalDetectionsBuffer.length; i++) {
      const box = finalDetectionsBuffer[i].boundingBox!;
      outResult.push({
        boundingBox: {
          originX: box.originX,
          originY: box.originY,
          width: box.width,
          height: box.height
        }
      });
    }

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

    for (let i = 0; i < sortedDetectionsBuffer.length; i++) {
      (sortedDetectionsBuffer as any)[i] = null;
    }
    sortedDetectionsBuffer.length = 0;

    for (let i = 0; i < finalDetectionsBuffer.length; i++) {
      (finalDetectionsBuffer as any)[i] = null;
    }
    finalDetectionsBuffer.length = 0;

    return outResult;
  } catch (error) {
    throw new Error("Detection error", { cause: error });
  }
}
