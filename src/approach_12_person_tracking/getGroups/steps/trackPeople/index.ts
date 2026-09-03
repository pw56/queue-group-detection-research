import { GroupDetectionImageSource, Person } from '../../types';
import { updateFps } from './measureFps';
import { trackPeople as trackPeopleInternal } from './trackPeople';

export async function trackPeopleStep(
  imageSource: GroupDetectionImageSource,
  detectedPeople: Person[]
): Promise<Person[]> {
  const currentTimestamp = performance.now();
  updateFps(currentTimestamp);

  return await trackPeopleInternal(imageSource, detectedPeople, currentTimestamp);
}
