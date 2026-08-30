import { Person } from '../../types';

// ==========================================
// 定数定義 (基準・閾値)
// ==========================================
/** 延長線の交点までの最大距離倍率（バウンディングボックス平均幅に対する倍率） */
const MAX_INTERSECTION_DISTANCE_RATIO = 2.0;

/** 体の向きの交差角度閾値（ラジアン）: 対向・交差を判定するための閾値（例: 120度以上） */
const ORIENTATION_ANGLE_THRESHOLD_RAD = (Math.PI * 2) / 3;

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
 * 体の向き(Person.direction)の延長線の交差、交点距離、および交差角度によるグループ判定
 * 
 * LaTeX Math Note:
 * \text{Line 1: } \boldsymbol{P}_1 + t_1 \boldsymbol{d}_1, \quad \text{Line 2: } \boldsymbol{P}_2 + t_2 \boldsymbol{d}_2
 * \text{det } = d_{1x} d_{2y} - d_{1y} d_{2x}
 * t_1 = \frac{(P_{2x} - P_{1x}) d_{2y} - (P_{2y} - P_{1y}) d_{2x}}{\text{det}}
 * t_2 = \frac{(P_{2x} - P_{1x}) d_{1y} - (P_{2y} - P_{1y}) d_{1x}}{\text{det}}
 * \theta = \arccos(\boldsymbol{d}_1 \cdot \boldsymbol{d}_2)
 */
function checkOrientationIntersection(personA: Person, personB: Person): boolean {
  if (!getPersonCenterAndDirection(personA, p1, v1) || !getPersonCenterAndDirection(personB, p2, v2)) {
    return false;
  }

  // 行列式（外積）
  const det = v1.x * v2.y - v1.y * v2.x;

  const dx = p2.x - p1.x;
  const dy = p2.y - p1.y;

  // 延長線の交点パラメータ t1, t2 の計算
  const t1 = (dx * v2.y - dy * v2.x) / det;
  const t2 = (dx * v1.y - dy * v1.x) / det;

  // 1. 延長線の交点が両者の前方向に存在するか (t1 >= 0 かつ t2 >= 0)
  if (t1 < 0 || t2 < 0) {
    return false;
  }

  // 2. 平均バウンディングボックス幅に基づく距離閾値の算出
  const widthA = personA.boundingBox?.width ?? DEFAULT_BOUNDING_BOX_WIDTH;
  const widthB = personB.boundingBox?.width ?? DEFAULT_BOUNDING_BOX_WIDTH;
  const avgWidth = (widthA + widthB) / 2;
  const maxDistance = avgWidth * MAX_INTERSECTION_DISTANCE_RATIO;

  // 3. 交点までの距離が両者ともに閾値（平均横幅の2倍）以内かを判定
  if (t1 > maxDistance || t2 > maxDistance) {
    return false;
  }

  // 4. 交差角度（ベクトル間のなす角）の判定
  const dot = Math.max(-1, Math.min(1, v1.x * v2.x + v1.y * v2.y));
  const angle = Math.acos(dot);

  return angle >= ORIENTATION_ANGLE_THRESHOLD_RAD;
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

    // 前後のグループ間で横並びの誰か1人でも相手方向へ交差していたら連れ判定
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
