# 3. 体の向きベースの前後グループ化アルゴリズム (groupByOrientation)

本モジュールは、各人物の体の向き（肩・腰の骨格座標）に基づき、前面に伸びる**評価領域（扇形視界領域／Sector）同士の空間的オーバーラップ（交差・重複）**を幾何学計算で評価し、前後列を跨ぐ同一グループ（互いに向き合っているカップルや会話中のグループなど）を判定する子アルゴリズムです。

---

## 数式モデル

### (1) 胴体方向ベクトルの算出
左肩 $k_{5}$, 右肩 $k_{6}$, 左腰 $k_{11}$, 右腰 $k_{12}$ のキーポイント座標から、肩の中点 $\boldsymbol{p}_{\text{shoulder}}$ および腰の中点 $\boldsymbol{p}_{\text{hip}}$ を求めます。

$$\boldsymbol{p}_{\text{shoulder}} = \frac{\boldsymbol{k}_5 + \boldsymbol{k}_6}{2}, \quad \boldsymbol{p}_{\text{hip}} = \frac{\boldsymbol{k}_{11} + \boldsymbol{k}_{12}}{2}$$

胴体の向きベクトル $\boldsymbol{v}_{\text{torso}}$ は、腰から肩への単位ベクトルとして定義されます：

$$\boldsymbol{v}_{\text{torso}} = \frac{\boldsymbol{p}_{\text{shoulder}} - \boldsymbol{p}_{\text{hip}}}{\|\boldsymbol{p}_{\text{shoulder}} - \boldsymbol{p}_{\text{hip}}\|}$$

### (2) 動的到達距離制限（身体サイズの平均）
検出された全人物の縦幅の平均値 $\bar{H}$ に係数 $M=2$ を掛けた動的半径上限 $R_{\text{max}}$ を定義します：

$$R_{\text{max}} = M \cdot \bar{H}$$

### (3) 扇形評価領域 (Sector) の構成
人物 $A$ の領域 $\text{Sector}_A$ は、起点 $\boldsymbol{p}_A$、方向 $\boldsymbol{v}_{\text{torso}, A}$、半径 $R_{\text{max}}$、開き角 $\theta_{\text{FOV}}$ によって形作られる2D平面上の扇形図形です。

### (4) 2つの扇形領域の幾何的オーバーラップ判定
$\text{Sector}_A \cap \text{Sector}_B \neq \emptyset$ であるかを以下の4条件の論理和（いずれか1つでも満たせば交差）によって算出します：

1. **頂点包摂:** $\boldsymbol{p}_A \in \text{Sector}_B \quad \lor \quad \boldsymbol{p}_B \in \text{Sector}_A$
2. **レイ（側辺）交差:** $\text{Segment}_A \cap \text{Segment}_B \neq \emptyset$
3. **レイと円弧の交差:** $\text{Segment}_A \cap \text{Arc}_B \neq \emptyset \quad \lor \quad \text{Segment}_B \cap \text{Arc}_A \neq \emptyset$
4. **円弧同士の交差:** $\text{Arc}_A \cap \text{Arc}_B \neq \emptyset$

非相交集合データ構造 (Union-Find) を適用し、既存の距離ベース横並びグループ構造へ本判定結果を統合して最終的な `Groups` を構成します。