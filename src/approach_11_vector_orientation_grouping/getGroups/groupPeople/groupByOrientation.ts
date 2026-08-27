import { Groups, Person, Keypoint2D } from '../types';

/**
 * 【子アルゴリズム 3】胴体の向きベースの前後グループ化アルゴリズム
 *
 * 【LaTeX数式メモ】
 * 1. 胴体ベクトルの定義 (両肩・両腰の中点ベクトル):
 *    $$\boldsymbol{p}_{shoulder} = \frac{\boldsymbol{k}_{5} + \boldsymbol{k}_{6}}{2}, \quad \boldsymbol{p}_{hip} = \frac{\boldsymbol{k}_{11} + \boldsymbol{k}_{12}}{2}$$
 *    $$\boldsymbol{v}_{torso} = \frac{\boldsymbol{p}_{shoulder} - \boldsymbol{p}_{hip}}{\|\boldsymbol{p}_{shoulder} - \boldsymbol{p}_{hip}\|}$$
 *
 * 2. 前方評価領域（扇形 Sector: 位置 $\boldsymbol{p}$, 向き $\boldsymbol{v}$, 半径 $R$, 開き角 $\theta$）の重なり判定:
 *    $$\text{Sector}_A \cap \text{Sector}_B \neq \emptyset$$
 */

interface OrientationGroupingOptions {
  /** 前方評価領域（視野角）の開き角 (ラジアン, デフォルト: 90度 = ±45度) */
  fovAngle?: number;
  /** 前後と判定する距離の上限 (ピクセル) */
  maxDistanceThreshold?: number;
}

// 閾値定数（大文字スタイル）
const KEYPOINT_SCORE_THRESHOLD = 0.10;
const DEFAULT_FOV_ANGLE = Math.PI / 2; // 90度（正面を中心として左右45度ずつ）
const AVERAGE_BODY_SIZE_DISTANCE_MULTIPLE = 2;

// メモリ再利用用の変数（スコープ外宣言によるOOM防止）
let parentArray: number[] = [];
const groupMap = new Map<number, Person[]>();

function find(i: number): number {
  let root = i;
  while (root !== parentArray[root]) {
    root = parentArray[root];
  }
  let curr = i;
  while (curr !== root) {
    const nxt = parentArray[curr];
    parentArray[curr] = root;
    curr = nxt;
  }
  return root;
}

function union(i: number, j: number): void {
  const rootI = find(i);
  const rootJ = find(j);
  if (rootI !== rootJ) {
    parentArray[rootI] = rootJ;
  }
}

/**
 * 骨格座標から人物の体の大きさ（縦幅/全高）を推定する
 * 頭頂・顔（鼻=0）から足首（15, 16）までの距離、またはバウンディングボックスの高さを使用
 */
function estimateBodySize(person: Person): number | null {
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

  return null;
}

/**
 * 全員の骨格座標・バウンディングボックスから推定した体の大きさの平均の指定倍数の距離閾値を算出する
 */
function calculateAverageBodySizeThreshold(people: Person[]): number {
  let totalSize = 0;
  let count = 0;

  for (let i = 0; i < people.length; i++) {
    const size = estimateBodySize(people[i]);
    if (size !== null) {
      totalSize += size;
      count++;
    }
  }

  if (count === 0) {
    return 250;
  }

  const averageSize = totalSize / count;
  return averageSize * AVERAGE_BODY_SIZE_DISTANCE_MULTIPLE;
}

/**
 * 胴体の向き（両肩・両腰のキーポイント）から2D平面での方向ベクトルを取得する
 * ※スマホ操作等を考慮し、顔ではなく胴体のキーポイント(5,6,11,12)を使用
 */
function getTorsoDirectionVector(keypoints?: Keypoint2D[]): { x: number; y: number } | null {
  if (!keypoints || keypoints.length < 13) {
    return null;
  }

  const leftShoulder = keypoints[5];
  const rightShoulder = keypoints[6];
  const leftHip = keypoints[11];
  const rightHip = keypoints[12];

  const hasShoulders =
    leftShoulder && (leftShoulder.score ?? 0) >= KEYPOINT_SCORE_THRESHOLD &&
    rightShoulder && (rightShoulder.score ?? 0) >= KEYPOINT_SCORE_THRESHOLD;

  const hasHips =
    leftHip && (leftHip.score ?? 0) >= KEYPOINT_SCORE_THRESHOLD &&
    rightHip && (rightHip.score ?? 0) >= KEYPOINT_SCORE_THRESHOLD;

  if (hasShoulders && hasHips) {
    const shoulderMidX = (leftShoulder.x + rightShoulder.x) / 2;
    const shoulderMidY = (leftShoulder.y + rightShoulder.y) / 2;
    const hipMidX = (leftHip.x + rightHip.x) / 2;
    const hipMidY = (leftHip.y + rightHip.y) / 2;

    const vx = shoulderMidX - hipMidX;
    const vy = shoulderMidY - hipMidY;
    const len = Math.hypot(vx, vy);

    if (len === 0) {
      return null;
    }
    return { x: vx / len, y: vy / len };
  }

  return null;
}

