import { Person, DirectionVector } from '../types';

export interface QueueLine {
  /** 列の代表点 (中心など) */
  origin: { x: number; y: number };
  /** 列の方向を示す単位ベクトル (dx, dy) */
  direction: DirectionVector;
}

/**
 * バウンディングボックスの横幅（手前が大きい）から
 * 最手前と最奥の点を取り、列の方向ベクトルを求めるアルゴリズム
 */
export function estimateQueueLine(people: Person[]): QueueLine | null {
  if (!people || people.length === 0) {
    return null;
  }

  let maxPerson: Person | null = null;
  let minPerson: Person | null = null;
  let maxWidth = -1;
  let minWidth = Infinity;

  // 1. バウンディングボックスの横幅が最大（最手前）と最小（最奥）の人物を特定
  for (let i = 0; i < people.length; i++) {
    const box = people[i].boundingBox;
    if (box) {
      if (box.width > maxWidth) {
        maxWidth = box.width;
        maxPerson = people[i];
      }
      if (box.width < minWidth) {
        minWidth = box.width;
        minPerson = people[i];
      }
    }
  }

  if (!maxPerson || !minPerson || !maxPerson.boundingBox || !minPerson.boundingBox) {
    return null;
  }

  // 2. 代表点（手前人物と奥人物の位置座標）を取得
  const startX = maxPerson.boundingBox.originX + maxPerson.boundingBox.width / 2;
  const startY = maxPerson.boundingBox.originY + maxPerson.boundingBox.height;

  const endX = minPerson.boundingBox.originX + minPerson.boundingBox.width / 2;
  const endY = minPerson.boundingBox.originY + minPerson.boundingBox.height;

  // 3. 手前から奥へ向かう方向ベクトルの算出
  const vx = endX - startX;
  const vy = endY - startY;
  const len = Math.hypot(vx, vy);

  const direction: DirectionVector = len > 0 
    ? { x: vx / len, y: vy / len }
    : { x: 0, y: 0 };

  return {
    origin: { x: startX, y: startY },
    direction
  };
}
