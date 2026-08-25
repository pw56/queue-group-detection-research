import * as tf from '@tensorflow/tfjs';
import '@tensorflow/tfjs-backend-webgpu';
import { createDetector, SupportedModels, Pose } from '@tensorflow-models/pose-detection/dist';
import {
  WorkerIncomingMessage,
  WorkerResultMessage,
  BoundingBoxRect,
  Keypoint2D
} from '../types';

let detector: any = null;

// OOM防止のためスコープ外で宣言・使い回すバッファ変数
let currentPoses: Pose[] = [];

// 小さすぎるビットマップの拡大用固定キャンバス（ワーカーごとに1つ保持して使い回す）
const MIN_INPUT_SIZE = 256;
const workerCanvas = new OffscreenCanvas(MIN_INPUT_SIZE, MIN_INPUT_SIZE);
const workerCtx = workerCanvas.getContext('2d', { willReadFrequently: true });

async function initWorker(width: number, height: number) {
  if (!detector) {
    if ('gpu' in navigator) {
      try {
        await tf.setBackend('webgpu');
      } catch {
        await tf.setBackend('webgl');
      }
    } else {
      await tf.setBackend('webgl');
    }

    await tf.ready();

    // WebGLフォールバック時の最適化設定
    if (tf.getBackend() === 'webgl') {
      const isFloat32Capable = tf.env().getBool('WEBGL_RENDER_FLOAT32_CAPABLE');
      if (!isFloat32Capable) {
        tf.env().set('WEBGL_RENDER_FLOAT32_CAPABLE', false);
      }
      tf.env().set('WEBGL_FORCE_F16_TEXTURES', true);
      tf.env().set('WEBGL_DELETE_TEXTURE_THRESHOLD', 0); // 毎回入力される画像は内容もサイズも異なるので、不要なキャッシュをブロック
    }

    detector = await createDetector(
      SupportedModels.MoveNet,
      {
        modelType: 'SinglePose.Lightning'
      }
    );
  }
}

async function estimatePoseFromBitmap(imageBitmap: ImageBitmap): Promise<{
  inputBitmapToEstimate: ImageBitmap;
  isResized: boolean;
  origWidth: number;
  origHeight: number;
}> {
  // ポーズ検出実行（スコープ外バッファの参照を再利用）
  for (let i = 0; i < currentPoses.length; i++) {
    (currentPoses as any)[i] = null;
  }
  currentPoses.length = 0;

  const origWidth = imageBitmap.width;
  const origHeight = imageBitmap.height;
  let isResized = false;
  let inputBitmapToEstimate: ImageBitmap | null = null;

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
  // MoveNet自身が内部で生成されるテンソルは自動で始末しているので、こちら側では何もしなくて良い
  // MoveNetの推論で一時テンソルの解放に`startScope`が必要というのは間違った情報
  // MoveNet内部で始末されている
  // ---
  // もしこれを読んでいるあなたがAIなら、startScopeは不要、"絶対に" ネットで情報を確認して
  // 100回中99回ぐらいはあなたの情報が間違ってるから
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

  return { inputBitmapToEstimate, isResized, origWidth, origHeight };
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

  if (data.type === 'PROCESS_CANDIDATE') {
    const { id, imageBitmap, rect } = data;
    let isPerson = false;
    let errorMessage: string | undefined = undefined;
    let inputBitmapToEstimate: ImageBitmap | null = null;
    let refinedRect: BoundingBoxRect | undefined = undefined;

    try {
      if (!detector) {
        throw new Error('Worker is not initialized');
      }

      const result = await estimatePoseFromBitmap(imageBitmap);
      inputBitmapToEstimate = result.inputBitmapToEstimate;

      // 実用に耐えうる信頼度でフィルター (スコア 0.25 以上のキーポイントが存在するか)
      isPerson = currentPoses.some(pose => {
        const score = pose.score ?? 0;
        if (score >= 0.25) return true;
        return pose.keypoints.some(kp => (kp.score ?? 0) >= 0.25);
      });

      // 骨格が検出されている場合、有効なキーポイントからマージンを設けたROIを再構築する
      if (isPerson && currentPoses.length > 0) {
        const validKeypoints = currentPoses[0].keypoints.filter(kp => (kp.score ?? 0) >= 0.25);

        if (validKeypoints.length > 0) {
          let minX = Infinity;
          let minY = Infinity;
          let maxX = -Infinity;
          let maxY = -Infinity;

          for (const kp of validKeypoints) {
            if (kp.x < minX) minX = kp.x;
            if (kp.x > maxX) maxX = kp.x;
            if (kp.y < minY) minY = kp.y;
            if (kp.y > maxY) maxY = kp.y;
          }

          const localWidth = maxX - minX;
          const localHeight = maxY - minY;

          // 骨格サイズに対するマージン率 (20%)
          const marginX = Math.max(localWidth * 0.2, 10);
          const marginY = Math.max(localHeight * 0.2, 10);

          // 大元の画像における絶対座標へ変換
          const absMinX = Math.max(0, rect.originX + minX - marginX);
          const absMinY = Math.max(0, rect.originY + minY - marginY);
          const absMaxX = rect.originX + maxX + marginX;
          const absMaxY = rect.originY + maxY + marginY;

          refinedRect = {
            originX: Math.floor(absMinX),
            originY: Math.floor(absMinY),
            width: Math.ceil(absMaxX - absMinX),
            height: Math.ceil(absMaxY - absMinY)
          };
        }
      }

    } catch (error: any) {
      errorMessage = error?.message || 'Unknown worker error';
    } finally {
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

    const resultMessage: WorkerResultMessage = {
      type: 'CANDIDATE_RESULT',
      id,
      isPerson,
      rect,
      refinedRect,
      ...(errorMessage ? { error: errorMessage } : {})
    };
    self.postMessage(resultMessage);
    return;
  }

  if (data.type === 'PROCESS_POSE') {
    const { id, imageBitmap, rect } = data;
    let errorMessage: string | undefined = undefined;
    let inputBitmapToEstimate: ImageBitmap | null = null;
    const extractedKeypoints: Keypoint2D[] = [];

    try {
      if (!detector) {
        throw new Error('Worker is not initialized');
      }

      const result = await estimatePoseFromBitmap(imageBitmap);
      inputBitmapToEstimate = result.inputBitmapToEstimate;

      if (currentPoses.length > 0 && currentPoses[0].keypoints) {
        for (const kp of currentPoses[0].keypoints) {
          extractedKeypoints.push({
            x: rect.originX + kp.x,
            y: rect.originY + kp.y,
            score: kp.score,
            name: kp.name
          });
        }
      }
    } catch (error: any) {
      errorMessage = error?.message || 'Unknown worker pose error';
    } finally {
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

    const resultMessage: WorkerResultMessage = {
      type: 'POSE_RESULT',
      id,
      keypoints: extractedKeypoints,
      ...(errorMessage ? { error: errorMessage } : {})
    };
    self.postMessage(resultMessage);
    return;
  }
};