type Point = { x: number; y: number };

interface Sector {
  origin: Point;
  dir: Point;
  radius: number;
  fovAngle: number;
  leftRay: Point;
  rightRay: Point;
}

function createSector(origin: Point, dir: Point, radius: number, fovAngle: number): Sector {
  const baseAngle = Math.atan2(dir.y, dir.x);
  const halfFov = fovAngle / 2;

  const leftAngle = baseAngle - halfFov;
  const rightAngle = baseAngle + halfFov;

  return {
    origin,
    dir,
    radius,
    fovAngle,
    leftRay: { x: Math.cos(leftAngle), y: Math.sin(leftAngle) },
    rightRay: { x: Math.cos(rightAngle), y: Math.sin(rightAngle) },
  };
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

/** 線分 p1-p2 と 線分 q1-q2 が交差するか */
function doSegmentsIntersect(p1: Point, p2: Point, q1: Point, q2: Point): boolean {
  const ccw = (a: Point, b: Point, c: Point) => {
    return (c.y - a.y) * (b.x - a.x) > (b.y - a.y) * (c.x - a.x);
  };
  return (
    ccw(p1, q1, q2) !== ccw(p2, q1, q2) &&
    ccw(p1, p2, q1) !== ccw(p1, p2, q2)
  );
}

/** 線分 p1-p2 と 円弧 (center, radius, startAngle, endAngle) が交差するか */
function doesSegmentIntersectArc(p1: Point, p2: Point, sector: Sector): boolean {
  const dx = p2.x - p1.x;
  const dy = p2.y - p1.y;
  const fx = p1.x - sector.origin.x;
  const fy = p1.y - sector.origin.y;

  const a = dx * dx + dy * dy;
  const b = 2 * (fx * dx + fy * dy);
  const c = fx * fx + fy * fy - sector.radius * sector.radius;

  let discriminant = b * b - 4 * a * c;
  if (discriminant < 0) {
    return false;
  }

  discriminant = Math.sqrt(discriminant);
  const t1 = (-b - discriminant) / (2 * a);
  const t2 = (-b + discriminant) / (2 * a);

  const checkIntersectionPoint = (t: number): boolean => {
    if (t < 0 || t > 1) return false;
    const ix = p1.x + t * dx;
    const iy = p1.y + t * dy;
    return isPointInSector({ x: ix, y: iy }, sector);
  };

  return checkIntersectionPoint(t1) || checkIntersectionPoint(t2);
}

/** 2つの扇形領域 (Sector A, Sector B) がオーバーラップ（重なり）しているか */
function doSectorsOverlap(sectorA: Sector, sectorB: Sector): boolean {
  // 1. 原点同士の距離が、両領域の半径の和を超えていれば絶対交差しない
  const distSq =
    Math.pow(sectorA.origin.x - sectorB.origin.x, 2) +
    Math.pow(sectorA.origin.y - sectorB.origin.y, 2);
  const maxRadius = sectorA.radius + sectorB.radius;
  if (distSq > maxRadius * maxRadius) {
    return false;
  }

  // 2. 一方の起点（頂点）が他方の扇形領域内に含まれているか
  if (isPointInSector(sectorA.origin, sectorB) || isPointInSector(sectorB.origin, sectorA)) {
    return true;
  }

  // AとBそれぞれのレイ端点
  const aLeft = {
    x: sectorA.origin.x + sectorA.leftRay.x * sectorA.radius,
    y: sectorA.origin.y + sectorA.leftRay.y * sectorA.radius,
  };
  const aRight = {
    x: sectorA.origin.x + sectorA.rightRay.x * sectorA.radius,
    y: sectorA.origin.y + sectorA.rightRay.y * sectorA.radius,
  };
  const bLeft = {
    x: sectorB.origin.x + sectorB.leftRay.x * sectorB.radius,
    y: sectorB.origin.y + sectorB.leftRay.y * sectorB.radius,
  };
  const bRight = {
    x: sectorB.origin.x + sectorB.rightRay.x * sectorB.radius,
    y: sectorB.origin.y + sectorB.rightRay.y * sectorB.radius,
  };

  // 3. 双方のレイ（側辺の線分）同士の交差判定
  if (
    doSegmentsIntersect(sectorA.origin, aLeft, sectorB.origin, bLeft) ||
    doSegmentsIntersect(sectorA.origin, aLeft, sectorB.origin, bRight) ||
    doSegmentsIntersect(sectorA.origin, aRight, sectorB.origin, bLeft) ||
    doSegmentsIntersect(sectorA.origin, aRight, sectorB.origin, bRight)
  ) {
    return true;
  }

  // 4. 一方のレイ（側辺）と他方の円弧（前方先端弧）の交差判定
  if (
    doesSegmentIntersectArc(sectorA.origin, aLeft, sectorB) ||
    doesSegmentIntersectArc(sectorA.origin, aRight, sectorB) ||
    doesSegmentIntersectArc(sectorB.origin, bLeft, sectorA) ||
    doesSegmentIntersectArc(sectorB.origin, bRight, sectorA)
  ) {
    return true;
  }

  return false;
}

/**
 * 隣り合う前後の人物判定および体の前方の評価領域（視野・視界領域）の重なり判定を行う
 */
export function isOrientedTogether(
  personA: Person,
  personB: Person,
  options: OrientationGroupingOptions = {},
  fallbackMaxDistance?: number
): boolean {
  const fovAngle = options.fovAngle ?? DEFAULT_FOV_ANGLE;
  const maxDistThresh = options.maxDistanceThreshold ?? fallbackMaxDistance ?? 250;

  const dirA = personA.direction
    ? { x: personA.direction.x, y: personA.direction.y }
    : getTorsoDirectionVector(personA.keypoints);

  const dirB = personB.direction
    ? { x: personB.direction.x, y: personB.direction.y }
    : getTorsoDirectionVector(personB.keypoints);

  if (!dirA || !dirB) {
    return false;
  }

  const boxA = personA.boundingBox;
  const boxB = personB.boundingBox;

  if (!boxA || !boxB) {
    return false;
  }

  const posA = { x: boxA.originX + boxA.width / 2, y: boxA.originY + boxA.height / 2 };
  const posB = { x: boxB.originX + boxB.width / 2, y: boxB.originY + boxB.height / 2 };

  // 人物AおよびBの扇形評価領域を作成
  const sectorA = createSector(posA, dirA, maxDistThresh, fovAngle);
  const sectorB = createSector(posB, dirB, maxDistThresh, fovAngle);

  // 2つの扇形領域が幾何学的に重なっているか判定
  return doSectorsOverlap(sectorA, sectorB);
}

/**
 * 【子アルゴリズム 3 本体】
 * 既存グループ（距離・位置ベース）を受け取り、前後の体の向きを考慮して統合したGroupsを返却する
 */
export function groupByOrientation(
  people: Person[],
  initialGroups: Groups,
  options: OrientationGroupingOptions = {}
): Groups {
  if (!people || people.length === 0) {
    return [];
  }

  if (initialGroups.length <= 1) {
    return initialGroups;
  }

  const dynamicMaxDistance = calculateAverageBodySizeThreshold(people);

  // メモリ領域の初期化・使い回し
  parentArray = Array.from({ length: people.length }, (_, i) => i);
  groupMap.clear();

  const personToIndexMap = new Map<Person, number>();
  for (let i = 0; i < people.length; i++) {
    personToIndexMap.set(people[i], i);
  }

  // 1. 初期距離グループの構造をUnion-Findに反映
  for (let g = 0; g < initialGroups.length; g++) {
    const group = initialGroups[g];
    if (group.length > 1) {
      const firstIdx = personToIndexMap.get(group[0])!;
      for (let k = 1; k < group.length; k++) {
        const targetIdx = personToIndexMap.get(group[k])!;
        union(firstIdx, targetIdx);
      }
    }
  }

  // 2. 横並びの誰か1人でも前または後ろの列の人と体の前方の評価領域が重なっていたら連れ（グループ）判定
  for (let i = 0; i < people.length; i++) {
    for (let j = i + 1; j < people.length; j++) {
      if (find(i) !== find(j)) {
        if (isOrientedTogether(people[i], people[j], options, dynamicMaxDistance)) {
          union(i, j);
        }
      }
    }
  }

  // 3. 結果の集約
  for (let i = 0; i < people.length; i++) {
    const root = find(i);
    if (!groupMap.has(root)) {
      groupMap.set(root, []);
    }
    groupMap.get(root)!.push(people[i]);
  }

  const result = Array.from(groupMap.values());

  // メモリ解放
  parentArray = [];
  groupMap.clear();

  return result;
}
