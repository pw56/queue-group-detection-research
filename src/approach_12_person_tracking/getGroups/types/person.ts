// バウンディングボックス
export interface BoundingBoxRect {
  originX: number;
  originY: number;
  width: number;
  height: number;
}

// 2Dポイント（骨格の座標）
export interface Keypoint2D {
  x: number;
  y: number;
  score?: number;
  name?: string;
}

// 向きのベクトル表現
export interface DirectionVector {
  x: number;
  y: number;
  z?: number;
}

// 人物情報型（全てのプロパティが任意）
export interface Person {
  id?: string;
  boundingBox?: BoundingBoxRect;
  keypoints?: Keypoint2D[];
  direction?: DirectionVector;
}
