# 1. 列推定アルゴリズム (estimateQueueLine)

本モジュールは、人物群をバウンディングボックスのX座標順に並び替え、そのシーケンス内での横幅の変化傾向（単調増加・減少）に反する不自然なノイズを除外した上で、主成分分析（PCA）による直線軸と横幅勾配によるベクトル方向を算出するアルゴリズムです。

---

## 数式モデル

### (1) X座標ソートとシーケンシャル傾向フィルタリング
各人物の底辺中央座標 $(x_i, y_i)$ および横幅 $w_i$ を抽出し、$x_i$ の昇順にソートした配列 $S = [P_1, P_2, \dots, P_M]$ を作成します。

1. **全体傾向の判定**: 
   先頭要素 $w_{\text{first}}$ と末尾要素 $w_{\text{last}}$ を比較し、$w_{\text{last}} \ge w_{\text{first}}$ であれば増加傾向（右に行くほど手前）、逆であれば減少傾向（右に行くほど奥）と判定します。

2. **ノイズ（不連続値）の除外**: 
   配列を順に走査し、判定した傾向（増減）から大きく逸脱する要素（例: 増加傾向の途中で急激に小さくなる人物）を非採用として除外します。

有効データ集合（要素数 $N$）に対する平均座標 $(\bar{x}, \bar{y})$:
$$\bar{x} = \frac{1}{N} \sum_{i=1}^N x_i, \quad \bar{y} = \frac{1}{N} \sum_{i=1}^N y_i$$

### (2) 底面座標の分布（PCA）による直線推定
フィルタリング後の座標群から共分散行列の要素を算出し、主軸角度 $\theta_{\text{pca}}$ を求めます：
$$S_{xx} = \sum_{i=1}^N (x_i - \bar{x})^2, \quad S_{yy} = \sum_{i=1}^N (y_i - \bar{y})^2, \quad S_{xy} = \sum_{i=1}^N (x_i - \bar{x})(y_i - \bar{y})$$

$$\theta_{\text{pca}} = \frac{1}{2} \operatorname{atan2}\left(2 S_{xy}, S_{xx} - S_{yy}\right)$$

直線軸の無指向性ベクトル:
$$\boldsymbol{d}_{\text{pca}} = (\cos\theta_{\text{pca}}, \sin\theta_{\text{pca}})$$

### (3) 横幅による前後向き（ベクトルの正負）確定
有効データ内で横幅が最大の人物（最手前 $P_{\text{front}}$）から最小の人物（最奥 $P_{\text{back}}$）へ向かう参考ベクトル $\boldsymbol{v}_{\text{width}}$ を算出します：
$$\boldsymbol{v}_{\text{width}} = \boldsymbol{p}_{\text{back}} - \boldsymbol{p}_{\text{front}}$$

内積 $\boldsymbol{d}_{\text{pca}} \cdot \boldsymbol{v}_{\text{width}}$ の符号に応じて向きを反転させ、手前→奥の向きへ正しく揃えます：

$$\boldsymbol{d} = \begin{cases} \boldsymbol{d}_{\text{pca}} & (\boldsymbol{d}_{\text{pca}} \cdot \boldsymbol{v}_{\text{width}} \ge 0) \\ -\boldsymbol{d}_{\text{pca}} & (\boldsymbol{d}_{\text{pca}} \cdot \boldsymbol{v}_{\text{width}} < 0) \end{cases}$$