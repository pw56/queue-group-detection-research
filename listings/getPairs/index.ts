import detectPeople from './detectPeople';
import { Detection } from '@mediapipe/tasks-vision';

// グループ数の検出 (人数をそのまま返す)
async function getPairs(imageSource: TexImageSource): Promise<Detection[]> {

  if (!imageSource) throw new Error("No input data exists");

  try {
    return await detectPeople(imageSource);
  } catch (error) {
    throw new Error("Detection error", { cause: error });
  }
}

export default getPairs;
