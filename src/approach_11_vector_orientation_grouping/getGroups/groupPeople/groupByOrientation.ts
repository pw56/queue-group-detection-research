import { Groups, Person, Keypoint2D } from '../types';

/**
 * 【子アルゴリズム 3】胴体の向きベースの前後グループ化アルゴリズム
 *
 * 【LaTeX数式メモ】
 * 1. 胴体ベクトルの定義 (両肩・両腰の中点ベクトル):
 *    $$\boldsymbol{p}_{shoulder} = \frac{\boldsymbol{k}_{5} + \boldsymbol{k}_{6}}{2}, \quad \boldsymbol{p}_{hip} = \frac{\boldsymbol{k}_{11} + \boldsymbol{k}_{12}}{2}$$
 *    $$\boldsymbol{v}_{torso} = \frac{\boldsymbol{p}_{shoulder} - \boldsymbol{p}_{hip}}{\|\boldsymbol{p}_{shoulder} - \boldsymbol{p}_{hip}\|}$$
 *
 * 2. 相互認識（AND条件）によるグループ統合条件:
 *    $$\text{isPointInSector}(\boldsymbol{p}_B, \text{Sector}_A) \quad \land \quad \text{isPointInSector}(\boldsymbol{p}_A, \text{Sector}_B)$$
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
const AVERAGE_BODY_SIZE_DISTANCE_MULTIPLE = 1.2;

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
}

function createSector(origin: Point, dir: Point, radius: number, fovAngle: number): Sector {
  return {
    origin,
    dir,
    radius,
    fovAngle,
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

/**
 * 隣り合う前後の人物判定および体の前方の評価領域（視野・視界領域）の相互認識判定を行う
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

  // 相互認識（Aの領域内にBの位置が存在し、かつBの領域内にAの位置が存在する）
  return isPointInSector(posB, sectorA) && isPointInSector(posA, sectorB);
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

  // 2. 横並びの誰か1人でも前または後ろの列の人と体の前方の評価領域が相互認識されていたら連れ（グループ）判定
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
