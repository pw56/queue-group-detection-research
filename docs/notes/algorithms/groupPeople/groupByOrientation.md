# 3. 体の向きに基づく前後グループ結合アルゴリズム (groupByOrientation)

本モジュールは、横並び判定済みの初期グループ群に対し、`Person.direction`（体の向きベクトル）を利用して、前後方向に跨がるグループを判定・結合するアルゴリズムです。

---

## 処理ロジックと数式モデル

### 1. 位置および方向ベクトルの抽出
各人物 $i$ の中心座標 $\mathbf{P}_i = (x_i, y_i)$ および `Person.direction` から単位向きベクトル $\mathbf{d}_i = (d_{x,i}, d_{y,i})$ を取得します。

### 2. 対向角度判定（に向かい合い判定）
向かい合っている状態はベクトルの向きが反転（$180^\circ$ / $\pi$ rad 近辺）するため、角度条件を判定します。

$$\theta = \arccos(\mathbf{d}_A \cdot \mathbf{d}_B) \ge \text{ORIENTATION\_ANGLE\_THRESHOLD\_RAD}$$

### 3. 延長線（Ray）の交点計算
人物 $A$ および人物 $B$ の向きベクトルの延長線：

$$\mathbf{L}_A(t_A) = \mathbf{P}_A + t_A \mathbf{d}_A \quad (t_A \ge 0)$$

$$\mathbf{L}_B(t_B) = \mathbf{P}_B + t_B \mathbf{d}_B \quad (t_B \ge 0)$$

2直線が交差するパラメータ $t_A, t_B$ を算定します。

$$\text{det} = d_{A,x} d_{B,y} - d_{A,y} d_{B,x}$$

$$t_A = \frac{(P_{B,x} - P_{A,x}) d_{B,y} - (P_{B,y} - P_{A,y}) d_{B,x}}{\text{det}}$$

$$t_B = \frac{(P_{B,x} - P_{A,x}) d_{A,y} - (P_{B,y} - P_{A,y}) d_{A,x}}{\text{det}}$$

### 4. グループ判定条件
以下の条件をすべて満たす場合、前後のグループを結合します。

1. **対向角度判定**: $\theta \ge \text{ORIENTATION\_ANGLE\_THRESHOLD\_RAD}$
2. **前方交差判定**: $t_A \ge 0$ かつ $t_B \ge 0$
3. **交点距離閾値判定**: 
   $$t_A \le d_{\text{max}} \quad \text{かつ} \quad t_B \le d_{\text{max}}$$
   （ただし $d_{\text{max}} = \text{MAX\_INTERSECTION\_DISTANCE\_RATIO} \times \frac{\text{width}_A + \text{width}_B}{2}$）
