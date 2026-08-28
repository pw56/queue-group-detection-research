import { Groups, Person, Keypoint2D, QueueLine } from '../types';

/**
 * 【子アルゴリズム 3】体の向き・確率スコア（連続値）ベースの前後グループ化アルゴリズム
 *
 * 【LaTeX数式メモ】
 * 1. 相対位置単位ベクトル:
 *    $$\hat{\boldsymbol{v}}_{AB} = \frac{\boldsymbol{p}_B - \boldsymbol{p}_A}{\|\boldsymbol{p}_B - \boldsymbol{p}_A\|}$$
 *
 * 2. 片方向視界スコア (対向度):
 *    $$S_{sight}(A \to B) = \max\left(0, \frac{\hat{\boldsymbol{d}}_A \cdot \hat{\boldsymbol{v}}_{AB} - \cos(\theta / 2)}{1 - \cos(\theta / 2)}\right)$$
 *
 * 3. 相互認識スコア (AND的評価):
 *    $$S_{mutual}(A, B) = \sqrt{S_{sight}(A \to B) \times S_{sight}(B \to A)} \times S_{dist}(A, B)$$
 */

interface OrientationGroupingOptions {
  /** 前方評価領域（視野角）の開き角 (ラジアン, デフォルト: 120度 = ±60度) */
  fovAngle?: number;
  /** 個人の体サイズに乗算する距離倍率 (デフォルト: 1.2) */
  distanceMultiple?: number;
  /** グループ統合を許可する相互スコア閾値 (0.0 ~ 1.0, デフォルト: 0.35) */
  scoreThreshold?: number;
}

// 閾値定数
const KEYPOINT_SCORE_THRESHOLD = 0.5;
const DEFAULT_FOV_ANGLE = (2 * Math.PI) / 3; // 120度（正面を中心として左右60度ずつ）
const DEFAULT_SCORE_THRESHOLD = 0.35; // スコア閾値

type Point = { x: number; y: number };

interface Sector {
  origin: Point;
  dir: Point;
  radius: number;
  fovAngle: number;
}

/** 胴体の4頂点（左肩、右肩、右腰、左腰）で作られる四角形 */
type TorsoQuad = [Point, Point, Point, Point];

/**
 * 人物の平均的な体の大きさ（縦幅/高さ）を算出する
 * 鼻から足首までの距離、またはバウンディングボックスの高さ
 */
function estimatePersonBodySize(person: Person): number {
  const keypoints = person.keypoints;
  if (keypoints && keypoints.length > 16) {
    const nose = keypoints[0];
    const leftAnkle = keypoints[15];
    const rightAnkle = keypoints[16];

    const hasNose = nose && (nose.score ?? 0) >= KEYPOINT_SCORE_THRESHOLD;
    const leftAnkleValid = leftAnkle && (leftAnkle.score ?? 0) >= KEYPOINT_SCORE_THRESHOLD;
    const rightAnkleValid = rightAnkle && (rightAnkle.score ?? 0) >= KEYPOINT_SCORE_THRESHOLD;

    let ankleY: number | null = null;
    if (leftAnkleValid && rightAnkleValid) {
      ankleY = (leftAnkle.y + rightAnkle.y) / 2;
    } else if (leftAnkleValid) {
      ankleY = leftAnkle.y;
    } else if (rightAnkleValid) {
      ankleY = rightAnkle.y;
    }

    if (hasNose && ankleY !== null) {
      const height = Math.abs(ankleY - nose.y);
      if (height > 0) {
        return height;
      }
    }
  }

  if (person.boundingBox && person.boundingBox.height > 0) {
    return person.boundingBox.height;
  }

  return 200; // フォールバックデフォルト値
}

/**
 * 両肩（または両腰）の中点（評価原点）を取得する
 */
