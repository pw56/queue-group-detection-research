# 1. 列推定アルゴリズム (estimateQueueLine)

本モジュールは、画像から検出された人物群のバウンディングボックスの横幅（width）のみを利用し、横幅が最大の人物（最手前）と最小の人物（最奥）の座標から、列の起点 $\boldsymbol{p}_{\text{origin}}$ および方向を示すベクトル $\boldsymbol{d}$ を算出するアルゴリズムです。

---

## 数式モデル

### (1) 最手前・最奥人物の特定
各人物のバウンディングボックス横幅 $w_i$ に基づき、最手前（$P_{\text{front}}$）および最奥（$P_{\text{back}}$）の人物を決定します：
$$P_{\text{front}} = \arg\max_i (w_i), \quad P_{\text{back}} = \arg\min_i (w_i)$$

### (2) 基準座標の抽出
それぞれのバウンディングボックス底辺中央の座標を各点の代表位置とします：
$$\boldsymbol{p}_{\text{front}} = \left( \text{originX}_{\text{front}} + \frac{w_{\text{front}}}{2}, \; \text{originY}_{\text{front}} + h_{\text{front}} \right)$$
$$\boldsymbol{p}_{\text{back}} = \left( \text{originX}_{\text{back}} + \frac{w_{\text{back}}}{2}, \; \text{originY}_{\text{back}} + h_{\text{back}} \right)$$

列の起点座標として、最手前人物の位置を採用します：
$$\boldsymbol{p}_{\text{origin}} = \boldsymbol{p}_{\text{front}}$$

### (3) 方向ベクトルの算出
手前 $\boldsymbol{p}_{\text{front}}$ から奥 $\boldsymbol{p}_{\text{back}}$ への差分ベクトルを求め、正規化して列の単位方向ベクトル $\boldsymbol{d} = (u, v)$ とします：

$$\boldsymbol{v} = \boldsymbol{p}_{\text{back}} - \boldsymbol{p}_{\text{front}}$$
$$\boldsymbol{d} = \frac{\boldsymbol{v}}{\|\boldsymbol{v}\|}$$