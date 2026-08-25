# 1. 列推定アルゴリズム (estimateQueueLine)

本モジュールは、画像から検出された人物群のバウンディングボックス底面座標の分布（主成分分析: PCA）によって列自体の**直線軸**を求め、バウンディングボックス横幅（手前が大きい）によって列の**前後方向（ベクトル向き）**を確定・合成するアルゴリズムです。

---

## 数式モデル

### (1) 代表座標の算出
各人物 $i$ のバウンディングボックス底辺中央の座標 $(x_i, y_i)$ および横幅 $w_i$ を抽出します：
$$x_i = \text{originX}_i + \frac{\text{width}_i}{2}, \quad y_i = \text{originY}_i + \text{height}_i$$

全体の平均座標 $(\bar{x}, \bar{y})$:
$$\bar{x} = \frac{1}{N} \sum_{i=1}^N x_i, \quad \bar{y} = \frac{1}{N} \sum_{i=1}^N y_i$$

### (2) 底面座標の分布（PCA）による直線推定
共分散行列の要素を算出し、点の分布が最も広がっている直線軸の方向 $\theta_{\text{pca}}$ を求めます：
$$S_{xx} = \sum_{i=1}^N (x_i - \bar{x})^2, \quad S_{yy} = \sum_{i=1}^N (y_i - \bar{y})^2, \quad S_{xy} = \sum_{i=1}^N (x_i - \bar{x})(y_i - \bar{y})$$

$$\theta_{\text{pca}} = \frac{1}{2} \operatorname{atan2}\left(2 S_{xy}, S_{xx} - S_{yy}\right)$$

直線軸の無指向性ベクトル:
$$\boldsymbol{d}_{\text{pca}} = (\cos\theta_{\text{pca}}, \sin\theta_{\text{pca}})$$

### (3) 横幅による前後向き（ベクトルの正負）確定
バウンディングボックス横幅が最大の人物（最手前 $P_{\text{front}}$）から最小の人物（最奥 $P_{\text{back}}$）へ向かう参考ベクトル $\boldsymbol{v}_{\text{width}}$ を算出します：
$$\boldsymbol{v}_{\text{width}} = \boldsymbol{p}_{\text{back}} - \boldsymbol{p}_{\text{front}}$$

PCA直線ベクトル $\boldsymbol{d}_{\text{pca}}$ と 内積 $\boldsymbol{d}_{\text{pca}} \cdot \boldsymbol{v}_{\text{width}}$ を計算し、負（逆向き）である場合はベクトルの向きを反転させて手前→奥の方向に揃えます：

$$\boldsymbol{d} = \begin{cases} \boldsymbol{d}_{\text{pca}} & (\boldsymbol{d}_{\text{pca}} \cdot \boldsymbol{v}_{\text{width}} \ge 0) \\ -\boldsymbol{d}_{\text{pca}} & (\boldsymbol{d}_{\text{pca}} \cdot \boldsymbol{v}_{\text{width}} < 0) \end{cases}$$