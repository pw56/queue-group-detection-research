# プロジェクトのディレクトリ構成例

```
my-latex-project/
├── main.tex              # 全体を統括する親ファイル（コンパイル対象）
├── references.bib        # 参考文献のデータベース（BibTeX用）
│
├── preamble/             # パッケージや独自の命令を定義するフォルダ
│   └── settings.tex      # 余白、フォント、マクロなどの設定ファイル
│
├── chapters/             # 本文の各章を格納するフォルダ
│   ├── abstract.tex      # 1. 要旨
│   ├── theme.tex         # 2. テーマ
│   ├── background.tex    # 3. 背景
│   ├── problem.tex       # 4. 問題提起
│   ├── objective.tex     # 5. 目的
│   ├── approach01.tex    # 6. アプローチ01
│   ├── approach02.tex    # 7. アプローチ02(以後最後のアプローチまで繰り返す)
│   ├── summary.tex       # 8. 研究の要約
│   └── future_work.tex   # 9. 今後の課題
│
├── figures/              # 画像ファイルを格納するフォルダ
│   ├── workflow.pdf      # ベクター画像（PDF形式がベスト）
│   └── chart.png         # ラスター画像（PNG形式）
│
└── src/             # プログラムのソースコードを外部参照する場合のフォルダ
    └── algorithm.py      # \lstinputlisting 等で読み込むコード
```