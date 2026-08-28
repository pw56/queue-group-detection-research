import { GroupDetectionImageSource, Person } from '../types';
import { workerPoolManager } from '../workers';

// 人物の検出
export async function detectPeople(
  imageSource: GroupDetectionImageSource,
  outResult: Person[] = []
): Promise<Person[]> {
  if (!imageSource) throw new Error("No input data exists");

  const imgWidth = imageSource.naturalWidth || imageSource.width;
  const imgHeight = imageSource.naturalHeight || imageSource.height;

  let imageBitmap: ImageBitmap | null = null;
  try {
    imageBitmap = await createImageBitmap(imageSource);
    const people = await workerPoolManager.processPeopleDetection(
      imageBitmap,
      imgWidth,
      imgHeight
    );

    outResult.length = 0;
    for (let i = 0; i < people.length; i++) {
      outResult.push(people[i]);
    }

    return outResult;
  } catch (error) {
    throw new Error("Detection error", { cause: error });
  } finally {
    if (imageBitmap) {
      imageBitmap.close();
    }
  }
}
