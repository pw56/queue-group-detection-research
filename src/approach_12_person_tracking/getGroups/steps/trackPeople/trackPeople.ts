import { GroupDetectionImageSource, Person } from '../../types';
import { TrackedPerson } from './TrackedPerson';
import { extractFeatures, PersonBodyFeatures } from './extractFeatures';
import { getFps } from './measureFps';

const trackedPeoplePool: TrackedPerson[] = [];

export async function trackPeople(
  imageSource: GroupDetectionImageSource,
  detectedPeople: Person[],
  timestamp: number
): Promise<Person[]> {
  const imgWidth = imageSource.naturalWidth || imageSource.width || 1;
  const imgHeight = imageSource.naturalHeight || imageSource.height || 1;

  const fps = getFps();

  const detectedFeaturesList: PersonBodyFeatures[] = await Promise.all(
    detectedPeople.map((person) => extractFeatures(imageSource, person, imgWidth, imgHeight))
  );

  const matchedDetectedIndices = new Set<number>();
  const matchedTrackedIndices = new Set<number>();

  for (let i = 0; i < trackedPeoplePool.length; i++) {
    const tracked = trackedPeoplePool[i];
    const latestPerson = tracked.latestPerson;
    if (!latestPerson || !latestPerson.boundingBox) continue;

    const prevBbox = latestPerson.boundingBox;
    const prevCx = prevBbox.originX + prevBbox.width / 2;
    const prevCy = prevBbox.originY + prevBbox.height / 2;
    const bboxMinDim = Math.min(prevBbox.width, prevBbox.height);

    const searchRadius = Math.max(20, bboxMinDim * (30 / fps));

    let bestScore = Infinity;
    let bestMatchIdx = -1;

    for (let j = 0; j < detectedPeople.length; j++) {
      if (matchedDetectedIndices.has(j)) continue;

      const candidate = detectedPeople[j];
      if (!candidate.boundingBox) continue;

      const candBbox = candidate.boundingBox;
      const candCx = candBbox.originX + candBbox.width / 2;
      const candCy = candBbox.originY + candBbox.height / 2;

      const dist = Math.hypot(candCx - prevCx, candCy - prevCy);
      if (dist > searchRadius) continue;

      const colorDist = tracked.calculateColorMatchScore(detectedFeaturesList[j]);
      if (colorDist > 0.45) continue;

      const combinedScore = dist / searchRadius + colorDist;

      if (combinedScore < bestScore) {
        bestScore = combinedScore;
        bestMatchIdx = j;
      }
    }

    if (bestMatchIdx !== -1) {
      matchedDetectedIndices.add(bestMatchIdx);
      matchedTrackedIndices.add(i);

      await tracked.updateFrame(
        imageSource,
        detectedPeople[bestMatchIdx],
        timestamp,
        imgWidth,
        imgHeight
      );
    } else {
      await tracked.updateFrame(imageSource, undefined, timestamp, imgWidth, imgHeight);
    }
  }

  for (let j = 0; j < detectedPeople.length; j++) {
    if (!matchedDetectedIndices.has(j)) {
      const newTracked = new TrackedPerson(detectedPeople[j], timestamp);
      await newTracked.updateFrame(imageSource, detectedPeople[j], timestamp, imgWidth, imgHeight);
      trackedPeoplePool.push(newTracked);
    }
  }

  for (let i = trackedPeoplePool.length - 1; i >= 0; i--) {
    if (trackedPeoplePool[i].shouldBeRemoved()) {
      trackedPeoplePool.splice(i, 1);
    }
  }

  const queueMembers: Person[] = [];
  for (const tracked of trackedPeoplePool) {
    if (tracked.isQueueMember()) {
      const personWithId = tracked.getPersonWithId();
      if (personWithId) {
        queueMembers.push(personWithId);
      }
    }
  }

  return queueMembers;
}
