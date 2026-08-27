# 3. 体の向きベースの前後グループ化アルゴリズム (groupByOrientation)

本モジュールは、各人物の身体特性から導出した扇形評価領域（Sector）と、**待機列ベクトルによる厚み補正を適用した胴体四角形（Torso Quad）**との交差判定を実施し、相互認識されたペアが属するグループ同士を結合する子アルゴリズムです。

---

## 数式モデル

### (1) 待機列ベクトルに基づく横向き厚み補正
横向きの人物は両肩・両腰の平面射影幅 $W_{\text{torso}}$ が過小評価されます。待機列推定で算出された待機列のベクトル $\boldsymbol{d}$ および人物の全高 $H_i$ に基づき、最小厚み閾値 $W_{\text{min}} = H_i \times k_{\text{thickness}}$ ($k_{\text{thickness}} = 0.2$) を設定します。
幅が閾値未満の場合、胴体ベクトルと垂直な方向（前後厚み方向）へ四角形の頂点を拡大押し出し補正します：

$$W_{\text{effective}} = \max\left( W_{\text{torso}}, \, H_i \cdot k_{\text{thickness}} \right)$$

### (2) 個人の身体サイズに基づく動的到達半径
各人物 $i$ の全高 $H_i$ に距離倍率 $M = 1.2$ を乗算し、個人別の到達半径 $R_i$ を算出します：

$$R_i = H_i \cdot M$$

### (3) 扇形領域 (Sector) と胴体四角形 (Torso Quad) の交差判定
人物 $A$ の扇形領域 $\text{Sector}_A$ と人物 $B$ の補正済み胴体四角形 $\text{Quad}_B$ の重なり判定 $\text{isSectorIntersectingQuad}(\text{Sector}_A, \text{Quad}_B)$ は、以下のいずれかを満たす場合に `true` となります：
1. $\text{Quad}_B$ の頂点のいずれかが $\text{Sector}_A$ 内に含まれる。
2. $\text{Sector}_A$ の原点が $\text{Quad}_B$ の内部に含まれる。
3. $\text{Sector}_A$ の境界レイと $\text{Quad}_B$ の4辺が交差する。

### (4) 相互認識によるグループ間結合 (AND条件)
`index.ts` より引き渡された `Groups` および `QueueLine` を受け取り、異なるグループ間の人物同士で相互に判定領域が交差している場合（AND条件）、そのグループ同士を全統合します：

$$\text{isOrientedTogether}(A, B) = \text{isSectorIntersectingQuad}(\text{Sector}_A, \text{Quad}_B) \quad \land \quad \text{isSectorIntersectingQuad}(\text{Sector}_B, \text{Quad}_A)$$