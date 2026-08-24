import { Groups, GroupDetectionImageSource, Detection } from './types';
import { detectPeople } from './detectPeople';
import { convertToGroups } from './convertToGroups';

// スコープ外で一度だけ配列を生成
// OOM対策
const reusableDetections: Detection[] = [];

// グループの検出 (人物をグループに見せかけてそのまま返す)
export async function getGroups(imageSource: GroupDetectionImageSource): Promise<Groups> {

  if (!imageSource) throw new Error("No input data exists");

  try {
    const detections = await detectPeople(imageSource, reusableDetections);
    const people = detections.map(detection => {
      // boundingBoxから angle を取り出し、残りを rest（新しいオブジェクト）に格納
      const { angle, ...rest } = detection.boundingBox!;
      return rest; // angleが含まれないオブジェクトのコピーを返す
    });
    const groups = convertToGroups(people);
    return groups;
  } catch (error) {
    throw new Error("Detection error", { cause: error });
  }
}

export type { Group, Groups, GroupDetectionImageSource, Detection, BoundingBox } from './types';
