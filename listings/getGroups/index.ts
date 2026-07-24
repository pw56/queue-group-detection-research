import { Groups, GroupDetectionImageSource } from './types';
import { detectPeople } from './detectPeople';
import { convertToGroups } from './convertToGroups';

// グループの検出 (人物をグループに見せかけてそのまま返す)
export async function getGroups(imageSource: GroupDetectionImageSource): Promise<Groups> {

  if (!imageSource) throw new Error("No input data exists");

  try {
    const detections = await detectPeople(imageSource);
    const people = detections.map(detection => detection.boundingBox);
    const groups = convertToGroups(people);
    return groups;
  } catch (error) {
    throw new Error("Detection error", { cause: error });
  }
}

export * from './types';
