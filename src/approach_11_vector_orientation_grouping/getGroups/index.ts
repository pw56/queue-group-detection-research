import { Groups, GroupDetectionImageSource, Person } from './types';
import { detectPeople } from './steps/detectPeople';
import { detectPoses } from './steps/detectPoses';
import { groupPeople } from './steps/groupPeople';

// スコープ外で一度だけ配列を生成（OOM対策）
const reusablePeople: Person[] = [];

/**
 * 画像から人物およびそのポーズ・向きを検出し、グループ分けを行って返す
 */
export async function getGroups(imageSource: GroupDetectionImageSource): Promise<Groups> {
  if (!imageSource) {
    throw new Error("No input data exists");
  }

  try {
    const peopleDetections = await detectPeople(imageSource, reusablePeople);
    const peopleWithPoses = await detectPoses(imageSource, peopleDetections);
    const groups = groupPeople(peopleWithPoses);
    return groups;
  } catch (error) {
    throw new Error("Detection error", { cause: error });
  }
}

export type { Person, Group, Groups, GroupDetectionImageSource, BoundingBoxRect } from './types';
