import { Person } from '../../types';

// ==========================================
// 定数定義 (基準・閾値)
// ==========================================
/** 延長線の交点までの最大距離倍率（バウンディングボックス平均幅に対する倍率） */
const MAX_INTERSECTION_DISTANCE_RATIO = 2.0;

/** 
 * 体の向きの交差角度の下限閾値（ラジアン）
 * 正面・ななめで向かい合っている状態（180度/πラジアン付近）を判定するため、
 * 例: 120度(2π/3)以上 180度以下で対向・交差グループ判定
 */
const MIN_FACING_ANGLE_THRESHOLD_RAD = (Math.PI * 2) / 3;

/** BoundingBox未定義時のデフォルト横幅 */
const DEFAULT_BOUNDING_BOX_WIDTH = 100.0;

// ==========================================
// 再利用可能な内部変数 (OOM防止・GC低減)
// ==========================================
interface Point2D {
  x: number;
  y: number;
}

const p1: Point2D = { x: 0, y: 0 };
const v1: Point2D = { x: 0, y: 0 };
const p2: Point2D = { x: 0, y: 0 };
const v2: Point2D = { x: 0, y: 0 };

/**
 * Personオブジェクトから中心座標と体の向きベクトル(Person.direction)を取得する helper
 */
function getPersonCenterAndDirection(person: Person, outCenter: Point2D, outDir: Point2D): boolean {
  if (!person.boundingBox || !person.direction) {
    return false;
  }

  // 中心座標（バウンディングボックスの中心）
  outCenter.x = person.boundingBox.originX + person.boundingBox.width / 2;
  outCenter.y = person.boundingBox.originY + person.boundingBox.height / 2;

  // Person型に含まれる direction (x, y) を使用
  const dirX = person.direction.x;
  const dirY = person.direction.y;
  const len = Math.hypot(dirX, dirY);

  if (len === 0) {
    return false;
  }

  outDir.x = dirX / len;
  outDir.y = dirY / len;

  return true;
}

/**
 * 前後の列の2人が、体の向きの延長線で交差し、かつ互いに向かい合って会話しているか判定する
 * 
 * LaTeX Math Note:
 * \text{Line 1: } \boldsymbol{P}_1 + t_1 \boldsymbol{d}_1, \quad \text{Line 2: } \boldsymbol{P}_2 + t_2 \boldsymbol{d}_2
 * \text{det } = d_{1x} d_{2y} - d_{1y} d_{2x}
 * t_1 = \frac{(P_{2x} - P_{1x}) d_{2y} - (P_{2y} - P_{1y}) d_{2x}}{\text{det}}
 * t_2 = \frac{(P_{2x} - P_{1x}) d_{1y} - (P_{2y} - P_{1y}) d_{1x}}{\text{det}}
 * \theta = \arccos(\boldsymbol{d}_1 \cdot \boldsymbol{d}_2) \ge \text{MIN\_FACING\_ANGLE\_THRESHOLD\_RAD}
 */
