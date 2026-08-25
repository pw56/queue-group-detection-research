# 1. 列推定アルゴリズム (estimateQueueLine)

本モジュールは、画像から検出された人物群の位置座標（BoundingBox）および人物の向き（DirectionVector）を利用し、行列（キュー）の存在を認識した上で、列全体の軸となる主直線 $\boldsymbol{L}$ を算出するアルゴリズムです。

---

## 数式モデル

### (1) 人物座標の中心算出
各人物 $i$ の代表点 $(x_i, y_i)$ を算出します。MoveNetのキーポイントから信頼度（$\ge 0.5$）を満たす足首（左足首 index 15, 右足首 index 16）の座標を取得します。
- 両足首が信頼度を満たす場合：両足首の平均座標
- 片足首のみ信頼度を満たす場合：満たした片足首の座標
- 両足首とも信頼度を満たさない場合：列の推定対象から除外

有効な足首座標が得られた人物のみを対象に、全体平均 $(\bar{x}, \bar{y})$ を算出します：
$$\bar{x} = \frac{1}{N} \sum_{i=1}^N x_i, \quad \bar{y} = \frac{1}{N} \sum_{i=1}^N y_i$$

### (2) 主成分分析 (PCA) による軸推定
共分散行列 $S$ の要素を求めます：
$$S_{xx} = \sum_{i=1}^N (x_i - \bar{x})^2, \quad S_{yy} = \sum_{i=1}^N (y_i - \bar{y})^2, \quad S_{xy} = \sum_{i=1}^N (x_i - \bar{x})(y_i - \bar{y})$$

最大固有値に対応する主軸の角度 $\theta_{\text{pca}}$:
$$\theta_{\text{pca}} = \frac{1}{2} \operatorname{atan2}\left(2 S_{xy}, S_{xx} - S_{yy}\right)$$

PCA方向ベクトル $\boldsymbol{d}_{\text{pca}} = (\cos\theta_{\text{pca}}, \sin\theta_{\text{pca}})$。

### (3) 向きベクトルの合成
検出された向きベクトルの平均 $\boldsymbol{d}_{\text{dir}} = (\bar{d}_x, \bar{d}_y)$ を考慮し、列の方向ベクトル $\boldsymbol{d} = (u, v)$ を正規化して算出します：
$$\boldsymbol{d} = \frac{w_{\text{pca}} \boldsymbol{d}_{\text{pca}} + w_{\text{dir}} \boldsymbol{d}_{\text{dir}}}{\|w_{\text{pca}} \boldsymbol{d}_{\text{pca}} + w_{\text{dir}} \boldsymbol{d}_{\text{dir}}\|}$$