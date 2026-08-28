# 3. 体の向きベースの前後グループ化アルゴリズム (groupByOrientation)

本モジュールは、各人物の身体特性から導出した扇形評価領域（Sector）と胴体領域（Torso Quad）との交差判定を実施し、相互認識されたペアが属するグループ同士を結合する子アルゴリズムです。

---

## 数式モデル

### (1) 前方指向時の除外判定（誤統合の防止）
正しく待機列に並んでいる人物同士が誤って前後統合されるのを防ぐため、待機列方向ベクトル $\hat{\boldsymbol{d}}_{\text{queue}}$ と各人物の胴体方向ベクトル $\boldsymbol{v}$ の角度差を評価します。
比較する両名がともに前方を向いている（内積 $\boldsymbol{v} \cdot \hat{\boldsymbol{d}}_{\text{queue}} \ge \cos(45^\circ) \approx 0.707$）と判断された場合は、向きベースでの判定を行わずに除外します。少なくともどちらか一方の人物が横・後ろ等の非進行方向を向いている場合のみ、以降の交差判定を実行します。

### (2) 個人のバウンディングボックス横幅に基づく判定半径
各人物 $i$ の扇形評価領域の到達半径 $R_i$ には、全員一律で自身のバウンディングボックスの横幅（$\text{width}_i$）を使用します：

$$R_i = \text{width}_i$$

### (3) 扇形領域 (Sector) と胴体四角形 (Torso Quad) の交差判定
人物 $A$ の扇形領域 $\text{Sector}_A$ と人物 $B$ の胴体四角形 $\text{Quad}_B$ の重なり判定 $\text{isSectorIntersectingQuad}(\text{Sector}_A, \text{Quad}_B)$ は、以下のいずれかを満たす場合に `true` となります：
1. $\text{Quad}_B$ の頂点のいずれかが $\text{Sector}_A$ 内に含まれる。
2. $\text{Sector}_A$ の原点が $\text{Quad}_B$ の内部に含まれる。
3. $\text{Sector}_A$ の境界レイと $\text{Quad}_B$ の4辺が交差する。

### (4) 相互認識によるグループ間結合 (AND条件)
`index.ts` より引き渡された `Groups` および `QueueLine` を受け取り、異なるグループ間の人物同士で相互に判定領域が交差している場合（AND条件）、そのグループ同士を全統合します：

$$\text{isOrientedTogether}(A, B) = \text{isSectorIntersectingQuad}(\text{Sector}_A, \text{Quad}_B) \quad \land \quad \text{isSectorIntersectingQuad}(\text{Sector}_B, \text{Quad}_A)$$