import { ObjectDetector, PoseLandmarker, FilesetResolver, Detection, Category } from '@mediapipe/tasks-vision';
import { GroupDetectionImageSource } from './types';

// OOM防止のために再利用するキャンバスインスタンス
let sharedCanvas: HTMLCanvasElement | null = null;
let sharedCtx: CanvasRenderingContext2D | null = null;

class DetectorManager {
  #objectDetector: ObjectDetector | null = null;
  #poseLandmarker: PoseLandmarker | null = null;
  #initPromise: Promise<void> | null = null;

  async #initialize(): Promise<void> {
    if (this.#objectDetector && this.#poseLandmarker) return;

    if (!this.#initPromise) {
      this.#initPromise = (async () => {
        const vision = await FilesetResolver.forVisionTasks(
          "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision/wasm"
        );

        const [detector, pose] = await Promise.all([
          ObjectDetector.createFromOptions(vision, {
            baseOptions: {
              modelAssetPath: "https://storage.googleapis.com/mediapipe-models/object_detector/efficientdet_lite0/float16/1/efficientdet_lite0.tflite", // 実際の.tfliteモデルのURLを指定
              delegate: "GPU" // パフォーマンス向上のためGPUを優先（利用可能な場合）
            },
            runningMode: "IMAGE"
          }),
          PoseLandmarker.createFromOptions(vision, {
            baseOptions: {
              modelAssetPath: "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task",
              delegate: "GPU"
            },
            runningMode: "IMAGE",
            numPoses: 1
          })
        ]);

        this.#objectDetector = detector;
        this.#poseLandmarker = pose;
      })();
    }

    await this.#initPromise;
  }

  async detect(imageSource: GroupDetectionImageSource): Promise<Detection[]> {
    if (!imageSource) throw new Error("No input data exists");

    await this.#initialize();

    const rawDetections = this.#objectDetector!.detect(imageSource);

    // 低い信頼度の人物候補を列挙
    const candidates = rawDetections.detections.filter((detection: Detection) => {
      return detection.categories.some((category: Category) => {
        return category.categoryName === 'person' && category.score >= 0.1;
      });
    });

    if (candidates.length === 0) {
      return [];
    }

    // 元画像のサイズから固定キャンバスのサイズを決める
    const width = imageSource.naturalWidth || imageSource.width;
    const height = imageSource.naturalHeight || imageSource.height;

    if (!sharedCanvas) {
      sharedCanvas = document.createElement('canvas');
    }
    if (sharedCanvas.width !== width || sharedCanvas.height !== height) {
      sharedCanvas.width = width;
      sharedCanvas.height = height;
    }

    if (!sharedCtx) {
      sharedCtx = sharedCanvas.getContext('2d', { willReadFrequently: true });
    }

    if (!sharedCtx) {
      throw new Error("Failed to get 2D context");
    }

    sharedCtx.clearRect(0, 0, width, height);
    sharedCtx.drawImage(imageSource, 0, 0, width, height);

    // バウンディングボックス列挙で出た候補を並列処理
    const verifiedCandidates = await Promise.all(
      candidates.map(async (candidate) => {
        const box = candidate.boundingBox;
        if (!box) return null;

        // 元のバウンディングボックスの範囲で切り出し（マージンなし）
        const cropX = Math.max(0, Math.floor(box.originX));
        const cropY = Math.max(0, Math.floor(box.originY));
        const cropWidth = Math.min(width - cropX, Math.floor(box.width));
        const cropHeight = Math.min(height - cropY, Math.floor(box.height));

        if (cropWidth <= 0 || cropHeight <= 0) return null;

        let bitmap: ImageBitmap | null = null;
        try {
          bitmap = await createImageBitmap(sharedCanvas!, cropX, cropY, cropWidth, cropHeight);
          const poseResult = this.#poseLandmarker!.detect(bitmap);

          // ポーズ検出により、実用に耐えうる信頼度でフィルタリング
          if (poseResult.landmarks && poseResult.landmarks.length > 0) {
            return candidate;
          }
          return null;
        } catch {
          return null;
        } finally {
          // 明示的なメモリ解放
          if (bitmap) {
            bitmap.close();
          }
        }
      })
    );

    return verifiedCandidates.filter((item): item is Detection => item !== null);
  }
}

const manager = new DetectorManager();

// 人物の検出
export async function detectPeople(imageSource: GroupDetectionImageSource): Promise<Detection[]> {
  try {
    return await manager.detect(imageSource);
  } catch (error) {
    throw new Error("Detection error", { cause: error });
  }
}
