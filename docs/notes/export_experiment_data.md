# 出力する実験データ

```yaml
- Zip
  - input_data.mp4 # 元データ(*.png, *.jpg, *.mp4, *.movなど)
  - original_images # プログラムで出力結果を使用することはないので、動画内のタイムスタンプをファイル名に使用
    - t_001s.png # ファイル名のタイムスタンプは秒
    - t_002s.png # ファイル名の扱いやすさでタイムスタンプは最大3桁(999秒 = 16分39秒)
  - result_images # バウンディングボックスを合成した画像
    - t_001s.png
    - t_002s.png
  - detections # JSONで出力されたバウンディングボックス
    - t_001s.json
    - t_002s.json
```