function getPersonCenterPoint(person: Person): Point {
  const keypoints = person.keypoints;
  if (keypoints && keypoints.length >= 13) {
    const ls = keypoints[5];
    const rs = keypoints[6];
    const lh = keypoints[11];
    const rh = keypoints[12];

    const validLS = ls && (ls.score ?? 0) >= KEYPOINT_SCORE_THRESHOLD;
    const validRS = rs && (rs.score ?? 0) >= KEYPOINT_SCORE_THRESHOLD;
    const validLH = lh && (lh.score ?? 0) >= KEYPOINT_SCORE_THRESHOLD;
    const validRH = rh && (rh.score ?? 0) >= KEYPOINT_SCORE_THRESHOLD;

    if (validLS && validRS) {
      return { x: (ls.x + rs.x) / 2, y: (ls.y + rs.y) / 2 };
    }
    if (validLH && validRH) {
      return { x: (lh.x + rh.x) / 2, y: (lh.y + rh.y) / 2 };
    }
  }

  const box = person.boundingBox;
  if (box) {
    return { x: box.originX + box.width / 2, y: box.originY + box.height * 0.3 };
  }

  return { x: 0, y: 0 };
}

/**
 * 両肩（または両腰）のキーポイントから、身体の正面（お腹側）を向く2D法線ベクトルを取得する
 */
function getTorsoDirectionVector(keypoints?: Keypoint2D[]): Point | null {
  if (!keypoints || keypoints.length < 13) {
    return null;
  }

  const nose = keypoints[0];
  const leftShoulder = keypoints[5];
  const rightShoulder = keypoints[6];
  const leftHip = keypoints[11];
  const rightHip = keypoints[12];

  const hasNose = nose && (nose.score ?? 0) >= KEYPOINT_SCORE_THRESHOLD;
  const hasShoulders =
    leftShoulder && (leftShoulder.score ?? 0) >= KEYPOINT_SCORE_THRESHOLD &&
    rightShoulder && (rightShoulder.score ?? 0) >= KEYPOINT_SCORE_THRESHOLD;

  const hasHips =
    leftHip && (leftHip.score ?? 0) >= KEYPOINT_SCORE_THRESHOLD &&
    rightHip && (rightHip.score ?? 0) >= KEYPOINT_SCORE_THRESHOLD;

  let lrX = 0;
  let lrY = 0;

  if (hasShoulders) {
    // 左肩から右肩へのベクトル
    lrX = rightShoulder.x - leftShoulder.x;
    lrY = rightShoulder.y - leftShoulder.y;
  } else if (hasHips) {
    // 両肩が使えない場合は両腰から算出
    lrX = rightHip.x - leftHip.x;
    lrY = rightHip.y - leftHip.y;
  } else {
    return null;
  }

  const len = Math.hypot(lrX, lrY);
  if (len === 0) {
    return null;
  }

  // 1. 仮の法線ベクトル算出 (-lrY, lrX)
  let normalX = -lrY / len;
  let normalY = lrX / len;

  // 基準点（肩の中点）の算出
  const sMidX = hasShoulders
    ? (leftShoulder.x + rightShoulder.x) / 2
    : (leftHip.x + rightHip.x) / 2;
  const sMidY = hasShoulders
    ? (leftShoulder.y + rightShoulder.y) / 2
    : (leftHip.y + rightHip.y) / 2;

  // 2. 極性判定（お腹側・正面に向かせる補正）
  // 優先度A: 鼻（Nose）のキーポイントが存在する場合、鼻のある方向を「正面」と確定
  if (hasNose) {
    const noseVecX = nose.x - sMidX;
    const noseVecY = nose.y - sMidY;
    const dot = normalX * noseVecX + normalY * noseVecY;
    if (dot < 0) {
      normalX = -normalX;
      normalY = -normalY;
    }
  }
  // 優先度B: 両腰（Hips）が存在する場合、画像座標系（Y-down）における外積判定で極性を確定
  else if (hasShoulders && hasHips) {
    const hMidX = (leftHip.x + rightHip.x) / 2;
    const hMidY = (leftHip.y + rightHip.y) / 2;

    const upX = sMidX - hMidX;
    const upY = sMidY - hMidY;

    // 画像座標系（Y-down）における外積計算
    const crossProduct = lrX * upY - lrY * upX;
    if (crossProduct > 0) {
      normalX = -normalX;
      normalY = -normalY;
    }
  }

  return { x: normalX, y: normalY };
}

