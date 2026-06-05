# 系統設計規劃 — 吸菸熱點通報系統

## 一、系統概述

本系統提供市民透過手機瀏覽器即時通報吸菸熱點，並以互動地圖呈現統計結果，協助台北市衛生局掌握吸菸行為的時空分布。

---

## 二、架構設計

### 2.1 技術選型

| 元件 | 技術 | 說明 |
|------|------|------|
| 前端表單 | Google Apps Script HTML Service | 無需後端伺服器，免費託管 |
| 資料庫 | Google Sheets | 即時存取、易於匯出統計 |
| 後端 API | Apps Script Web App (doGet) | 提供 JSON API 給地圖頁面 |
| 地圖前端 | GitHub Pages + MapLibre GL JS | 靜態部署，OpenFreeMap 底圖 |
| 地理編碼 | Nominatim (OSM) | 免費、台灣地址支援佳 |

### 2.2 系統架構圖

```
使用者手機瀏覽器
       │
       ├──[回報] GET https://<script_id>.script.google.com/macros/s/.../exec
       │              │
       │         HTML Service (表單頁面)
       │              │
       │         [送出] POST doPost()
       │              │
       │         Google Sheets (SmokingReports)
       │
       └──[查看地圖] GitHub Pages (docs/index.html)
                     │
                     └── fetch API_URL?action=getReports
                              │
                         Apps Script doGet()
                              │
                         Google Sheets 查詢 → JSON 回傳
```

---

## 三、資料模型

### 3.1 Google Sheets 欄位設計

工作表名稱：`SmokingReports`

| 欄位 | 型別 | 說明 |
|------|------|------|
| id | STRING | UUID v4（自動產生） |
| timestamp | DATETIME | 回報時間（ISO 8601） |
| time_slot | INTEGER | 時段 0–11（依回報時間自動計算） |
| lat | FLOAT | 緯度（GPS 或地理編碼結果） |
| lng | FLOAT | 經度 |
| location_source | STRING | "gps" \| "manual" |
| address_input | STRING | 使用者手動輸入的地址（選填） |
| description | STRING | 補充說明（選填） |
| reported_by_hash | STRING | SHA-256(IP)，用於去重，不存個人資料 |

### 3.2 時段計算邏輯

```
time_slot = Math.floor(hour / 2)
```

| time_slot | 時間 |
|-----------|------|
| 0 | 00:00–01:59 |
| 1 | 02:00–03:59 |
| ... | ... |
| 11 | 22:00–23:59 |

---

## 四、前端表單設計（Apps Script）

### 4.1 使用者流程

```
開啟表單
   │
   ├── 自動請求 GPS 定位
   │     ├── 成功 → 顯示「已取得位置」＋地圖預覽
   │     └── 失敗 → 顯示文字輸入框，讓使用者輸入地址
   │               → 呼叫 Nominatim API 轉換座標
   │
   ├── 選填：補充說明
   │
   └── 送出 → 顯示成功/失敗訊息
```

### 4.2 表單欄位

1. **位置**（必填）：GPS 自動取得，或手動輸入地址
2. **補充說明**（選填）：例如「騎樓下」、「公園入口」

時段由送出時間自動計算，不需使用者選擇。

### 4.3 安全性設計

- 不儲存使用者個人資訊
- IP 雜湊化後儲存，用於偵測重複回報
- 同一 IP 雜湊值在同一時段同一位置（100m 範圍內）僅計1筆
- Apps Script 端啟用 CORS 白名單（僅允許 GitHub Pages 網域）

---

## 五、統計地圖設計（GitHub Pages）

### 5.1 地圖元件

- **底圖**：OpenFreeMap liberty 樣式（免費、無需 API Key）
- **三種視覺化模式**（可即時切換）：
  - 🔵 **分群模式（預設）**：supercluster 動態聚合，依數量顯示圓圈大小與顏色深淺
  - 🔥 **熱力模式**：WebGL heatmap，密度梯度呈現空間分布
  - ⚪ **點位模式**：所有個別點位，依時段上色

### 5.2 分群演算法設計（supercluster，MapLibre 內建）

| 參數 | 設定值 | 說明 |
|------|--------|------|
| `cluster` | `true` | 啟用分群 |
| `clusterMaxZoom` | 15 | zoom ≤ 15 才合併；zoom 16+ 顯示個別點位 |
| `clusterRadius` | 50 px | 同一螢幕半徑 50px 內的點位合併 |
| `clusterProperties` | `max_slot`, `min_slot` | 彙整群內時段範圍，供後續擴充使用 |

