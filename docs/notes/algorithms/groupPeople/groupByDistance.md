# 2. 距離・方向ベースのグループ化アルゴリズム (groupByDistance)

本モジュールは、推定された主直線 $\boldsymbol{L}$ の法線方向（横並び方向）および進行方向への射影座標を求め、連結成分判定 (Union-Find) により横並びのグループを算出するアルゴリズムです。

---

## 数式モデル

推定された列の方向ベクトル $\boldsymbol{d} = (u, v)$ と、これに直交する法線ベクトル（横並び方向） $\boldsymbol{n} = (-v, u)$ を用います。

各人物 $i$ の代表点 $(x_i, y_i)$ は、信頼度（$\ge 0.5$）を満たす足首座標（両足首平均、または片足首）を使用します。両足首とも信頼度を満たさない場合は、バウンディングボックスの底辺中央点 $(x_i = \text{originX}_i + \frac{\text{width}_i}{2}, y_i = \text{originY}_i + \text{height}_i)$ を代替として使用します。

人物 $i$ の相対位置ベクトル $\boldsymbol{r}_i = (x_i - \bar{x}, y_i - \bar{y})$ に対する射影：
- **列方向成分（前後座標）**: $t_{line, i} = \boldsymbol{r}_i \cdot \boldsymbol{d}$
- **法線方向成分（横並び座標）**: $t_{side, i} = \boldsymbol{r}_i \cdot \boldsymbol{n}$

### グループ結合条件
2人 $A, B$ 間において、以下の2条件を満たす場合に同一グループとみなします：
1. 法線方向距離 $\Delta t_{side} = |t_{side, A} - t_{side, B}| \le \text{sideThreshold}$
2. 列方向ズレ $\Delta t_{line} = |t_{line, A} - t_{line, B}| \le \text{lineThreshold}$

非相交集合データ構造 (Union-Find) を適用し、連結している人物集合を抽出して最終的な `Groups` を構成します。