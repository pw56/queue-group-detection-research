// パラメータや座標を指定する設定ファイルです。
export const CONFIG = {
  // 1. 最初に指定した秒数待つ（秒単位で指定）
  initialWaitSeconds: 10,

  // 2. アップロードする画像または動画ファイルのパスと個別のROI JSONの設定
  mediaList: [
    {
      mediaPath: 'input_media/standard.png',
      roiJsonPath: 'input_media/standard_roi.json'
    },
    {
      mediaPath: 'input_media/crowded.png',
      roiJsonPath: 'input_media/crowded_roi.json'
    },
    {
      mediaPath: 'input_media/strangers.png',
      roiJsonPath: 'input_media/strangers_roi.json'
    },
    {
      mediaPath: 'input_media/various_clothes.png',
      roiJsonPath: 'input_media/various_clothes_roi.json'
    },
    {
      mediaPath: 'input_media/queue_video.mp4',
      roiJsonPath: 'input_media/queue_video_roi.json'
    }
  ],

  // 3. なぞる多角形の座標リスト (Canvasの左上を 0,0 としたピクセル値)
  roiPoints: [
    { x: 962, y: 508 }, // スタート地点
    { x: 887, y: 532 }, // 2つ目の角
    { x: 785, y: 528 }, // 3つ目の角
    { x: 365, y: 350 }, // 4つ目の角
    { x: 353, y: 75  }, // 5つ目の角
    { x: 645, y: 67  }, // 6つ目の角
    { x: 992, y: 95  }  // 最後にスタート地点に戻って閉じる
  ],

  // 4. ダウンロードボタンのテキスト（環境に合わせて変更してください）
  downloadButtonName: '実験結果をダウンロード',

  // 5. アプローチ設定（対象WebサイトのURLと保存用ファイル名）
  approaches: [
    {
      targetUrl: 'https://pw56.github.io/queue-group-detection-research/src/approach_01_baseline',
      fileName: 'approach_01_baseline.zip'
    },
    {
      targetUrl: 'https://pw56.github.io/queue-group-detection-research/src/approach_02_roi',
      fileName: 'approach_02_roi.zip'
    },
    {
      targetUrl: 'https://pw56.github.io/queue-group-detection-research/src/approach_03_face_detection',
      fileName: 'approach_03_face_detection.zip'
    },
    {
      targetUrl: 'https://pw56.github.io/queue-group-detection-research/src/approach_04_pose_detection',
      fileName: 'approach_04_pose_detection.zip'
    },
    {
      targetUrl: 'https://pw56.github.io/queue-group-detection-research/src/approach_05_object_pose_hybrid',
      fileName: 'approach_05_object_pose_hybrid.zip'
    },
    {
      targetUrl: 'https://pw56.github.io/queue-group-detection-research/src/approach_06_min_size_enforcer',
      fileName: 'approach_06_min_size_enforcer.zip'
    },
    {
      targetUrl: 'https://pw56.github.io/queue-group-detection-research/src/approach_07_deduplication',
      fileName: 'approach_07_deduplication.zip'
    },
    {
      targetUrl: 'https://pw56.github.io/queue-group-detection-research/src/approach_08_vertical_fragment_consolidation',
      fileName: 'approach_08_vertical_fragment_consolidation.zip'
    },
    {
      targetUrl: 'https://pw56.github.io/queue-group-detection-research/src/approach_09_orientation_distance_grouping',
      fileName: 'approach_09_orientation_distance_grouping.zip'
    },
    {
      targetUrl: 'https://pw56.github.io/queue-group-detection-research/src/approach_10_change_detection_model',
      fileName: 'approach_10_change_detection_model.zip'
    },
    {
      targetUrl: 'https://pw56.github.io/queue-group-detection-research/src/approach_11_vector_orientation_grouping',
      fileName: 'approach_11_vector_orientation_grouping.zip'
    },
    {
      targetUrl: 'https://pw56.github.io/queue-group-detection-research/src/approach_12_person_tracking',
      fileName: 'approach_12_person_tracking.zip'
    }
  ]
};
