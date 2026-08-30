import { Person, DirectionVector } from '../../types';

export interface QueueLine {
  /** 列の代表点 (全体中心など) */
  origin: { x: number; y: number };
  /** 列の方向を示す単位ベクトル (dx, dy) */
  direction: DirectionVector;
}

interface PersonPoint {
  cx: number;
  cy: number;
  width: number;
}

/**
 * X座標でソートし、シーケンシャルな横幅の変化傾向（単調増加または単調減少）
 * に合わない要素を除外する
 */
function filterBySequenceTrend(data: PersonPoint[]): PersonPoint[] {
  if (data.length <= 2) {
    return data;
  }

  // 1. X座標昇順でソート
  const sorted = [...data].sort((a, b) => a.cx - b.cx);

  // 2. 全体として「右に行くほど大きく（手前）」なるか「右に行くほど小さく（奥）」なるかの傾向を判定
  const first = sorted[0];
  const last = sorted[sorted.length - 1];
  const isIncreasing = last.width >= first.width;

  // 3. 傾向に合う要素のみをフィルタリング
  const result: PersonPoint[] = [sorted[0]];

  for (let i = 1; i < sorted.length; i++) {
    const prevWidth = result[result.length - 1].width;
    const current = sorted[i];

    if (isIncreasing) {
      // 増加傾向：前の要素より極端に小さくなっているものは除外
      if (current.width >= prevWidth * 0.8) {
        result.push(current);
      }
    } else {
      // 減少傾向：前の要素より極端に大きくなっているものは除外
      if (current.width <= prevWidth * 1.2) {
        result.push(current);
      }
    }
  }

  return result;
}

/**
 * 1. X座標ソートおよび横幅の変化傾向フィルタリング
 * 2. フィルタ後の底面座標の分布（PCA）により直線自体を推定
 * 3. 横幅の変化方向（手前→奥）に沿ってベクトルの向きを確定
 */
export function estimateQueueLine(people: Person[]): QueueLine | null {
  if (!people || people.length === 0) {
    return null;
  }

  const rawData: PersonPoint[] = [];

  for (let i = 0; i < people.length; i++) {
    const box = people[i].boundingBox;
    if (box) {
      const cx = box.originX + box.width / 2;
      const cy = box.originY + box.height;
      rawData.push({ cx, cy, width: box.width });
    }
  }

  // X座標順ソートおよびシーケンシャル傾向フィルタリング
  const validData = filterBySequenceTrend(rawData);

  if (validData.length <= 1) {
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

  // 2. フィルタ後の底面座標分布に基づく主成分分析 (PCA)
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

  const pcaAngle = 0.5 * Math.atan2(2 * sXY, sXX - sYY);
  let dirX = Math.cos(pcaAngle);
  let dirY = Math.sin(pcaAngle);

  // 3. フィルタ後の最大横幅（手前）と最小横幅（奥）から方向ベクトルを正しく正負判定
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

  // PCAの軸と横幅ベクトルの内積が負なら方向を反転
  if (dirX * widthVectorX + dirY * widthVectorY < 0) {
    dirX = -dirX;
    dirY = -dirY;
  }

  return {
    origin: { x: meanX, y: meanY },
    direction: { x: dirX, y: dirY }
  };
}
