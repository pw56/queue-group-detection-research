import { Groups, Person } from '../../types';
import { estimateQueueLine } from './estimateQueueLine';
import { groupByDistance } from './groupByDistance';

/**
 * 人物リストから位置と向きを考慮してグループ（横並び等）を判定・出力する
 */
export function groupPeople(people: Person[]): Groups {
  if (!people || people.length === 0) {
    return [];
  }

  // 子アルゴリズム 1: 人物分布と向きから列（直線ベクトル）を推定
  const queueLine = estimateQueueLine(people);

  // 子アルゴリズム 2: 推定された列を基準とした距離・位置関係からグループ分け
  const groups = groupByDistance(people, queueLine);

  return groups;
}
