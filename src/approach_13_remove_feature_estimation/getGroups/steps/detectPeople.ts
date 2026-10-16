import { GroupDetectionImageSource, Person } from '../types';
import { workerPoolManager } from '../workers';
import { cropImageAsImageBitmap } from '../utils/imageHelper';

// 人物の検出
export async function detectPeople(
  imageSource: GroupDetectionImageSource
): Promise<Person[]> {
  if (!imageSource) throw new Error("No input data exists");
  
  // 返却用の配列
  // 引数で配列渡してもらうOOM対策はバグの温床なので廃案にした
  const outResult: Person[] = [];

  const imgWidth = imageSource.naturalWidth || imageSource.width;
  const imgHeight = imageSource.naturalHeight || imageSource.height;

  let imageBitmap: ImageBitmap | null = null;
  try {
    imageBitmap = await cropImageAsImageBitmap(imageSource, 0, 0, imgWidth, imgHeight);
    const people = await workerPoolManager.processPeopleDetection(
      imageBitmap,
      imgWidth,
      imgHeight
    );

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
