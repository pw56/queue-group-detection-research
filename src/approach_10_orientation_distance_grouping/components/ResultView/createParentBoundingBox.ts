import { Group, BoundingBoxRect } from '../../getGroups';

// グループを内包する親のバウンディングボックスを生成する関数
export function createParentBoundingBox(people: Group): BoundingBoxRect | null {
  // 配列が空、または有効なBBoxがない場合はnullを返す
  if (!people || people.length === 0) {
    return null;
  }

  // 1つ目の要素で初期peop
  let globalMinX = Infinity;
  let globalMinY = Infinity;
  let globalMaxX = -Infinity;
  let globalMaxY = -Infinity;
  let validBBoxCount = 0;

  for (const person of people) {
    const bbox = person.boundingBox;
    if (!bbox) continue;

    validBBoxCount++;

    // MediaPipeのプロパティ（originX, originY, width, height）を使用
    const minX = bbox.originX;
    const minY = bbox.originY;
    const maxX = bbox.originX + bbox.width;
    const maxY = bbox.originY + bbox.height;

    // 最小値・最大値の更新
    if (minX < globalMinX) globalMinX = minX;
    if (minY < globalMinY) globalMinY = minY;
    if (maxX > globalMaxX) globalMaxX = maxX;
    if (maxY > globalMaxY) globalMaxY = maxY;
  }

  // 有効なBBoxが1つも含まれていなかった場合
  if (validBBoxCount === 0) {
    return null;
  }

  // 新しい親BBoxの幅と高さを計算
  const parentWidth = globalMaxX - globalMinX;
  const parentHeight = globalMaxY - globalMinY;

  return {
    originX: globalMinX,
    originY: globalMinY,
    width: parentWidth,
    height: parentHeight
  };
}
