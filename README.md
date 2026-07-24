# 待機列のグループの検出に関する研究

## 概要
待機列のグループの検出に関する研究のレポート。

## インタラクティブデモ
論文内で考案したグループ検出のアプローチの挙動を、ブラウザ上で検証できるデモページです。
ローカルでの環境構築を必要とせず、各アプローチによる検出結果の違いを確認できます。

- **アプローチ1 (ベースライン手法)**: [デモページを開く](https://pw56.github.io/queue-group-detection-research/listings/approach_01_baseline/)

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
デモ用のReactアプリをローカル環境で動かす場合は、各アプローチのディレクトリ（例: `listings/approach_01_baseline`）に移動し、以下のコマンドを実行してください。

```bash
# 対象のディレクトリへ移動
cd listings/approach_01_baseline

# 依存パッケージのインストール
npm install

# ローカル開発サーバーの起動 (ブラウザで確認可能)
npm run dev

# 成果物のビルド (distディレクトリに出力)
npm run build
```
