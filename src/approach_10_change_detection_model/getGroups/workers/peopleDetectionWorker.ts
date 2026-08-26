import { resolvePublicPath } from '../../utils/resolvePublicPath';
import * as ort from 'onnxruntime-web';
import {
  WorkerIncomingMessage,
  WorkerResultMessage,
  BoundingBoxRect,
  Person
} from '../types';

let session: ort.InferenceSession | null = null;

const CONFIDENCE_THRESHOLD = 0.25;
const HORIZONTAL_OVERLAP_THRESHOLD = 0.8;
const MODEL_INPUT_SIZE = 640;

// OOM防止のための使い回しバッファ
let rawDetectionsBuffer: BoundingBoxRect[] = [];
let finalPeopleBuffer: Person[] = [];

// オフスクリーンキャンバス（入力画像のリサイズ・テンソル変換用）
const offscreenCanvas = new OffscreenCanvas(MODEL_INPUT_SIZE, MODEL_INPUT_SIZE);
const offscreenCtx = offscreenCanvas.getContext('2d', { willReadFrequently: true });

async function initWorker(): Promise<void> {
  if (!session) {
    // ONNX Runtime Webでアリーナ制限を無効化する設定オプション
    ort.env.wasm.numThreads = 1;
    
    session = await ort.InferenceSession.create(
      resolvePublicPath('/models/yolo12n.onnx'),
      {
        executionProviders: ['webgpu', 'wasm'],
        freeDimensionOverrides: {}
      }
    );
  }
}

function processDetections(
  boxes: BoundingBoxRect[]
): Person[] {
  for (let i = 0; i < finalPeopleBuffer.length; i++) {
    (finalPeopleBuffer as any)[i] = null;
  }
  finalPeopleBuffer.length = 0;

  if (boxes.length === 0) return finalPeopleBuffer;

  // 1. バウンディングボックスをX座標順で並び替える
  boxes.sort((a, b) => a.originX - b.originX);

  // 2〜4. 横方向の重なり判定とグループ化（ループ）
  while (boxes.length > 0) {
    const currentGroup: BoundingBoxRect[] = [boxes.shift()!];

    let i = 0;
    while (i < boxes.length) {
      const candidate = boxes[i];
      let shouldGroup = false;

      for (let j = 0; j < currentGroup.length; j++) {
        const target = currentGroup[j];

        // 横の重なり判定 (位置と幅の両方で閾値以上重なるか、内包はカウントしない)
        const x1 = Math.max(target.originX, candidate.originX);
        const x2 = Math.min(target.originX + target.width, candidate.originX + candidate.width);
        const overlapWidth = Math.max(0, x2 - x1);

        const targetRight = target.originX + target.width;
        const candidateRight = candidate.originX + candidate.width;

        // 内包チェック (一方がもう一方を完全に含んでいる場合は除外)
        const isTargetEnclosingCandidate =
          target.originX <= candidate.originX && targetRight >= candidateRight;
        const isCandidateEnclosingTarget =
          candidate.originX <= target.originX && candidateRight >= targetRight;

        if (!isTargetEnclosingCandidate && !isCandidateEnclosingTarget) {
          const minWidth = Math.min(target.width, candidate.width);
          if (minWidth > 0 && overlapWidth / minWidth >= HORIZONTAL_OVERLAP_THRESHOLD) {
            shouldGroup = true;
            break;
          }
        }
      }

      if (shouldGroup) {
        currentGroup.push(boxes.splice(i, 1)[0]);
      } else {
        i++;
      }
    }

    // 3. 全てのバウンディングボックスを内包する統合領域を計算
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;

    for (let k = 0; k < currentGroup.length; k++) {
      const box = currentGroup[k];
      if (box.originX < minX) minX = box.originX;
      if (box.originY < minY) minY = box.originY;
      if (box.originX + box.width > maxX) maxX = box.originX + box.width;
      if (box.originY + box.height > maxY) maxY = box.originY + box.height;
    }

    finalPeopleBuffer.push({
      boundingBox: {
        originX: minX,
        originY: minY,
        width: maxX - minX,
        height: maxY - minY
      }
    });
  }

  return finalPeopleBuffer;
}

