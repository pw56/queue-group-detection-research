import * as tf from '@tensorflow/tfjs';
import { createDetector, SupportedModels, Pose } from '@tensorflow-models/pose-detection/dist';
import { WorkerIncomingMessage, WorkerResultMessage } from './types';

let detector: any = null;

// OOM防止のためスコープ外で宣言・使い回すバッファ変数
let currentPoses: Pose[] = [];

// 小さすぎるビットマップの拡大用固定キャンバス（ワーカーごとに1つ保持して使い回す）
const MIN_INPUT_SIZE = 256;
const workerCanvas = new OffscreenCanvas(MIN_INPUT_SIZE, MIN_INPUT_SIZE);
const workerCtx = workerCanvas.getContext('2d', { willReadFrequently: true });

async function initWorker(width: number, height: number) {
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
    let inputBitmapToEstimate: ImageBitmap | null = null;

    // 推論時に生成されるTensorを管理・解放するためのTensorFlowスコープの準備
    tf.engine().startScope();

    try {
      if (!detector) {
        throw new Error('Worker is not initialized');
      }

      // ポーズ検出実行（スコープ外バッファの参照を再利用）
      for (let i = 0; i < currentPoses.length; i++) {
        (currentPoses as any)[i] = null;
      }
      currentPoses.length = 0;

      const origWidth = imageBitmap.width;
      const origHeight = imageBitmap.height;
      let isResized = false;

      // 切り取ったのがモデルの入力用として小さすぎる場合は拡大
      if (origWidth < MIN_INPUT_SIZE || origHeight < MIN_INPUT_SIZE) {
        if (workerCtx) {
          workerCtx.clearRect(0, 0, MIN_INPUT_SIZE, MIN_INPUT_SIZE);
          workerCtx.drawImage(imageBitmap, 0, 0, MIN_INPUT_SIZE, MIN_INPUT_SIZE);
          // ビットマップで指定範囲で切り出して、通常時と同じようにモデルに渡す
          inputBitmapToEstimate = await createImageBitmap(workerCanvas, 0, 0, MIN_INPUT_SIZE, MIN_INPUT_SIZE);
          isResized = true;
        } else {
          inputBitmapToEstimate = imageBitmap;
        }
      } else {
        inputBitmapToEstimate = imageBitmap;
      }

      // キャンバスを介さず、マネージャーから渡された imageBitmap を直接推論に渡す
      const poses = await detector.estimatePoses(inputBitmapToEstimate);
      for (let i = 0; i < poses.length; i++) {
        currentPoses.push(poses[i]);
      }

      // 拡大した場合はスケール比率を計算し、検出結果（キーポイント・バウンディングボックス）の座標を元の数値に逆変換する
      if (isResized) {
        const scaleX = origWidth / MIN_INPUT_SIZE;
        const scaleY = origHeight / MIN_INPUT_SIZE;

        for (let i = 0; i < currentPoses.length; i++) {
          const pose = currentPoses[i];
          if (pose.keypoints) {
            for (let j = 0; j < pose.keypoints.length; j++) {
              const kp = pose.keypoints[j];
              kp.x = kp.x * scaleX;
              kp.y = kp.y * scaleY;
            }
          }
          if (pose.box) {
            pose.box.xMin = pose.box.xMin * scaleX;
            pose.box.yMin = pose.box.yMin * scaleY;
            pose.box.xMax = pose.box.xMax * scaleX;
            pose.box.yMax = pose.box.yMax * scaleY;
            pose.box.width = pose.box.width * scaleX;
            pose.box.height = pose.box.height * scaleY;
          }
        }
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
      // 推論過程で保持された不要なTensorメモリを一括解放
      tf.engine().endScope();

      // 生成した一時ビットマップがあればクローズ解放
      if (inputBitmapToEstimate && inputBitmapToEstimate !== imageBitmap) {
        inputBitmapToEstimate.close();
      }

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
