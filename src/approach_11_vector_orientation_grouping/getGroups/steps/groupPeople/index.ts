import { Groups, Person } from '../../types';
import { estimateQueueLine } from './estimateQueueLine';
import { groupByDistance } from './groupByDistance';
import { groupByOrientation } from './groupByOrientation';

/**
 * 人物リストから位置と向きを考慮してグループ（横並び＋前後跨ぎ）を判定・出力する
 */
export function groupPeople(people: Person[]): Groups {
  if (!people || people.length === 0) {
    return [];
  }

  // 子アルゴリズム 1: 人物分布と向きから列（直線ベクトル）を推定
  const queueLine = estimateQueueLine(people);

  // 子アルゴリズム 2: 推定された列を基準とした距離・位置関係からグループ分け
  const distanceGroups = groupByDistance(people, queueLine);

  // 子アルゴリズム 3: 隣り合う前後のグループ間における体の向き(ベクトル)交差判定によるグループ統合
  const finalGroups = groupByOrientation(distanceGroups);

  return finalGroups;
}
