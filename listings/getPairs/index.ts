import { ObjectDetector, FilesetResolver, Detection, Category } from '@mediapipe/tasks-vision';

let objectDetector: ObjectDetector | null = null;

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

// グループ数の検出 (人数をそのまま返す)
async function getPairs(imageSource: TexImageSource): Promise<Detection[]> {

  // 初期化
  if (!objectDetector)
    await initializeDetector();

  // 入力が存在しない場合は終了
  if (!imageSource) throw new Error("No input data exists");

  try {
    const result = objectDetector!.detect(imageSource);
    
    const people = result.detections.filter((detection: Detection) => {
      return detection.categories.some((category: Category) => {
        // 信頼度（スコア）が50%以上の人物のみに絞り込む
        return category.categoryName === 'person' && category.score >= 0.5;
      });
    });

    return people;
  } catch (error) {
    console.error("Detection error:", error);
    throw new Error("Detection error");
  }
}

export default getPairs;
