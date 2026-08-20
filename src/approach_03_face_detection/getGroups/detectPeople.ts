import { FaceDetector, FilesetResolver, Detection, Category } from '@mediapipe/tasks-vision';
import { GroupDetectionImageSource } from './types';

let faceDetector: FaceDetector | null = null;

// Detectorの初期化
async function initializeDetector(): Promise<void> {
  // 同時呼び出しによる競合を防止
  if (!faceDetector) {
    // @mediapipe/tasks-vision のwasmファイル群が配置されている正しいパスを指定
    const vision = await FilesetResolver.forVisionTasks(
      "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision/wasm"
    );
    
    faceDetector = await FaceDetector.createFromOptions(vision, {
      baseOptions: {
        modelAssetPath: "https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/1/blaze_face_short_range.tflite", // 実際の.tfliteモデルのURLを指定
        delegate: "GPU" // パフォーマンス向上のためGPUを優先（利用可能な場合）
      },
      runningMode: "IMAGE"
    });
  }
}

// 人物の検出
export async function detectPeople(imageSource: GroupDetectionImageSource): Promise<Detection[]> {

  // 初期化
  if (!faceDetector)
    await initializeDetector();

  // 入力が存在しない場合は終了
  if (!imageSource) throw new Error("No input data exists");

  try {
    const result = faceDetector!.detect(imageSource);
    
    const people = result.detections.filter((detection: Detection) => {
      return detection.categories.some((category: Category) => {
        // 信頼度（スコア）で人物のみに絞り込む
        return category.score >= 0.5;
      });
    });

    return people;
  } catch (error) {
    throw new Error("Detection error", { cause: error });
  }
}
