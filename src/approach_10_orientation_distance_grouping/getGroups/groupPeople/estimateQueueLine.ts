import { Person, DirectionVector, Keypoint2D } from '../types';

export interface QueueLine {
  /** 列の代表点 (中心など) */
  origin: { x: number; y: number };
  /** 列の方向を示す単位ベクトル (dx, dy) */
  direction: DirectionVector;
}

const ANKLE_SCORE_THRESHOLD = 0.5;

/**
 * MoveNetのキーポイント配列から足首の座標を取得する
 * 左足首: インデックス 15, 右足首: インデックス 16
 */
function getAnklePosition(keypoints?: Keypoint2D[], threshold = ANKLE_SCORE_THRESHOLD): { x: number; y: number } | null {
  if (!keypoints || keypoints.length <= 16) {
    return null;
  }

  const leftAnkle = keypoints[15];
  const rightAnkle = keypoints[16];

  const leftValid = leftAnkle && (leftAnkle.score ?? 0) >= threshold;
  const rightValid = rightAnkle && (rightAnkle.score ?? 0) >= threshold;

  if (leftValid && rightValid) {
    return {
      x: (leftAnkle.x + rightAnkle.x) / 2,
      y: (leftAnkle.y + rightAnkle.y) / 2
    };
  } else if (leftValid) {
    return { x: leftAnkle.x, y: leftAnkle.y };
  } else if (rightValid) {
    return { x: rightAnkle.x, y: rightAnkle.y };
  }

  return null;
}

/**
 * 全体の人物分布（バウンディングボックスの中心）と人物の向きから、
 * 主な列の方向（直線）を推定するアルゴリズム
 */
export function estimateQueueLine(people: Person[]): QueueLine | null {
  if (!people || people.length === 0) {
    return null;
  }

  // 各人物のバウンディングボックス中心座標と向きを抽出
  const centers: { x: number; y: number }[] = [];
  const directions: DirectionVector[] = [];

  for (let i = 0; i < people.length; i++) {
    const p = people[i];
    const anklePos = getAnklePosition(p.keypoints, ANKLE_SCORE_THRESHOLD);
    if (anklePos) {
      centers.push(anklePos);
    }
    if (p.direction && (p.direction.x !== 0 || p.direction.y !== 0)) {
      directions.push(p.direction);
    }
  }

  if (centers.length === 0) {
    return null;
  }

  // 1. 全体中心 (\bar{x}, \bar{y}) の算出
  let sumX = 0;
  let sumY = 0;
  for (let i = 0; i < centers.length; i++) {
    sumX += centers[i].x;
    sumY += centers[i].y;
  }
  const meanX = sumX / centers.length;
  const meanY = sumY / centers.length;

  // 2. 主成分分析 (PCA) による配置の分散最大方向の算出
  // 共分散行列 [[S_xx, S_xy], [S_xy, S_yy]]
  let sXX = 0;
  let sYY = 0;
  let sXY = 0;

  for (let i = 0; i < centers.length; i++) {
    const dx = centers[i].x - meanX;
    const dy = centers[i].y - meanY;
    sXX += dx * dx;
    sYY += dy * dy;
    sXY += dx * dy;
  }

  // PCAの最大固有値に対応する固有ベクトル (方向) の算出
  // \theta = \frac{1}{2} \operatorname{atan2}(2 S_{xy}, S_{xx} - S_{yy})
  const pcaAngle = 0.5 * Math.atan2(2 * sXY, sXX - sYY);
  let pcaDirX = Math.cos(pcaAngle);
  let pcaDirY = Math.sin(pcaAngle);

  // 3. 人物の向き (DirectionVector) の平均ベクトルの算出
  let avgDirX = 0;
  let avgDirY = 0;
  if (directions.length > 0) {
    for (let i = 0; i < directions.length; i++) {
      avgDirX += directions[i].x;
      avgDirY += directions[i].y;
    }
    const dirLen = Math.hypot(avgDirX, avgDirY);
    if (dirLen > 0) {
      avgDirX /= dirLen;
      avgDirY /= dirLen;
    }
  }

  // 4. 配置構造 (PCA) と視線・向きの加重結合
  // 人数が少ない場合や配置の分散が小さい場合は視線の重みを高く評価
  let finalDirX = pcaDirX;
  let finalDirY = pcaDirY;

  if (directions.length > 0) {
    // PCA方向と向きの向き揃え (内積が負なら反転)
    if (finalDirX * avgDirX + finalDirY * avgDirY < 0) {
      finalDirX = -finalDirX;
      finalDirY = -finalDirY;
    }

    // 重み付け合成 (配置による分散が十分大きければPCAを優先)
    const pcaWeight = Math.min(1.0, centers.length / 5);
    const dirWeight = 1.0 - pcaWeight * 0.5;

    finalDirX = finalDirX * pcaWeight + avgDirX * dirWeight;
    finalDirY = finalDirY * pcaWeight + avgDirY * dirWeight;

    const finalLen = Math.hypot(finalDirX, finalDirY);
    if (finalLen > 0) {
      finalDirX /= finalLen;
      finalDirY /= finalLen;
    }
  }

  return {
    origin: { x: meanX, y: meanY },
    direction: { x: finalDirX, y: finalDirY }
  };
}