self.onmessage = async (event: MessageEvent<WorkerIncomingMessage>) => {
  const data = event.data;

  if (data.type === 'INIT') {
    try {
      await initWorker();
    } catch (err: any) {
      console.error('People detection worker init error:', err);
    }
    return;
  }

  if (data.type === 'PROCESS_PEOPLE') {
    const { id, imageBitmap, imgWidth, imgHeight } = data;
    let errorMessage: string | undefined = undefined;

    // バッファクリア
    for (let i = 0; i < rawDetectionsBuffer.length; i++) {
      (rawDetectionsBuffer as any)[i] = null;
    }
    rawDetectionsBuffer.length = 0;

    let inputTensor: ort.Tensor | null = null;
    let results: ort.InferenceSession.OnnxValueMapType | null = null;

    try {
      if (!session) {
        throw new Error('People detection worker is not initialized');
      }

      if (offscreenCtx) {
        offscreenCtx.clearRect(0, 0, MODEL_INPUT_SIZE, MODEL_INPUT_SIZE);
        offscreenCtx.drawImage(imageBitmap, 0, 0, MODEL_INPUT_SIZE, MODEL_INPUT_SIZE);
        const imageData = offscreenCtx.getImageData(0, 0, MODEL_INPUT_SIZE, MODEL_INPUT_SIZE);
        const { data: pixels } = imageData;

        // RGBプレーンに正規化変換
        const red: number[] = [];
        const green: number[] = [];
        const blue: number[] = [];

        for (let i = 0; i < pixels.length; i += 4) {
          red.push(pixels[i] / 255.0);
          green.push(pixels[i + 1] / 255.0);
          blue.push(pixels[i + 2] / 255.0);
        }

        const float32Data = Float32Array.from([...red, ...green, ...blue]);
        inputTensor = new ort.Tensor('float32', float32Data, [1, 3, MODEL_INPUT_SIZE, MODEL_INPUT_SIZE]);

        results = await session.run({ images: inputTensor });
        const output = results[Object.keys(results)[0]];
        const outputData = output.data as Float32Array;

        // YOLOv12 Nano 出力のパース ([1, 84, 8400] -> [1, 8400, 84] 形式などに応じたパース)
        const scaleX = imgWidth / MODEL_INPUT_SIZE;
        const scaleY = imgHeight / MODEL_INPUT_SIZE;

        const numBoxes = 8400;
        for (let i = 0; i < numBoxes; i++) {
          const score = outputData[numBoxes * 4 + i]; // Person クラスのスコア
          if (score >= CONFIDENCE_THRESHOLD) {
            const cx = outputData[i] * scaleX;
            const cy = outputData[numBoxes + i] * scaleY;
            const w = outputData[numBoxes * 2 + i] * scaleX;
            const h = outputData[numBoxes * 3 + i] * scaleY;

            rawDetectionsBuffer.push({
              originX: Math.max(0, Math.floor(cx - w / 2)),
              originY: Math.max(0, Math.floor(cy - h / 2)),
              width: Math.ceil(w),
              height: Math.ceil(h)
            });
          }
        }
      }

      processDetections(rawDetectionsBuffer);
    } catch (error: any) {
      errorMessage = error?.message || 'Unknown people detection worker error';
    } finally {
      // ONNX Runtime テンソル明示的破棄
      if (inputTensor) {
        inputTensor.dispose();
      }
      if (results) {
        for (const key in results) {
          if (results[key]) {
            results[key].dispose();
          }
        }
      }
      imageBitmap.close();
    }

    const resultMessage: WorkerResultMessage = {
      type: 'PEOPLE_RESULT',
      id,
      people: finalPeopleBuffer,
      ...(errorMessage ? { error: errorMessage } : {})
    };

    self.postMessage(resultMessage);
  }
};
