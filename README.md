# 待機列のグループの検出に関する研究

## 概要
待機列のグループの検出に関する研究のレポート。

## インタラクティブデモ
論文内で考案したグループ検出のアプローチの挙動を、ブラウザ上で検証できるデモページです。
ローカルでの環境構築を必要とせず、各アプローチによる検出結果の違いを確認できます。

- **アプローチ1 (ベースライン手法)**: [デモページを開く](https://pw56.github.io/queue-group-detection-research/src/approach_01_baseline/dist)
- **アプローチ2 (事前指定の関心領域（ROI）による空間制限手法)**: [デモページを開く](https://pw56.github.io/queue-group-detection-research/src/approach_02_roi/dist)
- **アプローチ3 (顔検出に基づく存在判定手法)**: [デモページを開く](https://pw56.github.io/queue-group-detection-research/src/approach_03_face_detection/dist)

## 推奨環境
### 論文執筆
- **LaTeXエンジン**: LuaLaTeX (TeX Live 2025以降)
- **主要パッケージ**: `tcolorbox`, `amsmath`, `listings`, `graphicx`

### デモページ（ローカル実行）
- **ランタイム**: Node.js v24以降

## ビルド方法

### 論文のビルド
ビルドには`Latexmk`と`LuaLaTeX`を使用します。リポジトリのルートで以下のコマンドを実行してください。

```bash
latexmk -lualatex main.tex
```

### デモページのビルド
デモ用のReactアプリをローカル環境で動かす場合は、各アプローチのディレクトリ（例: `src/approach_01_baseline`）に移動し、以下のコマンドを実行してください。
  
**注意:** 
GitHub CodespacesではGitHub Codespaces自体のポートアクセス時のリダイレクトの仕様により、デモページでONNXファイルが読み込まれない場合がございます。
ローカル環境でテストをされる場合はデスクトップ環境を推奨しております。

```bash
# 対象のディレクトリへ移動
cd src/approach_01_baseline

# 依存パッケージのインストール
npm ci

# ローカル開発サーバーの起動 (ブラウザで確認可能)
npm run dev
```
