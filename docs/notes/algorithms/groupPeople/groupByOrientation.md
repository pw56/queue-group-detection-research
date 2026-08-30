# 3. 体の向きに基づく前後グループ結合アルゴリズム (groupByOrientation)

本モジュールは、距離ベースで初期抽出された横並びグループ群（`distanceGroups`）に対し、人物の「体の向き（Vector）」を利用して前後方向に跨がる同一グループ（会話中のカップル、グループ等）を統合するアルゴリズムです。

---

## 課題・背景

待機列などにおいては、スマホ操作等により顔の向きと会話相手の方向が一致しないケースが多く存在します。そのため、本アルゴリズムでは**顔の向きではなく映像内での体の向きベクトル**を使用します。

また、壁寄りの会話、複数人での列跨ぎ会話、合流後の会話など、前後で向き合っている・または交差する視線（体勢）を持つ人物群を判定します。

---

## 数式モデル

### 1. 2人物の体の向きの直線定義

人物 $A, B$ の位置を中心座標 $\boldsymbol{P}_A, \boldsymbol{P}_B$、正規化された体の向きベクトルを $\boldsymbol{d}_A, \boldsymbol{d}_B$ とします。

$$
\text{Line } A: \boldsymbol{L}_A(t_A) = \boldsymbol{P}_A + t_A \boldsymbol{d}_A \quad (t_A \ge 0)
$$

$$
\text{Line } B: \boldsymbol{L}_B(t_B) = \boldsymbol{P}_B + t_B \boldsymbol{d}_B \quad (t_B \ge 0)
$$

### 2. 延長線の交点判定

2直線の外積 $\text{det} = d_{A,x} d_{B,y} - d_{A,y} d_{B,x}$ を用いて交点パラメータ $t_A, t_B$ を求めます。

$$
t_A = \frac{(P_{B,x} - P_{A,x}) d_{B,y} - (P_{B,y} - P_{A,y}) d_{B,x}}{\text{det}}
$$

$$
t_B = \frac{(P_{B,x} - P_{A,x}) d_{A,y} - (P_{B,y} - P_{A,y}) d_{A,x}}{\text{det}}
$$

### 3. グループ統合の判定条件

2つの隣接する横並びグループ $G_k, G_{k+1}$ において、それぞれのグループに含まれる人物 $A \in G_k, B \in G_{k+1}$ の組み合わせのうち**1組でも**以下の条件を全て満たした場合、グループ $G_k$ と $G_{k+1}$ を統合します。

1. **前方交差条件**: $t_A \ge 0 \quad \text{and} \quad t_B \ge 0$
2. **交点距離上限条件**:
   $$t_A \le d_{\text{max}} \quad \text{and} \quad t_B \le d_{\text{max}}$$
   （ただし、$d_{\text{max}} = 2.0 \times \frac{\text{width}_A + \text{width}_B}{2}$）
3. **交差角度条件**:
   $$\theta = \arccos(\boldsymbol{d}_A \cdot \boldsymbol{d}_B) \le \text{ORIENTATION\_ANGLE\_THRESHOLD\_RAD}$$