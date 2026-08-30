import { Person } from '../../types';

// ==========================================
// 定数定義 (基準・閾値)
// ==========================================
/** 延長線の交点までの最大距離の倍率（バウンディングボックス平均幅に対する倍率） */
const MAX_INTERSECTION_DISTANCE_RATIO = 2.0;

/** 体の向きの交差角度閾値（ラジアン）: 例 約45度以下でグループ判定 */
const ORIENTATION_ANGLE_THRESHOLD_RAD = Math.PI / 4;

/** BoundingBox未定義時のデフォルト横幅 */
const DEFAULT_BOUNDING_BOX_WIDTH = 100.0;

// ==========================================
// 再利用可能な内部変数 (OOM防止・ガベージコレクション低減)
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
 * 人物の中心座標と体の向き（ベクトル）を取得する helper
 */
function getPersonCenterAndDirection(person: Person, outCenter: Point2D, outDir: Point2D): boolean {
  if (!person.boundingBox || !person.direction) {
    return false;
  }
  
  // 中心座標
  outCenter.x = person.boundingBox.originX + person.boundingBox.width / 2;
  outCenter.y = person.boundingBox.originY + person.boundingBox.height / 2;

  // 方向ベクトルの正規化
  const len = Math.hypot(person.direction.x, person.direction.y);
  if (len === 0) {
    return false;
  }
  outDir.x = person.direction.x / len;
  outDir.y = person.direction.y / len;

  return true;
}

/**
 * 2直線の交差点および各点からの距離を算出する
 * 
 * LaTeX Math Note:
 * \text{Line 1: } \boldsymbol{P}_1 + t_1 \boldsymbol{d}_1, \quad \text{Line 2: } \boldsymbol{P}_2 + t_2 \boldsymbol{d}_2
 * \text{Cross product det } = d_{1x} d_{2y} - d_{1y} d_{2x}
 * t_1 = \frac{(P_{2x} - P_{1x}) d_{2y} - (P_{2y} - P_{1y}) d_{2x}}{\text{det}}
 * t_2 = \frac{(P_{2x} - P_{1x}) d_{1y} - (P_{2y} - P_{1y}) d_{1x}}{\text{det}}
 */
function checkOrientationIntersection(personA: Person, personB: Person): boolean {
  if (!getPersonCenterAndDirection(personA, p1, v1) || !getPersonCenterAndDirection(personB, p2, v2)) {
    return false;
  }

  const det = v1.x * v2.y - v1.y * v2.x;
  // ほぼ平行の場合は交差なし
  if (Math.abs(det) < 1e-6) {
    return false;
  }

  const dx = p2.x - p1.x;
  const dy = p2.y - p1.y;

  const t1 = (dx * v2.y - dy * v2.x) / det;
  const t2 = (dx * v1.y - dy * v1.x) / det;

  // 延長線の交点が前方向にあるか（負の場合は背後への延長）
  if (t1 < 0 || t2 < 0) {
    return false;
  }

  // 平均バウンディングボックス幅の計算
  const widthA = personA.boundingBox?.width ?? DEFAULT_BOUNDING_BOX_WIDTH;
  const widthB = personB.boundingBox?.width ?? DEFAULT_BOUNDING_BOX_WIDTH;
  const avgWidth = (widthA + widthB) / 2;
  const maxDistance = avgWidth * MAX_INTERSECTION_DISTANCE_RATIO;

  // 交点までの距離が閾値以内か
  if (t1 > maxDistance || t2 > maxDistance) {
    return false;
  }

  // ベクトル間のなす角（交差角度）のチェック
  /**
   * LaTeX Math Note:
   * \cos(\theta) = \boldsymbol{d}_1 \cdot \boldsymbol{d}_2
   * \theta = \arccos(\boldsymbol{d}_1 \cdot \boldsymbol{d}_2)
   */
  const dot = Math.max(-1, Math.min(1, v1.x * v2.x + v1.y * v2.y));
  const angle = Math.acos(dot);

  return angle <= ORIENTATION_ANGLE_THRESHOLD_RAD;
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

// 再利用可能な Union-Find インスタンス
let sharedUnionFind: UnionFind | null = null;

/**
 * 子アルゴリズム 3: 体の向き(ベクトル)の交差判定による前後グループ結合
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

    // 横並びの誰か1人でも前または後ろの列のグループに向いていたら結合
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

  // グループの統合処理
  const mergedMap = new Map<number, Person[]>();
  for (let i = 0; i < groupCount; i++) {
    const root = sharedUnionFind.find(i);
    if (!mergedMap.has(root)) {
      mergedMap.set(root, []);
    }
    mergedMap.get(root)!.push(...initialGroups[i]);
  }

  const result: Person[][] = Array.from(mergedMap.values());

  // 明示的なメモリ解放（参照クリア）
  mergedMap.clear();

  return result;
}
