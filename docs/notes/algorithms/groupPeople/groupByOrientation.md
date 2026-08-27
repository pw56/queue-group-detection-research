# 3. 体の向きベースの前後グループ化アルゴリズム (groupByOrientation)

本モジュールは、スマホ操作等を考慮して顔（頭部）ではなく**胴体の向き**を基準とし、前後列を跨ぐグループ（壁に寄って会話するカップル、後から合流した連れなど）を判定する子アルゴリズムです。

---

## 数式モデル

### (1) 胴体方向ベクトルの算出
左肩 $k_{5}$, 右肩 $k_{6}$, 左腰 $k_{11}$, 右腰 $k_{12}$ のキーポイント座標から、肩の中点 $\boldsymbol{p}_{\text{shoulder}}$ および腰の中点 $\boldsymbol{p}_{\text{hip}}$ を求めます。

$$\boldsymbol{p}_{\text{shoulder}} = \frac{\boldsymbol{k}_5 + \boldsymbol{k}_6}{2}, \quad \boldsymbol{p}_{\text{hip}} = \frac{\boldsymbol{k}_{11} + \boldsymbol{k}_{12}}{2}$$

胴体の向きベクトル $\boldsymbol{v}_{\text{torso}}$ は、腰から肩への単位ベクトルとして定義されます：

$$\boldsymbol{v}_{\text{torso}} = \frac{\boldsymbol{p}_{\text{shoulder}} - \boldsymbol{p}_{\text{hip}}}{\|\boldsymbol{p}_{\text{shoulder}} - \boldsymbol{p}_{\text{hip}}\|}$$

### (2) 相対位置ベクトルと視線・体躯交差角の評価
人物 $A$ から人物 $B$ への相対位置ベクトルを $\boldsymbol{r}_{AB} = \boldsymbol{p}_B - \boldsymbol{p}_A$（正規化ベクトル $\hat{\boldsymbol{r}}_{AB}$）とするとき、人物 $A$ が人物 $B$ の方向に向いている度合いをコサイン類似度で算出します：

$$\cos \theta_{A \to B} = \boldsymbol{v}_{\text{torso}, A} \cdot \hat{\boldsymbol{r}}_{AB}$$

同様に、人物 $B$ が人物 $A$ の方向に向いている度合い：

$$\cos \theta_{B \to A} = \boldsymbol{v}_{\text{torso}, B} \cdot (-\hat{\boldsymbol{r}}_{AB})$$

### (3) 結合判定条件
一定の距離制限 $\|\boldsymbol{r}_{AB}\| \le \text{MAX\_DISTANCE\_THRESHOLD}$ のもとで、以下のいずれかの条件を満たす場合に連れ判定を行います：

1. **指向対面条件**:
   $$\cos \theta_{A \to B} \ge \cos(\text{FACING\_ANGLE\_THRESHOLD}) \quad \lor \quad \cos \theta_{B \to A} \ge \cos(\text{FACING\_ANGLE\_THRESHOLD})$$
   （横並びグループの誰か1人でも、前後列の相手に向かって体を傾けている・会話している場合）

2. **相互ベクトル交差条件**:
   $$\boldsymbol{v}_{\text{torso}, A} \cdot \boldsymbol{v}_{\text{torso}, B} \ge \cos(\text{FACING\_ANGLE\_THRESHOLD})$$