import { Groups, GroupDetectionImageSource, Person } from './types';
import { detectPeople } from './detectPeople';
import { detectPoses } from './detectPoses';
import { convertToGroups } from './convertToGroups';

// スコープ外で一度だけ配列を生成
// OOM対策
const reusablePeople: Person[] = [];

// グループの検出 (人物をグループに見せかけてそのまま返す)
export async function getGroups(imageSource: GroupDetectionImageSource): Promise<Groups> {

  if (!imageSource) throw new Error("No input data exists");

  try {
    const peopleDetections = await detectPeople(imageSource, reusablePeople);
    const peopleWithPoses = await detectPoses(imageSource, peopleDetections);
    const groups = convertToGroups(peopleWithPoses);
    return groups;
  } catch (error) {
    throw new Error("Detection error", { cause: error });
  }
}

export type { Person, Group, Groups, GroupDetectionImageSource, Detection, BoundingBox } from './types';