import * as tf from '@tensorflow/tfjs';
import * as poseDetection from '@tensorflow-models/pose-detection';
import { WorkerIncomingMessage, WorkerResultMessage } from './types';

let detector: poseDetection.PoseDetector | null = null;
let offscreenCanvas: OffscreenCanvas | null = null;
let offscreenCtx: OffscreenCanvasRenderingContext2D | null = null;

// OOM防止のためにスコープ外で宣言・使い回すバッファ変数
let currentPoses: poseDetection.Pose[] = [];

async function initWorker(width: number, height: number) {
  if (!offscreenCanvas) {
    offscreenCanvas = new OffscreenCanvas(width, height);
    offscreenCtx = offscreenCanvas.getContext('2d', { willReadFrequently: true });
  } else {
    offscreenCanvas.width = width;
    offscreenCanvas.height = height;
  }

  if (!detector) {
    await tf.ready();
    detector = await poseDetection.createDetector(
      poseDetection.SupportedModels.MoveNet,
      {
        modelType: poseDetection.movenet.modelType.SINGLEPOSE_LIGHTNING
      }
    );
  }
}

self.onmessage = async (event: MessageEvent<WorkerIncomingMessage>) => {
  const data = event.data;

  if (data.type === 'INIT') {
    try {
      await initWorker(data.width, data.height);
    } catch (err: any) {
      console.error('Worker init error:', err);
    }
    return;
  }

  if (data.type === 'PROCESS') {
    const { id, imageBitmap, rect } = data;
    try {
      if (!offscreenCanvas || !offscreenCtx || !detector) {
        throw new Error('Worker is not initialized');
      }

      // 非表示キャンバスのサイズ調整・描画
      offscreenCanvas.width = imageBitmap.width;
      offscreenCanvas.height = imageBitmap.height;
      offscreenCtx.clearRect(0, 0, imageBitmap.width, imageBitmap.height);
      offscreenCtx.drawImage(imageBitmap, 0, 0);

      // 解放処理
      imageBitmap.close();

      // スコープ外で宣言した変数に結果を格納して使い回し
      currentPoses = await detector.estimatePoses(offscreenCanvas);

      // 実用に耐えうる信頼度でフィルター (スコア 0.25 以上のキーポイントが存在するか)
      const isPerson = currentPoses.some(pose => {
        const score = pose.score ?? 0;
        if (score >= 0.25) return true;
        return pose.keypoints.some(kp => (kp.score ?? 0) >= 0.25);
      });

      // 検出結果バッファのクリア
      currentPoses = [];

      const result: WorkerResultMessage = { id, isPerson, rect };
      self.postMessage(result);
    } catch (error: any) {
      // エラー時も切り出しBitmapを確実にクローズ
      imageBitmap.close();
      const result: WorkerResultMessage = {
        id,
        isPerson: false,
        rect,
        error: error?.message || 'Unknown worker error'
      };
      self.postMessage(result);
    }
  }
};
