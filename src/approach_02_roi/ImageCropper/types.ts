// ImageCropper/types.ts
export interface ImageCropperProps {
  imageElement: HTMLImageElement;
  className?: string;
  onCropChange?: (result: CropResult) => void;
}

export interface CroppedBoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface CropResult {
  croppedImage: HTMLImageElement;
  boundingBox: CroppedBoundingBox;
}

export interface ImageCropperRef {
  getClippedImage: () => Promise<CropResult>;
}

// アスペクト比を維持した画像のレイアウト情報を保持する型定義
export interface ImageLayout {
  width: number;
  height: number;
  x: number;
  y: number;
}
