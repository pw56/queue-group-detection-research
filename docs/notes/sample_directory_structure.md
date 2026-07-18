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
│   ├── abstract.tex      # 概要
│   ├── introduction.tex  # 第1章：はじめに
│   ├── methodology.tex   # 第2章：研究手法
│   ├── results.tex       # 第3章：結果と考察
│   └── conclusion.tex    # 第4章：おわりに
│
├── figures/              # 画像ファイルを格納するフォルダ
│   ├── workflow.pdf      # ベクター画像（PDF形式がベスト）
│   └── chart.png         # ラスター画像（PNG形式）
│
└── listings/             # プログラムのソースコードを外部参照する場合のフォルダ
    └── algorithm.py      # \lstinputlisting 等で読み込むコード
```