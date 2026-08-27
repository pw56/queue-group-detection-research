import { Groups, Person, Keypoint2D } from '../types';
import { QueueLine } from './estimateQueueLine';

/**
 * 【子アルゴリズム 3】体の向き・評価領域相互認識ベースの前後グループ化アルゴリズム
 *
 * 【LaTeX数式メモ】
 * 1. 胴体ベクトル (腰中点から肩中点への単位ベクトル):
 *    $$\boldsymbol{p}_{shoulder} = \frac{\boldsymbol{k}_{5} + \boldsymbol{k}_{6}}{2}, \quad \boldsymbol{p}_{hip} = \frac{\boldsymbol{k}_{11} + \boldsymbol{k}_{12}}{2}$$
 *    $$\boldsymbol{v}_{torso} = \frac{\boldsymbol{p}_{shoulder} - \boldsymbol{p}_{hip}}{\|\boldsymbol{p}_{shoulder} - \boldsymbol{p}_{hip}\|}$$
 *
 * 2. 視界扇形領域 (Sector):
 *    $$\text{Sector}(\boldsymbol{p}, \boldsymbol{v}, R, \theta) = \{ \boldsymbol{x} \mid \|\boldsymbol{x} - \boldsymbol{p}\| \le R \ \land \ \frac{(\boldsymbol{x} - \boldsymbol{p}) \cdot \boldsymbol{v}}{\|\boldsymbol{x} - \boldsymbol{p}\|} \ge \cos(\theta / 2) \}$$
 *
 * 3. 相互認識判定 (AND条件):
 *    $$\text{isSectorIntersectingQuad}(\text{Sector}_A, \text{Quad}_B) \quad \land \quad \text{isSectorIntersectingQuad}(\text{Sector}_B, \text{Quad}_A)$$
 */

interface OrientationGroupingOptions {
  /** 前方評価領域（視野角）の開き角 (ラジアン, デフォルト: 90度 = ±45度) */
  fovAngle?: number;
  /** 個人の体サイズに乗算する距離倍率 (デフォルト: 1.2) */
  distanceMultiple?: number;
  /** 人体の最小厚み比率 (身長に対する比率, デフォルト: 0.2) */
  bodyThicknessRatio?: number;
}

// 閾値定数
const KEYPOINT_SCORE_THRESHOLD = 0.5;
const DEFAULT_FOV_ANGLE = Math.PI / 2; // 90度（正面を中心として左右45度ずつ）
const DEFAULT_DISTANCE_MULTIPLE = 1.2;
const DEFAULT_BODY_THICKNESS_RATIO = 0.2; // 横向き時の最小厚み（対身長比）

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
 * 胴体の向き（両肩・両腰のキーポイント）から2D平面での方向ベクトルを取得する
 */