/**
 * 待機列方向（または画面進行方向）に対して人物が正しく前を向いているか判定する
 */
function isFacingForward(dir: Point, queueLine: QueueLine | null): boolean {
  if (queueLine) {
    const qDir = queueLine.direction;
    const qLen = Math.hypot(qDir.x, qDir.y);
    if (qLen > 0) {
      const uQ = { x: qDir.x / qLen, y: qDir.y / qLen };
      // 待機列方向との内積（cos θ）。角度約45度以内 (cos >= 0.707) を「前向き」と定義
      const cosVal = dir.x * uQ.x + dir.y * uQ.y;
      return cosVal >= 0.707;
    }
  }
  // QueueLineがない場合のフォールバック（画面上方向 y < 0 を前方と仮定）
  return dir.y < -0.5;
}

/**
 * 人物の現在の胴体四角形（TorsoQuad）を取得する
 */
function getTorsoQuad(person: Person): TorsoQuad | null {
  const keypoints = person.keypoints;

  if (keypoints && keypoints.length >= 13) {
    const ls = keypoints[5];
    const rs = keypoints[6];
    const lh = keypoints[11];
    const rh = keypoints[12];

    const validLS = ls && (ls.score ?? 0) >= KEYPOINT_SCORE_THRESHOLD;
    const validRS = rs && (rs.score ?? 0) >= KEYPOINT_SCORE_THRESHOLD;
    const validLH = lh && (lh.score ?? 0) >= KEYPOINT_SCORE_THRESHOLD;
    const validRH = rh && (rh.score ?? 0) >= KEYPOINT_SCORE_THRESHOLD;

    if (validLS && validRS && validLH && validRH) {
      return [
        { x: ls.x, y: ls.y },
        { x: rs.x, y: rs.y },
        { x: rh.x, y: rh.y },
        { x: lh.x, y: lh.y },
      ];
    }
  }

  // 骨格が取れない場合はBoundingBoxから四角形を作成
  const box = person.boundingBox;
  if (box) {
    return [
      { x: box.originX, y: box.originY },
      { x: box.originX + box.width, y: box.originY },
      { x: box.originX + box.width, y: box.originY + box.height },
      { x: box.originX, y: box.originY + box.height },
    ];
  }

  return null;
}

/** 任意の点 p が扇形領域内に含まれるか */
function isPointInSector(p: Point, sector: Sector): boolean {
  const dx = p.x - sector.origin.x;
  const dy = p.y - sector.origin.y;
  const distSq = dx * dx + dy * dy;

  if (distSq > sector.radius * sector.radius || distSq === 0) {
    return false;
  }

  const dist = Math.sqrt(distSq);
  const rx = dx / dist;
  const ry = dy / dist;

  const cosVal = sector.dir.x * rx + sector.dir.y * ry;
  return cosVal >= Math.cos(sector.fovAngle / 2);
}

/** 2つの線分 (p1-p2 と p3-p4) が交差しているか */
function doSegmentsIntersect(p1: Point, p2: Point, p3: Point, p4: Point): boolean {
  const ccw = (a: Point, b: Point, c: Point) => {
    return (c.y - a.y) * (b.x - a.x) > (b.y - a.y) * (c.x - a.x);
  };
  return ccw(p1, p3, p4) !== ccw(p2, p3, p4) && ccw(p1, p2, p3) !== ccw(p1, p2, p4);
}

