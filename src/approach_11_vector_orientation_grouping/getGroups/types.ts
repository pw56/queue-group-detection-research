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
  boundingBox?: BoundingBoxRect;
  keypoints?: Keypoint2D[];
  direction?: DirectionVector;
}

// Group型およびGroups型をPersonベースに変更
type Group = Person[];
type Groups = Group[];

type GroupDetectionImageSource = HTMLImageElement;

export type { Group, Groups, GroupDetectionImageSource };

// ワーカー向け
interface WorkerInitMessage {
  type: 'INIT';
  width: number;
  height: number;
}

interface WorkerPoseMessage {
  type: 'PROCESS_POSE';
  id: number;
  imageBitmap: ImageBitmap;
  rect: BoundingBoxRect;
}

interface WorkerPeopleMessage {
  type: 'PROCESS_PEOPLE';
  id: number;
  imageBitmap: ImageBitmap;
  imgWidth: number;
  imgHeight: number;
}

type WorkerIncomingMessage = WorkerInitMessage | WorkerPoseMessage | WorkerPeopleMessage;

interface WorkerPoseResultMessage {
  type: 'POSE_RESULT';
  id: number;
  keypoints: Keypoint2D[];
  error?: string;
}

interface WorkerPeopleResultMessage {
  type: 'PEOPLE_RESULT';
  id: number;
  people: Person[];
  error?: string;
}

type WorkerResultMessage = WorkerPoseResultMessage | WorkerPeopleResultMessage;

export type {
  WorkerInitMessage,
  WorkerIncomingMessage,
  WorkerPoseResultMessage,
  WorkerPeopleResultMessage,
  WorkerResultMessage
};
