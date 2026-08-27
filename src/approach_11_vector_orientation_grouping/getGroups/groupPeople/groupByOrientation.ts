import { Groups, Person, Keypoint2D } from '../types';

/**
 * 【子アルゴリズム 3】胴体の向きベースの前後グループ化アルゴリズム
 *
 * 【LaTeX数式メモ】
 * 1. 胴体ベクトルの定義 (両肩・両腰の中点ベクトル):
 *    $$\boldsymbol{p}_{shoulder} = \frac{\boldsymbol{k}_{5} + \boldsymbol{k}_{6}}{2}, \quad \boldsymbol{p}_{hip} = \frac{\boldsymbol{k}_{11} + \boldsymbol{k}_{12}}{2}$$
 *    $$\boldsymbol{v}_{torso} = \frac{\boldsymbol{p}_{shoulder} - \boldsymbol{p}_{hip}}{\|\boldsymbol{p}_{shoulder} - \boldsymbol{p}_{hip}\|}$$
 *
 * 2. 人物 A, B 間の位置関係ベクトル $\hat{\boldsymbol{r}}_{AB}$ と視線・体躯交差角:
 *    $$\cos \theta_{A \to B} = \boldsymbol{v}_{torso, A} \cdot \hat{\boldsymbol{r}}_{AB}$$
 *    $$\cos \theta_{B \to A} = \boldsymbol{v}_{torso, B} \cdot (-\hat{\boldsymbol{r}}_{AB})$$
 *
 * 3. 相互ベクトル交差条件:
 *    $$\boldsymbol{v}_{\text{torso}, A} \cdot \boldsymbol{v}_{\text{torso}, B} \ge \cos(\text{FACING\_ANGLE\_THRESHOLD})$$
 */

interface OrientationGroupingOptions {
  /** 前後間で「互いに向き合っている/同じ方向を向いて話している」とみなす角度の閾値 (ラジアン) */
  facingAngleThreshold?: number;
  /** 前後と判定する距離の上限 (ピクセル) */
  maxDistanceThreshold?: number;
}

// 閾値定数（大文字スタイル）
const KEYPOINT_SCORE_THRESHOLD = 0.20;
const DEFAULT_FACING_ANGLE_THRESHOLD = Math.PI / 4; // 45度
const DEFAULT_MAX_DISTANCE_THRESHOLD = 250; // ピクセル

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

function calculateCosTheta(
  v1: { x: number; y: number },
  v2: { x: number; y: number }
): number {
  const dot = v1.x * v2.x + v1.y * v2.y;
  const len1 = Math.hypot(v1.x, v1.y);
  const len2 = Math.hypot(v2.x, v2.y);

  if (len1 === 0 || len2 === 0) {
    return 0;
  }
  return dot / (len1 * len2);
}

/**
 * 隣り合う前後の人物判定およびベクトルの交差角度から連れ判定を行う
 */
export function isOrientedTogether(
  personA: Person,
  personB: Person,
  options: OrientationGroupingOptions = {}
): boolean {
  const facingAngleThresh = options.facingAngleThreshold ?? DEFAULT_FACING_ANGLE_THRESHOLD;
  const maxDistThresh = options.maxDistanceThreshold ?? DEFAULT_MAX_DISTANCE_THRESHOLD;

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

  const dx = posB.x - posA.x;
  const dy = posB.y - posA.y;
  const dist = Math.hypot(dx, dy);

  if (dist > maxDistThresh || dist === 0) {
    return false;
  }

  const relVecAB = { x: dx / dist, y: dy / dist };
  const relVecBA = { x: -dx / dist, y: -dy / dist };

  const cosAtoB = calculateCosTheta(dirA, relVecAB);
  const cosBtoA = calculateCosTheta(dirB, relVecBA);

  const minCos = Math.cos(facingAngleThresh);

  if (cosAtoB >= minCos || cosBtoA >= minCos) {
    return true;
  }

  const interCos = calculateCosTheta(dirA, dirB);
  if (interCos >= minCos) {
    return true;
  }

  return false;
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

  // 2. 横並びの誰か1人でも前または後ろの列の人と体の向きが交差していたら連れ（グループ）判定
  for (let i = 0; i < people.length; i++) {
    for (let j = i + 1; j < people.length; j++) {
      if (find(i) !== find(j)) {
        if (isOrientedTogether(people[i], people[j], options)) {
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
