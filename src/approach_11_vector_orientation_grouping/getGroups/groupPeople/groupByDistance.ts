import { Groups, Person, Keypoint2D } from '../types';
import { QueueLine } from './estimateQueueLine';

interface DistanceGroupingOptions {
  /** 列の法線（横並び）方向における判定閾値（ピクセル） */
  sideThreshold?: number;
  /** 列の進行（前後）方向における判定閾値（ピクセル） */
  lineThreshold?: number;
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
 * 推定された列の方向に基づいて、人物同士を距離・配置からグループ判定するアルゴリズム
 */
export function groupByDistance(
  people: Person[],
  queueLine: QueueLine | null,
  options: DistanceGroupingOptions = {}
): Groups {
  if (!people || people.length === 0) {
    return [];
  }

  if (people.length === 1 || !queueLine) {
    return people.map(person => [person]);
  }

  const { sideThreshold = 120, lineThreshold = 80 } = options;

  // 列の方向ベクトル \vec{d} = (u, v)
  const u = queueLine.direction.x;
  const v = queueLine.direction.y;

  // 列の法線ベクトル（横並び方向） \vec{n} = (-v, u)
  const nu = -v;
  const nv = u;

  // 各人物を中心座標に変換
  const personData = people.map((person, index) => {
    const box = person.boundingBox;
    const anklePos = getAnklePosition(person.keypoints, ANKLE_SCORE_THRESHOLD);
    
    let cx: number;
    let cy: number;

    if (anklePos) {
      cx = anklePos.x;
      cy = anklePos.y;
    } else if (box) {
      cx = box.originX + box.width / 2;
      cy = box.originY + box.height;
    } else {
      cx = 0;
      cy = 0;
    }

    // 列の代表点からの相対位置
    const dx = cx - queueLine.origin.x;
    const dy = cy - queueLine.origin.y;

    // 列方向（前後）への投影座標 t_line = \vec{r} \cdot \vec{d}
    const tLine = dx * u + dy * v;
    // 法線方向（横並び）への投影座標 t_side = \vec{r} \cdot \vec{n}
    const tSide = dx * nu + dy * nv;

    return {
      person,
      index,
      cx,
      cy,
      tLine,
      tSide,
      boxWidth: box ? box.width : 50,
      boxHeight: box ? box.height : 50
    };
  });

  // Union-Find 法（素集合データ構造）の準備
  const parent = Array.from({ length: people.length }, (_, i) => i);

  const find = (i: number): number => {
    let root = i;
    while (root !== parent[root]) {
      root = parent[root];
    }
    let curr = i;
    while (curr !== root) {
      const nxt = parent[curr];
      parent[curr] = root;
      curr = nxt;
    }
    return root;
  };

  const union = (i: number, j: number): void => {
    const rootI = find(i);
    const rootJ = find(j);
    if (rootI !== rootJ) {
      parent[rootI] = rootJ;
    }
  };

  // 全ペアの組み合わせにおいて横並び判定を実施
  for (let i = 0; i < personData.length; i++) {
    for (let j = i + 1; j < personData.length; j++) {
      const pA = personData[i];
      const pB = personData[j];

      // 横並び（法線）方向の投影距離 \Delta t_{side} = |t_{side, A} - t_{side, B}|
      const deltaSide = Math.abs(pA.tSide - pB.tSide);
      // 前後（列進行）方向の投影距離 \Delta t_{line} = |t_{line, A} - t_{line, B}|
      const deltaLine = Math.abs(pA.tLine - pB.tLine);

      // 動的バウンディングボックスサイズに応じた許容スケーリング
      const avgWidth = (pA.boxWidth + pB.boxWidth) / 2;
      const dynamicSideThreshold = Math.max(sideThreshold, avgWidth * 1.5);

      // 横並び条件:
      // 「列と直交する方向への広がり（deltaSide）が閾値以内」かつ
      // 「列方向の前後のズレ（deltaLine）が小さく同じ位置帯にいる」
      if (deltaSide <= dynamicSideThreshold && deltaLine <= lineThreshold) {
        union(i, j);
      }
    }
  }

  // 連結成分ごとにグループを集約
  const groupMap = new Map<number, Person[]>();

  for (let i = 0; i < people.length; i++) {
    const root = find(i);
    if (!groupMap.has(root)) {
      groupMap.set(root, []);
    }
    groupMap.get(root)!.push(people[i]);
  }

  return Array.from(groupMap.values());
}