/** 扇形領域 (Sector) と 胴体四角形 (TorsoQuad) が重なっているか */
function isSectorIntersectingQuad(sector: Sector, quad: TorsoQuad): boolean {
  // 1. 四角形の4頂点のいずれかが扇形内に入っているか
  for (let i = 0; i < 4; i++) {
    if (isPointInSector(quad[i], sector)) {
      return true;
    }
  }

  // 2. 扇形の中心点が四角形内に入っているか (簡単な点・多角形包含判定)
  let inside = false;
  for (let i = 0, j = 3; i < 4; j = i++) {
    const xi = quad[i].x, yi = quad[i].y;
    const xj = quad[j].x, yj = quad[j].y;
    const intersect =
      yi > sector.origin.y !== yj > sector.origin.y &&
      sector.origin.x < ((xj - xi) * (sector.origin.y - yi)) / (yj - yi) + xi;
    if (intersect) inside = !inside;
  }
  if (inside) return true;

  // 3. 扇形の境界線分（左右レイ）と四角形の4辺が交差しているか
  const halfFov = sector.fovAngle / 2;
  const cos = Math.cos(halfFov);
  const sin = Math.sin(halfFov);

  // 左境界ベクトルと右境界ベクトル
  const leftDir = {
    x: sector.dir.x * cos - sector.dir.y * sin,
    y: sector.dir.x * sin + sector.dir.y * cos,
  };
  const rightDir = {
    x: sector.dir.x * cos + sector.dir.y * sin,
    y: -sector.dir.x * sin + sector.dir.y * cos,
  };

  const leftRayEnd = {
    x: sector.origin.x + leftDir.x * sector.radius,
    y: sector.origin.y + leftDir.y * sector.radius,
  };
  const rightRayEnd = {
    x: sector.origin.x + rightDir.x * sector.radius,
    y: sector.origin.y + rightDir.y * sector.radius,
  };

  for (let i = 0; i < 4; i++) {
    const q1 = quad[i];
    const q2 = quad[(i + 1) % 4];
    if (
      doSegmentsIntersect(sector.origin, leftRayEnd, q1, q2) ||
      doSegmentsIntersect(sector.origin, rightRayEnd, q1, q2)
    ) {
      return true;
    }
  }

  return false;
}

/**
 * AからBへの片方向視界スコア（0.0 ～ 1.0）を計算する
 */
function calculateSightScore(
  posA: Point,
  dirA: Point,
  posB: Point,
  fovAngle: number
): number {
  const dx = posB.x - posA.x;
  const dy = posB.y - posA.y;
  const dist = Math.hypot(dx, dy);

  if (dist === 0) return 1.0;

  // AからBへの単位ベクトル
  const ux = dx / dist;
  const uy = dy / dist;

  // 正面ベクトルとのなす角（cos θ）
  const cosTheta = dirA.x * ux + dirA.y * uy;
  const cosMin = Math.cos(fovAngle / 2);

  if (cosTheta < cosMin) return 0.0;

  // 視野の中心に近いほど1.0に近づく線形補間スコア
  return (cosTheta - cosMin) / (1.0 - cosMin);
}

/**
 * 2人間の相互認識・向き合いスコア（0.0 ～ 1.0）を計算する
 */
