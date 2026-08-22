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

// Detectorの初期化
async function initializeDetector(): Promise<void> {
  // 同時呼び出しによる競合を防止
  if (!objectDetector) {
    // @mediapipe/tasks-vision のwasmファイル群が配置されている正しいパスを指定
    const vision = await FilesetResolver.forVisionTasks(
      "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision/wasm"
    );
    
    objectDetector = await ObjectDetector.createFromOptions(vision, {
      baseOptions: {
        modelAssetPath: "https://storage.googleapis.com/mediapipe-models/object_detector/efficientdet_lite0/float16/1/efficientdet_lite0.tflite", // 実際の.tfliteモデルのURLを指定
        delegate: "GPU" // パフォーマンス向上のためGPUを優先（利用可能な場合）
      },
      runningMode: "IMAGE"
    });
  }
}

// 人物の検出
export async function detectPeople(imageSource: GroupDetectionImageSource): Promise<Detection[]> {

  // 初期化
  if (!objectDetector)
    await initializeDetector();

  // 入力が存在しない場合は終了
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

    for (let i = 0; i < result.detections.length; i++) {
      const detection = result.detections[i];
      const isLowScorePerson = detection.categories.some((category: Category) => {
        // オブジェクト検出で人物を列挙 (低い信頼度 0.05 以上で拾う)
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
      // サイズ変化時のみ width / height を更新（同サイズならここは実行されず保持される）
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
      
      // 画像範囲内にクランプ（マージンなし）
      const sx = Math.max(0, Math.floor(bbox.originX));
      const sy = Math.max(0, Math.floor(bbox.originY));
      const sw = Math.min(sharedCanvas!.width - sx, Math.floor(bbox.width));
      const sh = Math.min(sharedCanvas!.height - sy, Math.floor(bbox.height));

      if (sw <= 0 || sh <= 0) {
        return { isPerson: false, index };
      }

      const rect: BoundingBoxRect = { originX: sx, originY: sy, width: sw, height: sh };

      // createImageBitmap でバウンディングボックスの範囲を指定して切り出し
      const imageBitmap = await createImageBitmap(sharedCanvas!, sx, sy, sw, sh);

      const clonedBitmap = structuredClone(imageBitmap, { transfer: [imageBitmap] });
      imageBitmap.close();

      try {
        const res = await workerPoolManager.processCandidate(
          clonedBitmap,
          rect,
          index,
          imgWidth,
          imgHeight
        );
        return { isPerson: res.isPerson, index };
      } catch (err) {
        clonedBitmap.close();
        return { isPerson: false, index };
      }
    });

    const results = await Promise.all(verificationPromises);

    for (const res of results) {
      if (res.isPerson) {
        filteredDetectionsBuffer.push(candidateDetectionsBuffer[res.index]);
      }
    }

    // 返却用配列のコピー作成
    const finalResult = [...filteredDetectionsBuffer];

    // 明示的な参照の解放
    for (let i = 0; i < candidateDetectionsBuffer.length; i++) {
      (candidateDetectionsBuffer as any)[i] = null;
    }
    candidateDetectionsBuffer.length = 0;

    for (let i = 0; i < filteredDetectionsBuffer.length; i++) {
      (filteredDetectionsBuffer as any)[i] = null;
    }
    filteredDetectionsBuffer.length = 0;

    return finalResult;
  } catch (error) {
    throw new Error("Detection error", { cause: error });
  }
}
