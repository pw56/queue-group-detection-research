import { GroupDetectionImageSource, Person, Keypoint2D, DirectionVector, BoundingBoxRect } from './types';
import { workerPoolManager } from './workers';

// キーポイントから身体の向き（2Dベクトル）を算出する関数
function calculateBodyDirection(keypoints: Keypoint2D[]): DirectionVector {
  if (!keypoints || keypoints.length === 0) {
    return { x: 0, y: 0 };
  }

  const findKp = (name: string) => keypoints.find(k => k.name === name && (k.score ?? 0) >= 0.2);

  const leftShoulder = findKp('left_shoulder');
  const rightShoulder = findKp('right_shoulder');
  const nose = findKp('nose');

  let vecX = 0;
  let vecY = 0;

  // 1. 両肩の結ぶ線に直交するベクトル（法線ベクトル）から胸の前方向を算出
  if (leftShoulder && rightShoulder) {
    const dx = leftShoulder.x - rightShoulder.x;
    const dy = leftShoulder.y - rightShoulder.y;
    // 90度回転させて体の前方ベクトルを取得 (-dy, dx)
    vecX = -dy;
    vecY = dx;
  }

  // 2. 鼻の向きとの補正
  if (nose && leftShoulder && rightShoulder) {
    const midShoulderX = (leftShoulder.x + rightShoulder.x) / 2;
    const midShoulderY = (leftShoulder.y + rightShoulder.y) / 2;

    const noseVecX = nose.x - midShoulderX;
    const noseVecY = nose.y - midShoulderY;

    // 肩の法線と鼻の向きの内積が逆向き（マイナス）の場合、向きを反転させる
    if (vecX * noseVecX + vecY * noseVecY < 0) {
      vecX = -vecX;
      vecY = -vecY;
    }
  }

  // ベクトルの正規化
  const len = Math.hypot(vecX, vecY);
  if (len > 0) {
    vecX /= len;
    vecY /= len;
  }

  return { x: vecX, y: vecY };
}

// 検出された人物群に対し、ポーズ情報と向きベクトルを付加する関数
export async function detectPoses(
  imageSource: GroupDetectionImageSource,
  people: Person[]
): Promise<Person[]> {
  if (!people || people.length === 0) return [];

  const imgWidth = imageSource.naturalWidth || imageSource.width;
  const imgHeight = imageSource.naturalHeight || imageSource.height;

  const canvas = document.createElement('canvas');
  canvas.width = imgWidth;
  canvas.height = imgHeight;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });

  if (!ctx) {
    throw new Error('Failed to get 2d context for pose detection');
  }

  ctx.drawImage(imageSource, 0, 0);

  const posePromises = people.map(async (person, index) => {
    if (!person.boundingBox) return person;

    const bbox = person.boundingBox;
    const sx = Math.max(0, Math.floor(bbox.originX));
    const sy = Math.max(0, Math.floor(bbox.originY));
    const sw = Math.min(imgWidth - sx, Math.floor(bbox.width));
    const sh = Math.min(imgHeight - sy, Math.floor(bbox.height));

    if (sw <= 0 || sh <= 0) return person;

    const rect: BoundingBoxRect = { originX: sx, originY: sy, width: sw, height: sh };
    const imageBitmap = await createImageBitmap(canvas, sx, sy, sw, sh);

    try {
      const res = await workerPoolManager.processPose(
        imageBitmap,
        rect,
        index,
        imgWidth,
        imgHeight
      );

      const keypoints = res.keypoints;
      const direction = calculateBodyDirection(keypoints);

      return {
        ...person,
        keypoints,
        direction
      };
    } catch {
      return person;
    } finally {
      if (imageBitmap) {
        imageBitmap.close();
      }
    }
  });

  const updatedPeople = await Promise.all(posePromises);
  canvas.width = 0;
  canvas.height = 0;

  return updatedPeople;
}
