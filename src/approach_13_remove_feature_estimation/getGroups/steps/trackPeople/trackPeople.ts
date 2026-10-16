import { GroupDetectionImageSource, Person } from '../../types';
import { TrackedPerson } from './TrackedPerson';
import { getFps } from './measureFps';

const trackedPeoplePool: TrackedPerson[] = [];

export async function trackPeople(
  imageSource: GroupDetectionImageSource,
  detectedPeople: Person[],
  timestamp: number
): Promise<Person[]> {
  const fps = getFps();

  const matchedDetectedIndices = new Set<number>();

  for (let i = 0; i < trackedPeoplePool.length; i++) {
    const tracked = trackedPeoplePool[i];
    const latestPerson = tracked.latestPerson;
    if (!latestPerson || !latestPerson.boundingBox) continue;

    const prevBbox = latestPerson.boundingBox;
    const prevCx = prevBbox.originX + prevBbox.width / 2;
    const prevCy = prevBbox.originY + prevBbox.height / 2;
    const bboxMinDim = Math.min(prevBbox.width, prevBbox.height);

    const frameDurationSec = 1 / fps;
    const searchRadius = bboxMinDim * frameDurationSec;

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

      const combinedScore = dist / searchRadius;

      if (combinedScore < bestScore) {
        bestScore = combinedScore;
        bestMatchIdx = j;
      }
    }

    if (bestMatchIdx !== -1) {
      matchedDetectedIndices.add(bestMatchIdx);

      await tracked.updateFrame(
        detectedPeople[bestMatchIdx],
        timestamp
      );
    } else {
      await tracked.updateFrame(undefined, timestamp);
    }
  }

  for (let j = 0; j < detectedPeople.length; j++) {
    if (!matchedDetectedIndices.has(j)) {
      const newTracked = new TrackedPerson(detectedPeople[j], timestamp);
      await newTracked.updateFrame(detectedPeople[j], timestamp);
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
    const personWithId = tracked.getPersonWithId();
    if (personWithId) {
      queueMembers.push(personWithId);
    }
  }

  return queueMembers;
}
