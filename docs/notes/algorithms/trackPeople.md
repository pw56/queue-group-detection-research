# 待機列人物トラッキングおよびフィルタリングアルゴリズム (trackPeople)

本モジュールは、連続するフレーム画像間において検出された人物群に対し、カルマンフィルターによる位置予測およびHSV色空間での特徴量比較を組み合わせて人物の追跡を行い、待機列に一定時間留まっている人物（`TrackedPerson`）のみを抽出・判定するアルゴリズムです。

---

## 処理ロジックと数式モデル

### 1. カルマンフィルター（位置および速度の推定）

各人物のバウンディングボックス中心座標 $\mathbf{P} = (x, y)$ を観測値とし、状態ベクトル $\mathbf{x}_k = (x, y, v_x, v_y)^T$ における予測および更新を行います。

#### 状態遷移モデル:
$$\mathbf{x}_k^- = \mathbf{F} \mathbf{x}_{k-1}$$

$$\mathbf{P}_k^- = \mathbf{F} \mathbf{P}_{k-1} \mathbf{F}^T + \mathbf{Q}$$

ここで、時間差 $\Delta t$ に応じた状態遷移行列 $\mathbf{F}$ は以下の通りです。

$$\mathbf{F} = \begin{bmatrix} 
1 & 0 & \Delta t & 0 \\
0 & 1 & 0 & \Delta t \\
0 & 0 & 1 & 0 \\
0 & 0 & 0 & 1 
\end{bmatrix}$$

#### 観測更新モデル:
観測行列 $\mathbf{H}$ および観測ノイズ共分散 $\mathbf{R}$ に基づき、観測値 $\mathbf{z}_k = (z_x, z_y)^T$ により更新を行います。

$$\mathbf{K}_k = \mathbf{P}_k^- \mathbf{H}^T (\mathbf{H} \mathbf{P}_k^- \mathbf{H}^T + \mathbf{R})^{-1}$$

$$\mathbf{x}_k = \mathbf{x}_k^- + \mathbf{K}_k (\mathbf{z}_k - \mathbf{H} \mathbf{x}_k^-)$$

$$\mathbf{P}_k = (\mathbf{I} - \mathbf{K}_k \mathbf{H}) \mathbf{P}_k^-$$

---

### 2. HSV色空間における動的特徴量比較

照明変化や影の影響を抑制するため、胴体四隅および顔の各領域における平均HSV値 $\mathbf{C} = (h, s, v)$ を抽出して色距離を算出します。

#### 彩度依存の重み設定:
彩度 $s$ の大きさに応じて色相 $h$ と明度 $v$ の判定比重を動的に調整します。

$$w_{\text{hue}} = \min(s_A, s_B)$$

$$w_{\text{val}} = 1.0 - 0.7 \times w_{\text{hue}}$$

#### 色相距離および統合色距離計算:
色相は円周上の値であるため、最短距離を考慮した $\Delta h$ を算出します。

$$\Delta h = \min(|h_A - h_B|, 1.0 - |h_A - h_B|) \times 2.0$$

$$\text{Distance}(\mathbf{C}_A, \mathbf{C}_B) = \frac{w_{\text{hue}} \Delta h + w_{\text{val}} |v_A - v_B|}{w_{\text{hue}} + w_{\text{val}}}$$

---

### 3. 動的探索領域半径およびマッチング判定

フレームレート（$\text{FPS}$）およびバウンディングボックスサイズに基づき、フレーム間における動的探索半径 $R_{\text{search}}$ を決定します。

$$R_{\text{search}} = \max\left(20, \min(w_{\text{bbox}}, h_{\text{bbox}}) \times \frac{30}{\text{FPS}}\right)$$

#### 統合スコア計算:
前フレームでの予測位置との距離 $d_{\text{pos}}$ および色距離 $\text{Distance}_{\text{color}}$ からマッチングスコア $S$ を評価します。

$$S = \frac{d_{\text{pos}}}{R_{\text{search}}} + \text{Distance}_{\text{color}}$$

---

### 4. 待機列判定条件

追跡対象の人物が以下の条件を満たす場合、待機列構成員（`isInQueue`）として判定します。

1. **滞在時間閾値判定**: 最初に検出されてからの経過時間 $T_{\text{in\_view}} \ge \mathtt{QUEUE\_STATIONARY\_TIME\_THRESHOLD\_MS}$
2. **移動速度閾値判定**: 推定移動速度 $v = \sqrt{v_x^2 + v_y^2}$ が動的速度閾値以下であること

$$v < (S_{\text{bbox}} \times 0.1) \times \frac{\text{FPS}}{30}$$

（ただし $S_{\text{bbox}} = \min(w_{\text{bbox}}, h_{\text{bbox}})$）