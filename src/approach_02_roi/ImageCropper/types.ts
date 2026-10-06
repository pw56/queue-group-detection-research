export interface CroppedBoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface CropResult {
  croppedImage: HTMLImageElement;
  boundingBox: CroppedBoundingBox;
  roiContour: number[];
}

export interface ImageCropperProps {
  imageElement: HTMLImageElement;
  className?: string;
  onCropChange?: (cropResult: CropResult) => void;
  onReady?: () => void; // レイアウト計算完了通知用のイベントコールバック
}

export interface ImageCropperRef {
  getClippedImage: () => Promise<CropResult>;
  setRoiContour: (points: number[]) => Promise<CropResult | null>;
}

// アスペクト比を維持した画像のレイアウト情報を保持する型定義
export interface ImageLayout {
  width: number;
  height: number;
  x: number;
  y: number;
}
