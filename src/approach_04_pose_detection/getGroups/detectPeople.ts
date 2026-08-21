import { PoseLandmarker, FilesetResolver } from '@mediapipe/tasks-vision';
import { GroupDetectionImageSource, Group } from './types';

let poseLandmarker: PoseLandmarker | null = null;

// Detectorの初期化
async function initializeDetector(): Promise<void> {
  // 同時呼び出しによる競合を防止
  if (!poseLandmarker) {
    // @mediapipe/tasks-vision のwasmファイル群が配置されている正しいパスを指定
    const vision = await FilesetResolver.forVisionTasks(
      "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision/wasm"
    );
    
    poseLandmarker = await PoseLandmarker.createFromOptions(vision, {
      baseOptions: {
        modelAssetPath: "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/latest/pose_landmarker_lite.task",
        delegate: "GPU" // パフォーマンス向上のためGPUを優先（利用可能な場合）
      },
      runningMode: "IMAGE"
    });
  }
}

// 人物の検出
export async function detectPeople(imageSource: GroupDetectionImageSource): Promise<Group> {

  // 初期化
  if (!poseLandmarker)
    await initializeDetector();

  // 入力が存在しない場合は終了
  if (!imageSource) throw new Error("No input data exists");

  try {
    const result = poseLandmarker!.detect(imageSource);
    const width = imageSource.naturalWidth || imageSource.width;
    const height = imageSource.naturalHeight || imageSource.height;

    const people: Group = result.landmarks.map((landmarks) => {
      const xCoords = landmarks.map((lm) => lm.x * width);
      const yCoords = landmarks.map((lm) => lm.y * height);

      const xMin = Math.min(...xCoords);
      const xMax = Math.max(...xCoords);
      const yMin = Math.min(...yCoords);
      const yMax = Math.max(...yCoords);

      return {
        boundingBox: {
          originX: xMin,
          originY: yMin,
          width: xMax - xMin,
          height: yMax - yMin,
        },
      };
    });

    return people;
  } catch (error) {
    throw new Error("Detection error", { cause: error });
  }
}
