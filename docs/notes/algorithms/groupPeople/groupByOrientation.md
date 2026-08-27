# 3. 体の向きベースの前後グループ化アルゴリズム (groupByOrientation)

本モジュールは、各人物の体の向き（肩・腰の骨格座標）に基づき、前面に伸ばした**扇形評価領域（Sector）同士の相互認識（双方の視野領域内への位置侵入）**を評価し、前後列を跨ぐ同一グループ（互いに向き合って会話しているペアや連れなど）を判定する子アルゴリズムです。

---

## 数式モデル

### (1) 胴体方向ベクトルの算出
左肩 $k_{5}$, 右肩 $k_{6}$, 左腰 $k_{11}$, 右腰 $k_{12}$ のキーポイント座標から、肩の中点 $\boldsymbol{p}_{\text{shoulder}}$ および腰の中点 $\boldsymbol{p}_{\text{hip}}$ を求めます。

$$\boldsymbol{p}_{\text{shoulder}} = \frac{\boldsymbol{k}_5 + \boldsymbol{k}_6}{2}, \quad \boldsymbol{p}_{\text{hip}} = \frac{\boldsymbol{k}_{11} + \boldsymbol{k}_{12}}{2}$$

胴体の向きベクトル $\boldsymbol{v}_{\text{torso}}$ は、腰から肩への単位ベクトルとして定義されます：

$$\boldsymbol{v}_{\text{torso}} = \frac{\boldsymbol{p}_{\text{shoulder}} - \boldsymbol{p}_{\text{hip}}}{\|\boldsymbol{p}_{\text{shoulder}} - \boldsymbol{p}_{\text{hip}}\|}$$

### (2) 動的到達距離制限（身体サイズの平均）
検出された全人物の縦幅の平均値 $\bar{H}$ に定数係数 $M = 1.2$ (`AVERAGE_BODY_SIZE_DISTANCE_MULTIPLE`) を掛けた動的領域半径 $R_{\text{max}}$ を定義します：

$$R_{\text{max}} = M \cdot \bar{H}$$

### (3) 扇形評価領域 (Sector) への点包含判定
人物 $A$（位置 $\boldsymbol{p}_A$, 胴体向き $\boldsymbol{v}_{\text{torso}, A}$）の扇形領域内に、人物 $B$ の位置 $\boldsymbol{p}_B$ が含まれるかの判定関数 $\text{isPointInSector}(\boldsymbol{p}_B, \text{Sector}_A)$ を定義します。

相対位置ベクトル $\boldsymbol{r}_{AB} = \boldsymbol{p}_B - \boldsymbol{p}_A$、およびその正規化ベクトル $\hat{\boldsymbol{r}}_{AB} = \frac{\boldsymbol{r}_{AB}}{\|\boldsymbol{r}_{AB}\|}$ とするとき：

$$\text{isPointInSector}(\boldsymbol{p}_B, \text{Sector}_A) = \begin{cases} \text{true} & (\|\boldsymbol{r}_{AB}\| \le R_{\text{max}} \quad \land \quad \boldsymbol{v}_{\text{torso}, A} \cdot \hat{\boldsymbol{r}}_{AB} \ge \cos\left(\frac{\theta_{\text{FOV}}}{2}\right)) \\ \text{false} & (\text{otherwise}) \end{cases}$$

※ $\theta_{\text{FOV}}$ は前方評価領域の開き角 (`DEFAULT_FOV_ANGLE` = $\frac{\pi}{2}$ ラジアン / 90度)。

### (4) 相互認識による統合判定条件 (AND条件)
人物 $A$ と人物 $B$ について、**互いの扇形評価領域内に相手の位置座標が存在する場合（AND条件 / 相互侵入）**にのみ、同一グループとして結合します：

$$\text{isOrientedTogether}(A, B) = \text{isPointInSector}(\boldsymbol{p}_B, \text{Sector}_A) \quad \land \quad \text{isPointInSector}(\boldsymbol{p}_A, \text{Sector}_B)$$

一方的な通過・無関係な人物の領域掠れによる連続結合（過剰な統合）を抑制し、相互の向き合い・会話関係を正確に抽出します。非相交集合データ構造 (Union-Find) を適用し、既存の横並びグループ構造へ統合して最終的な `Groups` を返却します。