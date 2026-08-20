// ImageCropper/types.ts
export interface ImageCropperProps {
  imageElement: HTMLImageElement;
  className?: string;
  onCropChange?: (result: CropResult) => void;
}

// 変更: バウンディングボックスの型定義を追加
export interface CroppedBoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

// 変更: 切り取り結果の戻り値型定義を追加
export interface CropResult {
  croppedImage: HTMLImageElement;
  boundingBox: CroppedBoundingBox;
}

export interface ImageCropperRef {
  // 変更: 戻り値を CropResult に変更
  getClippedImage: () => Promise<CropResult>;
}

// アスペクト比を維持した画像のレイアウト情報を保持する型定義
export interface ImageLayout {
  width: number;
  height: number;
  x: number;
  y: number;
}
