import { PoseLandmarker, FilesetResolver } from '@mediapipe/tasks-vision';
import { WorkerInMessage, WorkerResultMessage } from './types';

let poseLandmarker: PoseLandmarker | null = null;
let offscreenCanvas: OffscreenCanvas | null = null;
let offscreenCtx: OffscreenCanvasRenderingContext2D | null = null;

// OOM防止のために結果オブジェクト用の変数をスコープ外で保持・再利用
let poseResultCache: any = null;

async function initPoseLandmarker(): Promise<void> {
  if (!poseLandmarker) {
    const vision = await FilesetResolver.forVisionTasks(
      "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision/wasm"
    );
    poseLandmarker = await PoseLandmarker.createFromOptions(vision, {
      baseOptions: {
        modelAssetPath: "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task",
        delegate: "GPU"
      },
      runningMode: "IMAGE"
    });
  }
}

self.onmessage = async (event: MessageEvent<WorkerInMessage>) => {
  const data = event.data;

  if (data.type === 'INIT') {
    if (!offscreenCanvas) {
      offscreenCanvas = new OffscreenCanvas(data.width, data.height);
      offscreenCtx = offscreenCanvas.getContext('2d');
    }
    await initPoseLandmarker();
    return;
  }

  if (data.type === 'PROCESS') {
    const { id, imageBitmap, boundingBox } = data;
    try {
      if (!offscreenCanvas || !offscreenCtx || !poseLandmarker) {
        throw new Error("Worker is not properly initialized");
      }

      // キャンバスをクリアして転送されたImageBitmapを描画
      offscreenCtx.clearRect(0, 0, offscreenCanvas.width, offscreenCanvas.height);
      offscreenCanvas.width = imageBitmap.width;
      offscreenCanvas.height = imageBitmap.height;
      offscreenCtx.drawImage(imageBitmap, 0, 0);

      // 描画後はImageBitmapを破棄してメモリ解放
      imageBitmap.close();

      // Pose 検出実行 (スコープ外の変数に格納)
      poseResultCache = poseLandmarker.detect(offscreenCanvas);

      // ポーズ（姿勢情報）が十分な信頼度で検出されているか検証
      let isValidPerson = false;
      if (poseResultCache && poseResultCache.landmarks && poseResultCache.landmarks.length > 0) {
        // 少なくとも1つ以上のポーズランドマーク群が検出された場合
        isValidPerson = true;
      }

      // 検出結果のクリア（使い回し用の参照を外す）
      poseResultCache = null;

      const response: WorkerResultMessage = {
        id,
        isValidPerson,
        boundingBox
      };

      self.postMessage(response);
    } catch (err: any) {
      // エラー発生時も元のImageBitmapは確実に破棄
      imageBitmap.close();
      poseResultCache = null;

      const response: WorkerResultMessage = {
        id,
        isValidPerson: false,
        boundingBox,
        error: err?.message || "Worker processing error"
      };
      self.postMessage(response);
    }
  }
};
