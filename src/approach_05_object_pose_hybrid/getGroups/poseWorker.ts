import * as tf from '@tensorflow/tfjs';
import { createDetector, SupportedModels, Pose } from '@tensorflow-models/pose-detection/dist';
import { WorkerIncomingMessage, WorkerResultMessage } from './types';

let detector: any = null;
let offscreenCanvas: OffscreenCanvas | null = null;
let offscreenCtx: OffscreenCanvasRenderingContext2D | null = null;

// OOM防止のためスコープ外で宣言・使い回すバッファ変数
let currentPoses: Pose[] = [];

async function initWorker(width: number, height: number) {
  if (!offscreenCanvas) {
    // 初回のみ1つだけOffscreenCanvasインスタンスを生成
    offscreenCanvas = new OffscreenCanvas(width, height);
    offscreenCtx = offscreenCanvas.getContext('2d', { willReadFrequently: true });
  } else {
    // 2回目以降は再生成せずサイズ指定の変更のみで使い回す
    offscreenCanvas.width = width;
    offscreenCanvas.height = height;
  }

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
    } catch (err: any) {
      console.error('Worker init error:', err);
    }
    return;
  }

  if (data.type === 'PROCESS') {
    const { id, imageBitmap, rect } = data;
    let isPerson = false;
    let errorMessage: string | undefined = undefined;

    try {
      if (!offscreenCanvas || !offscreenCtx || !detector) {
        throw new Error('Worker is not initialized');
      }

      // 既存キャンバスのリサイズと描画
      offscreenCanvas.width = imageBitmap.width;
      offscreenCanvas.height = imageBitmap.height;
      offscreenCtx.clearRect(0, 0, imageBitmap.width, imageBitmap.height);
      offscreenCtx.drawImage(imageBitmap, 0, 0);

      // ポーズ検出実行（スコープ外バッファの参照を再利用）
      currentPoses.length = 0;
      const poses = await detector.estimatePoses(offscreenCanvas);
      for (let i = 0; i < poses.length; i++) {
        currentPoses.push(poses[i]);
      }

      // 実用に耐えうる信頼度でフィルター (スコア 0.25 以上のキーポイントが存在するか)
      isPerson = currentPoses.some(pose => {
        const score = pose.score ?? 0;
        if (score >= 0.25) return true;
        return pose.keypoints.some(kp => (kp.score ?? 0) >= 0.25);
      });

    } catch (error: any) {
      errorMessage = error?.message || 'Unknown worker error';
    } finally {
      // どのような経路を通っても ImageBitmap は確実にクローズ解放する
      imageBitmap.close();

      // バッファ配列の要素参照を解除してメモリ解放を補助
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
