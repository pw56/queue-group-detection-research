# 3. 体の向きベースの前後グループ化アルゴリズム (groupByOrientation)

本モジュールは、各人物の身体特性から導出した身体正面ベクトルと距離減衰に基づく**連続値スコア（確率）モデル**を採用し、相互認識のスコアが閾値（`scoreThreshold`）を超えたペアが属するグループ同士を結合する子アルゴリズムです。

---

## 数式モデル

### (1) 前方指向時の除外判定（誤統合の防止）
正しく待機列に並んでいる人物同士が誤って前後統合されるのを防ぐため、待機列方向ベクトル $\hat{\boldsymbol{d}}_{\text{queue}}$ と各人物の胴体正面ベクトル $\hat{\boldsymbol{d}}$ の角度差を評価します。
比較する両名がともに前方を向いている（内積 $\hat{\boldsymbol{d}} \cdot \hat{\boldsymbol{d}}_{\text{queue}} \ge \cos(45^\circ) \approx 0.707$）と判断された場合は、向きベースでの判定を行わずに統合スコアを $0$ とします。少なくともどちらか一方の人物が横・後ろ等の非進行方向を向いている場合のみ、以降のスコア計算を実行します。

### (2) 身体正面ベクトル $\hat{\boldsymbol{d}}$ の算定
左肩 $\boldsymbol{k}_5$ と右肩 $\boldsymbol{k}_6$（または両腰 $\boldsymbol{k}_{11}, \boldsymbol{k}_{12}$）を結ぶベクトル $\boldsymbol{v}_{lr}$ から、画面座標系（Y-down）における法線ベクトルを算出します。鼻 $\boldsymbol{k}_0$ や外積の符号によって「お腹側（正面）」の極性を確定させます。

$$\boldsymbol{v}_{lr} = \boldsymbol{k}_6 - \boldsymbol{k}_5$$

$$\hat{\boldsymbol{d}} = \text{PolarityCorrect}\left( \frac{(-v_{lr, y}, v_{lr, x})}{\|(-v_{lr, y}, v_{lr, x})\|} \right)$$

### (3) 片方向視界スコア $S_{sight}(A \to B)$
人物 $A$ の位置 $\boldsymbol{p}_A$ から人物 $B$ の位置 $\boldsymbol{p}_B$ への相対単位ベクトルを $\hat{\boldsymbol{v}}_{AB}$ とします。
$A$ の正面ベクトル $\hat{\boldsymbol{d}}_A$ とのなす角（内積 $\cos \theta$）を基に、視界中心に近いほど $1.0$ に近づく連続値スコアを算出します（視野角 $\theta_{FOV}$ 外は $0$）。

$$\hat{\boldsymbol{v}}_{AB} = \frac{\boldsymbol{p}_B - \boldsymbol{p}_A}{\|\boldsymbol{p}_B - \boldsymbol{p}_A\|}$$

$$S_{sight}(A \to B) = \max\left(0, \frac{\hat{\boldsymbol{d}}_A \cdot \hat{\boldsymbol{v}}_{AB} - \cos(\theta_{FOV} / 2)}{1 - \cos(\theta_{FOV} / 2)}\right)$$

### (4) 距離減衰スコア $S_{dist}(A, B)$
2人間距離 $d = \|\boldsymbol{p}_B - \boldsymbol{p}_A\|$ が、人物の体サイズ（バウンディングボックス幅など）に基づく許容最大半径 $R_{max}$ を超えると線形に減衰します。

$$S_{dist}(A, B) = \max\left(0, 1 - \frac{d}{R_{max}}\right)$$

### (5) 相互認識によるグループ間結合 (AND条件・連続値統合)
`index.ts` より引き渡された `Groups` および `QueueLine` を受け取り、各視界スコアの幾何平均と距離スコアを乗算して統合スコア $S_{mutual}(A, B)$ を算出します。スコアが閾値（`scoreThreshold`）以上となる場合（AND条件を満たす場合）、該当グループ同士を統合（Union）します。

$$S_{mutual}(A, B) = \sqrt{S_{sight}(A \to B) \times S_{sight}(B \to A)} \times S_{dist}(A, B)$$

$$\text{isOrientedTogether}(A, B) = \begin{cases} 
\text{true} & (S_{mutual}(A, B) \ge \text{scoreThreshold}) \\ 
\text{false} & (\text{otherwise}) 
\end{cases}$$