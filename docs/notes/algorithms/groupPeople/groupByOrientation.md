# 3. 体の向きベースの前後グループ化アルゴリズム (groupByOrientation)

本モジュールは、スマホ操作等を考慮して顔（頭部）ではなく**胴体の向き**を基準とし、各人物の体の前方に形成される評価領域（扇形視界領域／FOV）の幾何学的な重なり（侵入関係）を評価することで、前後列を跨ぐグループ（壁に寄って会話するカップル、後から合流した連れなど）を判定する子アルゴリズムです。

---

## 数式モデル

### (1) 胴体方向ベクトルの算出
左肩 $k_{5}$, 右肩 $k_{6}$, 左腰 $k_{11}$, 右腰 $k_{12}$ のキーポイント座標から、肩の中点 $\boldsymbol{p}_{\text{shoulder}}$ および腰の中点 $\boldsymbol{p}_{\text{hip}}$ を求めます。

$$\boldsymbol{p}_{\text{shoulder}} = \frac{\boldsymbol{k}_5 + \boldsymbol{k}_6}{2}, \quad \boldsymbol{p}_{\text{hip}} = \frac{\boldsymbol{k}_{11} + \boldsymbol{k}_{12}}{2}$$

胴体の向きベクトル $\boldsymbol{v}_{\text{torso}}$ は、腰から肩への単位ベクトルとして定義されます：

$$\boldsymbol{v}_{\text{torso}} = \frac{\boldsymbol{p}_{\text{shoulder}} - \boldsymbol{p}_{\text{hip}}}{\|\boldsymbol{p}_{\text{shoulder}} - \boldsymbol{p}_{\text{hip}}\|}$$

### (2) 動的到達距離制限（身体サイズの平均）
検出された全人物の縦幅（頭部〜足首間またはバウンディングボックスの高さ）の平均値 $\bar{H}$ に係数 `AVERAGE_BODY_SIZE_DISTANCE_MULTIPLE` ($M=2$) を掛けた動的距離上限 $R_{\text{max}}$ を定義します：

$$R_{\text{max}} = M \cdot \bar{H}$$

### (3) 前方評価領域（扇形 / FOV）の包含判定
人物 $A$（位置 $\boldsymbol{p}_A$, 胴体向き $\boldsymbol{v}_{\text{torso}, A}$）の評価領域内に、人物 $B$（位置 $\boldsymbol{p}_B$）が含まれているかの判定関数 $\text{isPointInFOV}(A, \boldsymbol{p}_B)$ を定義します。

相対位置ベクトル $\boldsymbol{r}_{AB} = \boldsymbol{p}_B - \boldsymbol{p}_A$、およびその正規化ベクトル $\hat{\boldsymbol{r}}_{AB} = \frac{\boldsymbol{r}_{AB}}{\|\boldsymbol{r}_{AB}\|}$ とするとき：

$$\text{isPointInFOV}(A, \boldsymbol{p}_B) = \begin{cases} \text{true} & (\|\boldsymbol{r}_{AB}\| \le R_{\text{max}} \quad \land \quad \boldsymbol{v}_{\text{torso}, A} \cdot \hat{\boldsymbol{r}}_{AB} \ge \cos\left(\frac{\theta_{\text{FOV}}}{2}\right)) \\ \text{false} & (\text{otherwise}) \end{cases}$$

※ $\theta_{\text{FOV}}$ は前方評価領域の開き角 (`DEFAULT_FOV_ANGLE` = $\frac{\pi}{2}$ ラジアン / 90度)。

### (4) 結合判定条件
人物 $A$ と人物 $B$ について、どちらか一方の前方評価領域内に相手の身体位置（中心座標）が存在する場合（＝領域の重なり・侵入）、前後における同一グループとして判定します：

$$\text{isOrientedTogether}(A, B) = \text{isPointInFOV}(A, \boldsymbol{p}_B) \quad \lor \quad \text{isPointInFOV}(B, \boldsymbol{p}_A)$$

非相交集合データ構造 (Union-Find) を適用し、既存の距離ベース横並びグループ構造へ本判定結果を統合して最終的な `Groups` を構成します。