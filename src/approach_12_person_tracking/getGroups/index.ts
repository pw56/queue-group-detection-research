import { Groups, GroupDetectionImageSource, Person } from './types';
import { detectPeople } from './steps/detectPeople';
import { detectPoses } from './steps/detectPoses';
import { trackPeopleStep } from './steps/trackPeople';
import { groupPeople } from './steps/groupPeople';

/**
 * 画像から人物およびそのポーズ・向きを検出し、グループ分けを行って返す
 */
export async function getGroups(imageSource: GroupDetectionImageSource): Promise<Groups> {
  if (!imageSource) {
    throw new Error("No input data exists");
  }

  try {
    const peopleDetections = await detectPeople(imageSource);
    const peopleWithPoses = await detectPoses(imageSource, peopleDetections);
    const trackedQueuePeople = await trackPeopleStep(imageSource, peopleWithPoses);
    const groups = groupPeople(trackedQueuePeople);
    return groups;
  } catch (error) {
    throw new Error("Detection error", { cause: error });
  }
}

export type { Person, Group, Groups, GroupDetectionImageSource, BoundingBoxRect } from './types';