**分群圓圈顏色與大小（依 point_count 四段）：**

| 數量 | 顏色 | 圓圈直徑 |
|------|------|---------|
| 1–4 | 綠 `#2ecc71` | 40 px |
| 5–14 | 黃 `#f1c40f` | 56 px |
| 15–29 | 橘 `#e67e22` | 72 px |
| 30+ | 紅 `#e74c3c` | 88 px |

- 數量越多，圓圈越大、顏色越深（綠→黃→橘→紅）
- 點擊群組 → `getClusterExpansionZoom` 自動計算下一展開縮放，平滑飛往
- 縮放時由 MapLibre 自動重新計算分群，無需手動監聽 zoom 事件

### 5.3 熱力圖設計

- 使用獨立的 raw source（`reports-heat`，不分群），確保熱力分布準確
- `heatmap-intensity` 隨縮放增強（zoom 10 → 1x, zoom 15 → 3x）
- `heatmap-radius` 隨縮放增大（zoom 10 → 15 px, zoom 15 → 35 px）
- 色階：透明（低密度）→ 藍 → 橘 → 紅（高密度）

### 5.4 圖層架構

```
reports source (cluster: true)
  ├── layer-clusters       → 分群圓圈（has point_count）
  ├── layer-cluster-count  → 分群數字標籤
  ├── layer-pulse          → 個別點位脈衝外圈（!has point_count）
  └── layer-points         → 個別點位（!has point_count）

reports-heat source (cluster: false)
  └── layer-heatmap        → WebGL 熱力圖
```

### 5.5 地圖互動功能

- **分群模式**：點擊群組 → 縮放展開；點擊個別點位 → popup
- **熱力模式**：純視覺化，無點擊互動
- **點位模式**：點擊個別點位 → popup（含時段、地址、說明、時間）
- 時段篩選：三種模式均支援，切換時同步更新兩個 source 的資料
- 定位按鈕：移至使用者目前位置
- 圖例：分群模式顯示數量色階，點位模式顯示時段色階

### 5.6 資料流

```
頁面載入
   │
   └── fetch(API_URL + "?action=getReports")
          │
          ├── 成功 → 解析 GeoJSON → normalizeFeatures
          └── 失敗 → 使用 api-mock.json 示範資料
                │
                └── setData(reports + reports-heat)
                       │
                       └── MapLibre 自動渲染所有已啟用圖層
```

---

## 六、API 規格

### 6.1 取得回報清單

**GET** `?action=getReports&slot={0-11|all}`

回應（GeoJSON FeatureCollection）：
```json
{
  "type": "FeatureCollection",
  "features": [
    {
      "type": "Feature",
      "geometry": { "type": "Point", "coordinates": [121.5654, 25.0330] },
      "properties": {
        "id": "uuid-...",
        "timestamp": "2026-06-04T14:32:00+08:00",
        "time_slot": 7,
        "address_input": "台北市信義區市府路45號",
        "description": "騎樓下"
      }
    }
  ]
}
```

### 6.2 新增回報

**POST** `doPost(e)`（由表單直接呼叫，非公開 API）

---

## 七、部署架構

```
GitHub Repository
├── docs/           → GitHub Pages (地圖)
└── apps-script/    → 手動複製至 Google Apps Script
```

Google Sheets 權限設定：
- Apps Script 服務帳號擁有「編輯者」權限
- 試算表本身設為「限制存取」（不公開）

---

## 八、擴充性考量

| 面向 | 現行設計 | 未來擴充 |
|------|----------|----------|
| 資料量 | Google Sheets（最多 1000 萬格） | 超過 10 萬筆可遷移至 Firebase |
| 地圖效能 | supercluster 分群 + 熱力圖 | 超過 5 萬點可調低 clusterMaxZoom |
| 通知 | 無 | 可加入 Line Notify 推播 |
| 後台 | 無 | 可加入 Looker Studio 儀表板 |
| 分群色彩 | 依數量四段 | 可改為依群內主要時段上色（需擴充 clusterProperties） |
| 動畫 | 脈衝外圈（個別點位） | 可加入群組 expand 動畫 |
