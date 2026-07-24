import { addFileToZip } from './exportZip';
import { joinPath } from './utils/joinPath';
import { getPaddedTimestamp } from './utils/getPaddedTimestamp';
import { getExtensionFromFile } from './utils/getExtensionFromFile';

// 画像をfflateで扱う `Uint8Array` に変換してプッシュする内部関数
async function pushBlob(path: string, inputBlobFile: Blob) {
  const arrayBuffer: Uint8Array = await inputBlobFile.bytes();
  addFileToZip(path, arrayBuffer);
}

export async function addInputMediaFile(inputMediaFile: File) {
  const fileName = `input_media_file.${getExtensionFromFile(inputMediaFile)}`;
  await pushBlob(fileName, inputMediaFile);
}

// タイムスタンプ取得して、ファイル名合成も行う
export async function addExtractedFrameAsPng(inputPngFile: Blob, timestamp: number) {
  const fileName = `t_${getPaddedTimestamp(timestamp, 3)}s.png`;
  const path = joinPath('extracted_frames/', fileName);
  await pushBlob(path, inputPngFile);
}

export async function addAnnotatedImageAsPng(inputPngFile: Blob, timestamp: number) {
  const fileName = `t_${getPaddedTimestamp(timestamp, 3)}s.png`;
  const path = joinPath('detection_outputs/', 'annotated_images/', fileName);
  await pushBlob(path, inputPngFile);
}

export async function addObjectAsJson(inputObject: Object, timestamp: number) {
  const fileName = `t_${getPaddedTimestamp(timestamp, 3)}s.json`;
  const path = joinPath('detection_outputs/', 'labels/', fileName);

  // JSON(テキストファイル)は画像とは別の方法でエンコード
  const jsonString = JSON.stringify(inputObject);
  const arrayBuffer: Uint8Array = new TextEncoder().encode(jsonString);
  addFileToZip(path, arrayBuffer);
}
