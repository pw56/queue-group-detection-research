// パラメータや座標を指定する設定ファイルです。
export const CONFIG = {
  // 1. 最初に指定した秒数待つ（秒単位で指定）
  initialWaitSeconds: 10,

  // 2. アップロードする画像または動画ファイルのパス
  mediaPath: [
    'my_image1.png',
    'my_image2.png'
  ],

  // 3. なぞる多角形の座標リスト (Canvasの左上を 0,0 としたピクセル値)
  roiPoints: [
    { x: 200, y: 150 }, // スタート地点
    { x: 400, y: 150 }, // 2つ目の角
    { x: 300, y: 350 }, // 3つ目の角
    { x: 200, y: 150 }  // 最後にスタート地点に戻って閉じる
  ],

  // 4. ダウンロードボタンのテキスト（環境に合わせて変更してください）
  downloadButtonName: '実験結果をダウンロード',

  // 5. 研究用WebサイトのURL
  targetUrl: [
    'http://localhost:3000',
    'http://localhost:3001'
  ],
  
  // 6. ダウンロードした結果を保存するファイル名
  saveAsName: 'experimental_results.zip'
};
