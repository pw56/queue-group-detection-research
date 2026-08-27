# 3. 体の向きベースの前後グループ化アルゴリズム (groupByOrientation)

本モジュールは、各人物の身体特性から導出した扇形評価領域（Sector）と**胴体四角形（Torso Quad: 両肩・両腰で形成される多角形領域）**との空間的交差判定を実施し、相互認識されたペアが属するグループ同士を結合する子アルゴリズムです。

---

## 数式モデル

### (1) 胴体方向ベクトルおよび四角形領域の算出
左肩 $k_5$, 右肩 $k_6$, 左腰 $k_{11}$, 右腰 $k_{12}$ のキーポイントより、胴体の方向単位ベクトル $\boldsymbol{v}_{\text{torso}}$ および胴体四角形 $\text{Quad} = \{\boldsymbol{k}_5, \boldsymbol{k}_6, \boldsymbol{k}_{12}, \boldsymbol{k}_{11}\}$ を生成します。

### (2) 個人の身体サイズに基づく動的到達半径
各人物 $i$ の全高（またはBBの高さ） $H_i$ に距離倍率 $M = 1.2$ を乗算し、個人別の到達半径 $R_i$ を算出します：

$$R_i = H_i \cdot M$$

### (3) 扇形領域 (Sector) と胴体四角形 (Torso Quad) の交差判定
人物 $A$ の扇形領域 $\text{Sector}_A$（半径 $R_A$, 視野角 $\theta_{\text{FOV}}$）と人物 $B$ の胴体四角形 $\text{Quad}_B$ の重なり判定 $\text{isSectorIntersectingQuad}(\text{Sector}_A, \text{Quad}_B)$ は、以下のいずれかを満たす場合に `true` となります：
1. $\text{Quad}_B$ の頂点のいずれかが $\text{Sector}_A$ 内に含まれる。
2. $\text{Sector}_A$ の原点（中心位置）が $\text{Quad}_B$ の内部に含まれる。
3. $\text{Sector}_A$ の境界レイ（扇形の左右端線分）と $\text{Quad}_B$ の4辺のいずれかが幾何学的に交差する。

### (4) 相互認識によるグループ間結合 (AND条件)
人物 $A \in \text{Group}_1$ と 人物 $B \in \text{Group}_2$ において、**互いの扇形が相手の胴体四角形と交差している場合（AND条件）**、そのグループ全体（$\text{Group}_1$ と $\text{Group}_2$）を統合します：

$$\text{isOrientedTogether}(A, B) = \text{isSectorIntersectingQuad}(\text{Sector}_A, \text{Quad}_B) \quad \land \quad \text{isSectorIntersectingQuad}(\text{Sector}_B, \text{Quad}_A)$$