function checkOrientationIntersection(personA: Person, personB: Person): boolean {
  if (!getPersonCenterAndDirection(personA, p1, v1) || !getPersonCenterAndDirection(personB, p2, v2)) {
    return false;
  }

  // 1. 体の向きベクトル同士のなす角を算出（対向度合いのチェック）
  const dot = Math.max(-1, Math.min(1, v1.x * v2.x + v1.y * v2.y));
  const angle = Math.acos(dot);

  // 向かい合っている角度（定数 MIN_FACING_ANGLE_THRESHOLD_RAD 以上、約120度〜180度）でない場合は除外
  if (angle < MIN_FACING_ANGLE_THRESHOLD_RAD) {
    return false;
  }

  // 2. 延長線の交点計算
  const det = v1.x * v2.y - v1.y * v2.x;

  const dx = p2.x - p1.x;
  const dy = p2.y - p1.y;

  // 完全平行かつ完全対向（180度）の場合
  if (Math.abs(det) < 1e-6) {
    const dist = Math.hypot(dx, dy);
    const widthA = personA.boundingBox?.width ?? DEFAULT_BOUNDING_BOX_WIDTH;
    const widthB = personB.boundingBox?.width ?? DEFAULT_BOUNDING_BOX_WIDTH;
    const avgWidth = (widthA + widthB) / 2;
    return dist <= avgWidth * MAX_INTERSECTION_DISTANCE_RATIO;
  }

  // 交差点までの距離パラメータ t1, t2
  const t1 = (dx * v2.y - dy * v2.x) / det;
  const t2 = (dx * v1.y - dy * v1.x) / det;

  // 延長線の交点が両者の前方向に存在するか (t1 >= 0 かつ t2 >= 0)
  if (t1 < 0 || t2 < 0) {
    return false;
  }

  // 3. 交点までの距離が両者ともに閾値（平均横幅の2倍）以内かを判定
  const widthA = personA.boundingBox?.width ?? DEFAULT_BOUNDING_BOX_WIDTH;
  const widthB = personB.boundingBox?.width ?? DEFAULT_BOUNDING_BOX_WIDTH;
  const avgWidth = (widthA + widthB) / 2;
  const maxDistance = avgWidth * MAX_INTERSECTION_DISTANCE_RATIO;

  return t1 <= maxDistance && t2 <= maxDistance;
}

/**
 * Union-Find クラス（メモリ再利用可能設計）
 */
class UnionFind {
  #parent: number[];

  constructor(size: number) {
    this.#parent = new Array(size);
    this.reset(size);
  }

  reset(size: number): void {
    if (this.#parent.length < size) {
      this.#parent = new Array(size);
    }
    for (let i = 0; i < size; i++) {
      this.#parent[i] = i;
    }
  }

  find(i: number): number {
    let root = i;
    while (root !== this.#parent[root]) {
      root = this.#parent[root];
    }
    let curr = i;
    while (curr !== root) {
      const nxt = this.#parent[curr];
      this.#parent[curr] = root;
      curr = nxt;
    }
    return root;
  }

  union(i: number, j: number): void {
    const rootI = this.find(i);
    const rootJ = this.find(j);
    if (rootI !== rootJ) {
      this.#parent[rootI] = rootJ;
    }
  }

  release(): void {
    this.#parent = [];
  }
}

// 再利用可能な Union-Find インスタンス（OOM防止）
let sharedUnionFind: UnionFind | null = null;

/**
 * 子アルゴリズム 3: 体の向き(Person.direction)の交差および距離判定による前後グループ結合
 */
export function groupByOrientation(initialGroups: Person[][]): Person[][] {
  if (initialGroups.length <= 1) {
    return initialGroups;
  }

  const groupCount = initialGroups.length;

  if (!sharedUnionFind) {
    sharedUnionFind = new UnionFind(groupCount);
  } else {
    sharedUnionFind.reset(groupCount);
  }

  // 隣り合う前後のグループ間のみ比較
  for (let g = 0; g < groupCount - 1; g++) {
    const groupA = initialGroups[g];
    const groupB = initialGroups[g + 1];

    let isConnected = false;

    // 前後のグループ間で横並びの誰か1人でも相手側を向いて交差していたら連れ判定
    for (let i = 0; i < groupA.length; i++) {
      for (let j = 0; j < groupB.length; j++) {
        if (checkOrientationIntersection(groupA[i], groupB[j])) {
          isConnected = true;
          break;
        }
      }
      if (isConnected) {
        break;
      }
    }

    if (isConnected) {
      sharedUnionFind.union(g, g + 1);
    }
  }

  // グループ統合
  const mergedMap = new Map<number, Person[]>();
  for (let i = 0; i < groupCount; i++) {
    const root = sharedUnionFind.find(i);
    if (!mergedMap.has(root)) {
      mergedMap.set(root, []);
    }
    mergedMap.get(root)!.push(...initialGroups[i]);
  }

  const result: Person[][] = Array.from(mergedMap.values());

  // 解放処理（参照クリア）
  mergedMap.clear();

  return result;
}
