# 3. 体の向きベースの前後グループ化アルゴリズム (groupByOrientation)

本モジュールは、各人物の身体特性から導出した扇形評価領域（Sector）と、**待機列ベクトルとの角度関係から計算された本来の胴体領域（Torso Quad）**との交差判定を実施し、相互認識されたペアが属するグループ同士を結合する子アルゴリズムです。

---

## 数式モデル

### (1) 待機列ベクトルに基づく幾何学的な本来幅・厚みの幾何復元
人物がカメラに対して斜めまたは横を向いている場合、両肩・両腰の2D射影幅は減少します。
待機列の単位ベクトル $\hat{\boldsymbol{d}}_{\text{queue}}$ と人物の胴体方向ベクトル $\boldsymbol{v}_{\text{torso}}$ のなす角 $\theta$ （$\cos\theta = |\boldsymbol{v}_{\text{torso}} \cdot \hat{\boldsymbol{d}}_{\text{queue}}|$）を利用し、投影比率（$\sin\theta = \sqrt{1 - \cos^2\theta}$）に応じた復元スケール倍率 $S$ を算出します：

$$S = \frac{1}{\max(\sin\theta, 0.2)}$$

算出された本来の正面肩幅 $W_{\text{target}} = H_i \cdot 0.25 \cdot S$（$H_i$ は人物の全高）および人間工学に基づく標準的な胴体厚み $T_{\text{target}} = H_i \cdot 0.15$ に基づいて、胴体四角形（Torso Quad）を元の物理的大きさに幾何学的に復元・押し出し計算します。

### (2) 個人のバウンディングボックス横幅に基づく判定半径
各人物 $i$ の扇形評価領域の到達半径 $R_i$ には、全員一律で自身のバウンディングボックスの横幅（$\text{width}_i$）を使用します：

$$R_i = \text{width}_i$$

### (3) 扇形領域 (Sector) と胴体四角形 (Torso Quad) の交差判定
人物 $A$ の扇形領域 $\text{Sector}_A$ と人物 $B$ の補正済み胴体四角形 $\text{Quad}_B$ の重なり判定 $\text{isSectorIntersectingQuad}(\text{Sector}_A, \text{Quad}_B)$ は、以下のいずれかを満たす場合に `true` となります：
1. $\text{Quad}_B$ の頂点のいずれかが $\text{Sector}_A$ 内に含まれる。
2. $\text{Sector}_A$ の原点が $\text{Quad}_B$ の内部に含まれる。
3. $\text{Sector}_A$ の境界レイと $\text{Quad}_B$ の4辺が交差する。

### (4) 相互認識によるグループ間結合 (AND条件)
`index.ts` より引き渡された `Groups` および `QueueLine` を受け取り、異なるグループ間の人物同士で相互に判定領域が交差している場合（AND条件）、そのグループ同士を全統合します：

$$\text{isOrientedTogether}(A, B) = \text{isSectorIntersectingQuad}(\text{Sector}_A, \text{Quad}_B) \quad \land \quad \text{isSectorIntersectingQuad}(\text{Sector}_B, \text{Quad}_A)$$