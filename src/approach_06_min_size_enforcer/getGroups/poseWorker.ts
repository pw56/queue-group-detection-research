import * as tf from '@tensorflow/tfjs';
import { createDetector, SupportedModels, Pose } from '@tensorflow-models/pose-detection/dist';
import { WorkerIncomingMessage, WorkerResultMessage } from './types';

let detector: any = null;

// OOM防止のためスコープ外で宣言・使い回すバッファ変数
let currentPoses: Pose[] = [];

// 小さい画像の拡大用固定キャンバス（ワーカーごとに1つ保持して使い回す）
const MIN_INPUT_SIZE = 256;
let workerCanvas: OffscreenCanvas | null = null;
let workerCtx: OffscreenCanvasRenderingContext2D | null = null;

async function initWorker(_width: number, _height: number) {
  if (!detector) {
    await tf.ready();
    detector = await createDetector(
      SupportedModels.MoveNet,
      {
        modelType: 'SinglePose.Lightning'
      }
    );
  }
}

self.onmessage = async (event: MessageEvent<WorkerIncomingMessage>) => {
  const data = event.data;

  if (data.type === 'INIT') {
    try {
      await initWorker(data.width, data.height);
    } catch (err: unknown) {
      console.error('Worker init error:', err);
    }
    return;
  }

  if (data.type === 'PROCESS') {
    const { id, imageBitmap, rect } = data;
    let isPerson = false;
    let errorMessage: string | undefined = undefined;

    try {
      if (!detector) {
        throw new Error('Worker is not initialized');
      }

      // ポーズ検出実行（スコープ外バッファの参照を再利用）
      for (let i = 0; i < currentPoses.length; i++) {
        (currentPoses as any)[i] = null;
      }
      currentPoses.length = 0;

      // 入力画像のサイズ調整（小さすぎる場合は固定サイズのOffscreenCanvasで拡大）
      let inputSource: ImageBitmap | OffscreenCanvas = imageBitmap;

      if (imageBitmap.width < MIN_INPUT_SIZE || imageBitmap.height < MIN_INPUT_SIZE) {
        // 固定キャンバスの初期化またはサイズ調整
        if (!workerCanvas) {
          workerCanvas = new OffscreenCanvas(MIN_INPUT_SIZE, MIN_INPUT_SIZE);
          workerCtx = workerCanvas.getContext('2d', { willReadFrequently: true });
        }

        if (workerCtx) {
          workerCtx.clearRect(0, 0, MIN_INPUT_SIZE, MIN_INPUT_SIZE);
          // アスペクト比を維持しつつスケーリングして中央配置する、または全体に引き伸ばして描画
          workerCtx.drawImage(imageBitmap, 0, 0, MIN_INPUT_SIZE, MIN_INPUT_SIZE);
          inputSource = workerCanvas;
        }
      }

      const poses = await detector.estimatePoses(inputSource);
      for (let i = 0; i < poses.length; i++) {
        currentPoses.push(poses[i]);
      }

      // 実用に耐えうる信頼度でフィルター (スコア 0.25 以上のキーポイントが存在するか)
      isPerson = currentPoses.some(pose => {
        const score = pose.score ?? 0;
        if (score >= 0.25) return true;
        return pose.keypoints.some(kp => (kp.score ?? 0) >= 0.25);
      });

    } catch (error: unknown) {
      errorMessage = error instanceof Error ? error.message : 'Unknown worker error';
    } finally {
      // 転送された ImageBitmap を確実にクローズ解放
      imageBitmap.close();

      // バッファ配列の要素参照を切ってメモリ解放
      for (let i = 0; i < currentPoses.length; i++) {
        (currentPoses as any)[i] = null;
      }
      currentPoses.length = 0;
    }

    const result: WorkerResultMessage = {
      id,
      isPerson,
      rect,
      ...(errorMessage ? { error: errorMessage } : {})
    };
    self.postMessage(result);
  }
};
