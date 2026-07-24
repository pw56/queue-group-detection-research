import { Zip, ZipPassThrough, AsyncFlateStreamHandler } from 'fflate';
import { saveAs } from './utils/saveAs';

// ZIPに含めるファイルを管理する内部配列
interface ZipFileItem {
  name: string;
  data: Uint8Array;
}

const fileQueue: ZipFileItem[] = [];
let hasChanged: boolean = false;
let previousZipBlob: Blob | null = null;

/**
 * ZIPアーカイブにファイルを追加する関数
 * @param name フォルダパスを含むファイル名 (例: "images/photo.png")
 * @param data ファイルのデータ (Uint8Array)
 */
export function addFileToZip(name: string, data: Uint8Array): void {
  fileQueue.push({ name, data });
  hasChanged = true;
}

/**
 * 蓄積されたファイルをZIP圧縮し、ブラウザでダウンロードする関数
 * @param zipFileName 出力するZIPファイル名 (デフォルト: "archive.zip")
 */
export async function downloadZip(zipFileName: string = 'archive.zip'): Promise<void> {
  // 前回から変更がなく、前回の処理結果があれば、前回の成果物を即返す
  if (!hasChanged && previousZipBlob)
    saveAs(previousZipBlob!, zipFileName);

  if (fileQueue.length === 0) {
    throw new Error('No files found');
  }

  return new Promise<void>((resolve, reject) => {
    const chunks: Uint8Array[] = [];

    const zipStreamHandler: AsyncFlateStreamHandler = (err, chunk, final) => {
      if (err) {
        reject(err);
        return;
      }
      
      // データチャンクを配列に回収
      chunks.push(chunk);

      // すべての書き込みが完了したらBlob化してダウンロード
      if (final) {
        const blob = new Blob(chunks, { type: 'application/zip' });
        previousZipBlob = blob; // 使い回し用
        hasChanged = false;
        
        saveAs(blob, zipFileName);
        
        resolve();
      }
    }
    
    // 1. 非同期Zipインスタンスの作成
    const zip = new Zip(zipStreamHandler);

    try {
      // 2. キューにあるファイルを順次Zipストリームに投入
      for (const file of fileQueue) {
        const zipStream = new ZipPassThrough(file.name);
        zip.add(zipStream);
        
        // データを流し込んで終了(terminate)させる
        zipStream.push(file.data, true);
      }

      // 3. すべての追加が終わったらZip自体を終了
      zip.end();
    } catch (error) {
      reject(error);
    }
  });
}