export function calculateOrientationScore(
  personA: Person,
  personB: Person,
  queueLine: QueueLine | null = null,
  options: OrientationGroupingOptions = {}
): number {
  const fovAngle = options.fovAngle ?? DEFAULT_FOV_ANGLE;

  const dirA = personA.direction
    ? { x: personA.direction.x, y: personA.direction.y }
    : getTorsoDirectionVector(personA.keypoints);

  const dirB = personB.direction
    ? { x: personB.direction.x, y: personB.direction.y }
    : getTorsoDirectionVector(personB.keypoints);

  if (!dirA || !dirB) return 0.0;

  // 双方とも列の進行方向を正しく向いている場合はスコア0（グループ化しない）
  if (isFacingForward(dirA, queueLine) && isFacingForward(dirB, queueLine)) {
    return 0.0;
  }

  const posA = getPersonCenterPoint(personA);
  const posB = getPersonCenterPoint(personB);

  // 1. 片方向視界スコアの計算
  const sightAtoB = calculateSightScore(posA, dirA, posB, fovAngle);
  const sightBtoA = calculateSightScore(posB, dirB, posA, fovAngle);

  if (sightAtoB <= 0 || sightBtoA <= 0) return 0.0;

  // 2. 距離減衰スコアの計算（身体サイズに対する相対距離）
  const dist = Math.hypot(posB.x - posA.x, posB.y - posA.y);
  const maxRadius = Math.max(
    personA.boundingBox?.width ?? 100,
    personB.boundingBox?.width ?? 100
  ) * 2.5;

  if (dist > maxRadius) return 0.0;

  const distanceScore = Math.max(0, 1.0 - dist / maxRadius);

  // 3. 幾何平均による統合スコア計算
  const mutualSight = Math.sqrt(sightAtoB * sightBtoA);
  return mutualSight * distanceScore;
}

/**
 * 2人の人物が互いの扇形評価領域と胴体四角形で相互認識（AND条件）またはスコア閾値を超えているかをチェック
 */
export function isOrientedTogether(
  personA: Person,
  personB: Person,
  queueLine: QueueLine | null = null,
  options: OrientationGroupingOptions = {}
): boolean {
  const threshold = options.scoreThreshold ?? DEFAULT_SCORE_THRESHOLD;
  const score = calculateOrientationScore(personA, personB, queueLine, options);
  return score >= threshold;
}

/**
 * 【子アルゴリズム 3 本体】
 * 既存グループ（Groups）と待機列情報（QueueLine）を受け取り、前後の体の向き・胴体四角形の相互認識を考慮してグループごと統合したGroupsを返却する
 */
export function groupByOrientation(
  groups: Groups,
  queueLine: QueueLine | null,
  options: OrientationGroupingOptions = {}
): Groups {
  if (!groups || groups.length <= 1) {
    return groups;
  }

  // Union-Find 用親配列（グループ数で初期化）
  const parent = Array.from({ length: groups.length }, (_, i) => i);

  function find(i: number): number {
    let root = i;
    while (root !== parent[root]) root = parent[root];
    let curr = i;
    while (curr !== root) {
      const nxt = parent[curr];
      parent[curr] = root;
      curr = nxt;
    }
    return root;
  }

  function union(i: number, j: number): void {
    const rootI = find(i);
    const rootJ = find(j);
    if (rootI !== rootJ) {
      parent[rootI] = rootJ;
    }
  }

  // 別々のグループ間でメンバー同士の相互認識判定を実行
  for (let g1 = 0; g1 < groups.length; g1++) {
    for (let g2 = g1 + 1; g2 < groups.length; g2++) {
      if (find(g1) === find(g2)) continue;

      let shouldMerge = false;
      const group1 = groups[g1];
      const group2 = groups[g2];

      for (let i = 0; i < group1.length; i++) {
        for (let j = 0; j < group2.length; j++) {
          if (isOrientedTogether(group1[i], group2[j], queueLine, options)) {
            shouldMerge = true;
            break;
          }
        }
        if (shouldMerge) break;
      }

      if (shouldMerge) {
        union(g1, g2);
      }
    }
  }

  // 結果の集約（グループ単位で結合）
  const mergedGroupMap = new Map<number, Person[]>();
  for (let g = 0; g < groups.length; g++) {
    const root = find(g);
    if (!mergedGroupMap.has(root)) {
      mergedGroupMap.set(root, []);
    }
    mergedGroupMap.get(root)!.push(...groups[g]);
  }

  return Array.from(mergedGroupMap.values());
}
