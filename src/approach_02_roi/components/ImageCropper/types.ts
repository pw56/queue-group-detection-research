export interface ImageCropperProps {
  imageElement: HTMLImageElement; 
  className?: string;             
}

export interface ImageCropperRef {
  getClippedImage: () => Promise<HTMLImageElement>;
}

// アスペクト比を維持した画像のレイアウト情報を保持する型定義
export interface ImageLayout {
  width: number;
  height: number;
  x: number;
  y: number;
}
