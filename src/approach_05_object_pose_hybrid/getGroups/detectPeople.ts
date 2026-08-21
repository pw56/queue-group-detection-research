import { ObjectDetector, FilesetResolver, Detection, Category } from '@mediapipe/tasks-vision';
import { GroupDetectionImageSource } from './types';

let objectDetector: ObjectDetector | null = null;
let detectionResultsCache: any = null; // OOM防止用の結果用変数のスコープ外宣言

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
    // スコープ外の変数に一度格納
    detectionResultsCache = objectDetector!.detect(imageSource);
    
    const people = detectionResultsCache.detections.filter((detection: Detection) => {
      return detection.categories.some((category: Category) => {
        // 信頼度（スコア）で人物のみに絞り込む (後段のPoseLandmarkerで精査するため低いスコア 0.1 を採用)
        return category.categoryName === 'person' && category.score >= 0.1;
      });
    });

    // 参照をクリア
    detectionResultsCache = null;

    return people;
  } catch (error) {
    detectionResultsCache = null;
    throw new Error("Detection error", { cause: error });
  }
}