function getTorsoDirectionVector(keypoints?: Keypoint2D[]): Point | null {
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

/**
 * 待機列のベクトルを利用して、横向きの人物の胴体四角形（TorsoQuad）に本来の大きさ（逆投影・幾何補正）を適用して取得する
 */
function getCorrectedTorsoQuad(
  person: Person,
  queueLine: QueueLine | null,
  thicknessRatio: number
): TorsoQuad | null {
  const keypoints = person.keypoints;
  const bodySize = estimatePersonBodySize(person);

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
      let pLS = { x: ls.x, y: ls.y };
      let pRS = { x: rs.x, y: rs.y };
      let pRH = { x: rh.x, y: rh.y };
      let pLH = { x: lh.x, y: lh.y };

      const dir = getTorsoDirectionVector(keypoints);

      // 待機列ベクトルが存在する場合、行列直線と身体方向から本来の正面幅・本来の厚みを幾何学的に復元
      if (queueLine && dir) {
        // 待機列の方向単位ベクトル
        const qDir = queueLine.direction;
        const qLen = Math.hypot(qDir.x, qDir.y);

        if (qLen > 0) {
          const uQ = { x: qDir.x / qLen, y: qDir.y / qLen };

          // 胴体の向きと列方向のなす角 θ の内積 cos(θ)
          const cosTheta = Math.abs(dir.x * uQ.x + dir.y * uQ.y);
          // シータのサイン値 sin(θ) = sqrt(1 - cos^2(θ))
          const sinTheta = Math.sqrt(Math.max(0, 1 - cosTheta * cosTheta));

          // 人体の標準的な肩幅（全高の約0.25倍）および厚み（全高の約0.15倍）
          const expectedWidth = bodySize * 0.25;
          const expectedThickness = bodySize * (thicknessRatio > 0 ? thicknessRatio : 0.15);

          // 横向き角度に応じた投影幅と本来のサイズからの復元比率 (1 / max(sin(θ), 0.2))
          const scaleFactor = 1 / Math.max(sinTheta, 0.2);
          const targetWidth = Math.min(expectedWidth, expectedWidth * scaleFactor);

          const currentWidth = (Math.hypot(pRS.x - pLS.x, pRS.y - pLS.y) + Math.hypot(pRH.x - pLH.x, pRH.y - pLH.y)) / 2;

          if (currentWidth < targetWidth) {
            // 肩線・腰線ベクトル（左右方向）
            const lrDir = { x: pRS.x - pLS.x, y: pRS.y - pLS.y };
            const lrLen = Math.hypot(lrDir.x, lrDir.y);

            const uLR = lrLen > 0 ? { x: lrDir.x / lrLen, y: lrDir.y / lrLen } : { x: -dir.y, y: dir.x };
            const expandWidth = (targetWidth - currentWidth) / 2;

            // 幅方向への復元補正
            pLS = { x: pLS.x - uLR.x * expandWidth, y: pLS.y - uLR.y * expandWidth };
            pRS = { x: pRS.x + uLR.x * expandWidth, y: pRS.y + uLR.y * expandWidth };
            pRH = { x: pRH.x + uLR.x * expandWidth, y: pRH.y + uLR.y * expandWidth };
            pLH = { x: pLH.x - uLR.x * expandWidth, y: pLH.y - uLR.y * expandWidth };
          }

          // 胴体前後の厚み方向への押し出し補正
          const normal = { x: -dir.y, y: dir.x };
          const expandThickness = expectedThickness / 2;

          pLS = { x: pLS.x - normal.x * expandThickness, y: pLS.y - normal.y * expandThickness };
          pRS = { x: pRS.x + normal.x * expandThickness, y: pRS.y + normal.y * expandThickness };
          pRH = { x: pRH.x + normal.x * expandThickness, y: pRH.y + normal.y * expandThickness };
          pLH = { x: pLH.x - normal.x * expandThickness, y: pLH.y - normal.y * expandThickness };
        }
      }

      return [pLS, pRS, pRH, pLH];
    }
  }

  // 骨格が取れない場合はBoundingBoxから四角形を代替作成
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
 * 2人の人物が互いの扇形評価領域と胴体四角形で相互認識（AND条件）されているかをチェック
 */
export function isOrientedTogether(
  personA: Person,
  personB: Person,
  queueLine: QueueLine | null = null,
  options: OrientationGroupingOptions = {}
): boolean {
  const fovAngle = options.fovAngle ?? DEFAULT_FOV_ANGLE;
  const distMultiple = options.distanceMultiple ?? DEFAULT_DISTANCE_MULTIPLE;
  const thicknessRatio = options.bodyThicknessRatio ?? DEFAULT_BODY_THICKNESS_RATIO;

  const dirA = personA.direction
    ? { x: personA.direction.x, y: personA.direction.y }
    : getTorsoDirectionVector(personA.keypoints);

  const dirB = personB.direction
    ? { x: personB.direction.x, y: personB.direction.y }
    : getTorsoDirectionVector(personB.keypoints);

  if (!dirA || !dirB) return false;

  const quadA = getCorrectedTorsoQuad(personA, queueLine, thicknessRatio);
  const quadB = getCorrectedTorsoQuad(personB, queueLine, thicknessRatio);

  if (!quadA || !quadB) return false;

  const boxA = personA.boundingBox;
  const boxB = personB.boundingBox;

  if (!boxA || !boxB) return false;

  const posA = { x: boxA.originX + boxA.width / 2, y: boxA.originY + boxA.height / 2 };
  const posB = { x: boxB.originX + boxB.width / 2, y: boxB.originY + boxB.height / 2 };

  // 各自の身体サイズに基づく個別半径の計算
  const sizeA = estimatePersonBodySize(personA);
  const sizeB = estimatePersonBodySize(personB);

  const sectorA: Sector = { origin: posA, dir: dirA, radius: sizeA * distMultiple, fovAngle };
  const sectorB: Sector = { origin: posB, dir: dirB, radius: sizeB * distMultiple, fovAngle };

  // Aの扇形がBの胴体四角形と交差し、かつBの扇形がAの胴体四角形と交差する (AND条件)
  return isSectorIntersectingQuad(sectorA, quadB) && isSectorIntersectingQuad(sectorB, quadA);
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
