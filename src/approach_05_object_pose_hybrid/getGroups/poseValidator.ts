import { PoseLandmarker, FilesetResolver } from '@mediapipe/tasks-vision';

// OOM防止のために結果オブジェクト用の変数をスコープ外で保持・再利用
let poseResultCache: any = null;

export class PoseValidator {
  #poseLandmarker: PoseLandmarker | null = null;
  #offscreenCanvas: HTMLCanvasElement | OffscreenCanvas | null = null;
  #offscreenCtx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null = null;

  async initialize(): Promise<void> {
    if (!this.#poseLandmarker) {
      const vision = await FilesetResolver.forVisionTasks(
        "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision/wasm"
      );
      this.#poseLandmarker = await PoseLandmarker.createFromOptions(vision, {
        baseOptions: {
          modelAssetPath: "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task",
          delegate: "GPU"
        },
        runningMode: "IMAGE"
      });
    }

    if (!this.#offscreenCanvas) {
      if (typeof OffscreenCanvas !== 'undefined') {
        this.#offscreenCanvas = new OffscreenCanvas(1, 1);
      } else {
        this.#offscreenCanvas = document.createElement('canvas');
      }
      this.#offscreenCtx = this.#offscreenCanvas.getContext('2d') as any;
    }
  }

  async validateCrop(imageBitmap: ImageBitmap): Promise<boolean> {
    if (!this.#poseLandmarker || !this.#offscreenCanvas || !this.#offscreenCtx) {
      throw new Error("PoseValidator is not initialized");
    }

    try {
      this.#offscreenCanvas.width = imageBitmap.width;
      this.#offscreenCanvas.height = imageBitmap.height;
      this.#offscreenCtx.clearRect(0, 0, imageBitmap.width, imageBitmap.height);
      this.#offscreenCtx.drawImage(imageBitmap, 0, 0);

      // GPU経由でPose検出を実行 (スコープ外の変数に格納)
      poseResultCache = this.#poseLandmarker.detect(this.#offscreenCanvas);

      let isValid = false;
      if (poseResultCache && poseResultCache.landmarks && poseResultCache.landmarks.length > 0) {
        isValid = true;
      }

      // 参照クリア
      poseResultCache = null;
      return isValid;
    } catch (error) {
      poseResultCache = null;
      return false;
    } finally {
      try {
        imageBitmap.close();
      } catch (_) {}
    }
  }

  close(): void {
    if (this.#poseLandmarker) {
      this.#poseLandmarker.close();
      this.#poseLandmarker = null;
    }
    this.#offscreenCanvas = null;
    this.#offscreenCtx = null;
  }
}
