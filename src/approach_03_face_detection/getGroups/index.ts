import { Groups, GroupDetectionImageSource } from './types';
import { detectPeople } from './detectPeople';
import { convertToGroups } from './convertToGroups';

// グループの検出 (人物をグループに見せかけてそのまま返す)
export async function getGroups(imageSource: GroupDetectionImageSource): Promise<Groups> {

  if (!imageSource) throw new Error("No input data exists");

  try {
    const detections = await detectPeople(imageSource);
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

export * from './types';
