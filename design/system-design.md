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
- **熱點圖層**：MapLibre GL JS 的 `circle` 圖層
  - 顏色：依點位數量熱力色 (yellow → orange → red)
  - 大小：依縮放層級動態調整
  - 動畫效果：脈衝圓圈（CSS animation）
- **時段切換**：底部浮動按鈕列（12 個時段 + 全部）

### 5.2 地圖互動功能

- 點擊點位：顯示 popup（回報時間、地址）
- 時段篩選：點選時段按鈕，地圖即時過濾資料
- 縮放/平移：標準地圖操作
- 定位按鈕：移至使用者目前位置

### 5.3 資料流

```
頁面載入
   │
   └── fetch(API_URL + "?action=getReports")
          │
          ├── 成功 → 解析 GeoJSON → 渲染圖層
          └── 失敗 → 使用 api-mock.json 示範資料
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
| 地圖效能 | 直接渲染所有點位 | 超過 5000 點可加入 clustering |
| 通知 | 無 | 可加入 Line Notify 推播 |
| 後台 | 無 | 可加入 Looker Studio 儀表板 |
