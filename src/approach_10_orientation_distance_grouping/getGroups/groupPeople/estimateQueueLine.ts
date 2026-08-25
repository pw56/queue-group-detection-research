import { Person, DirectionVector } from '../types';

export interface QueueLine {
  /** 列の代表点 (全体中心など) */
  origin: { x: number; y: number };
  /** 列の方向を示す単位ベクトル (dx, dy) */
  direction: DirectionVector;
}

/**
 * 1. 人物の底面座標の分布（PCA）により直線自体を推定
 * 2. バウンディングボックスの横幅（手前が大きい）によりベクトルの前後方向（正負）を確定
 */
export function estimateQueueLine(people: Person[]): QueueLine | null {
  if (!people || people.length === 0) {
    return null;
  }

  const validData: { cx: number; cy: number; width: number }[] = [];

  for (let i = 0; i < people.length; i++) {
    const box = people[i].boundingBox;
    if (box) {
      // 底面中央の座標と横幅を取得
      const cx = box.originX + box.width / 2;
      const cy = box.originY + box.height;
      validData.push({ cx, cy, width: box.width });
    }
  }

  if (validData.length === 0) {
    return null;
  }

  // 人数が1人の場合は直線・方向が定義できないため null
  if (validData.length === 1) {
    return null;
  }

  // 1. 底面座標の平均（全体中心）を算出
  let sumX = 0;
  let sumY = 0;
  for (let i = 0; i < validData.length; i++) {
    sumX += validData[i].cx;
    sumY += validData[i].cy;
  }
  const meanX = sumX / validData.length;
  const meanY = sumY / validData.length;

  // 2. 底面座標の分布に基づく主成分分析 (PCA) により直線軸を推定
  let sXX = 0;
  let sYY = 0;
  let sXY = 0;

  for (let i = 0; i < validData.length; i++) {
    const dx = validData[i].cx - meanX;
    const dy = validData[i].cy - meanY;
    sXX += dx * dx;
    sYY += dy * dy;
    sXY += dx * dy;
  }

  // 分散最大方向の角度
  const pcaAngle = 0.5 * Math.atan2(2 * sXY, sXX - sYY);
  let dirX = Math.cos(pcaAngle);
  let dirY = Math.sin(pcaAngle);

  // 3. バウンディングボックス横幅の変化から前後の向き（手前→奥）を判定
  // 最大横幅（最手前）と最小横幅（最奥）の点を抽出
  let maxPerson = validData[0];
  let minPerson = validData[0];

  for (let i = 1; i < validData.length; i++) {
    if (validData[i].width > maxPerson.width) {
      maxPerson = validData[i];
    }
    if (validData[i].width < minPerson.width) {
      minPerson = validData[i];
    }
  }

  // 手前（大）から奥（小）への参考ベクトル
  const widthVectorX = minPerson.cx - maxPerson.cx;
  const widthVectorY = minPerson.cy - maxPerson.cy;

  // PCAの軸と横幅ベクトルの内積が負なら方向を反転（手前→奥に揃える）
  if (dirX * widthVectorX + dirY * widthVectorY < 0) {
    dirX = -dirX;
    dirY = -dirY;
  }

  return {
    origin: { x: meanX, y: meanY },
    direction: { x: dirX, y: dirY }
  };
}
