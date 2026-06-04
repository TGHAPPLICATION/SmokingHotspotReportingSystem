# 測試規劃 — 吸菸熱點通報系統

## 一、測試範圍與策略

```
單元測試 (Unit Tests)          整合測試 (Integration Tests)
    │                                  │
    ├── 時段計算邏輯                   ├── Apps Script + Google Sheets
    ├── 座標驗證                       ├── 地理編碼 → 表單送出
    ├── 重複回報偵測                   ├── API 回傳 → 地圖渲染
    ├── Haversine 距離計算             └── 完整使用者流程
    ├── UUID 產生
    └── GeoJSON 格式化
```

---

## 二、單元測試規劃

### 2.1 `calcTimeSlot(hour)` — 時段計算

| 測試編號 | 輸入 | 預期輸出 | 說明 |
|----------|------|----------|------|
| UT-01 | 0  | 0 | 午夜 0 點 |
| UT-02 | 1  | 0 | 同時段上限 |
| UT-03 | 2  | 1 | 時段邊界 |
| UT-04 | 11 | 5 | 11 點 |
| UT-05 | 12 | 6 | 正午 |
| UT-06 | 23 | 11 | 最後時段 |
| UT-07 | 22 | 11 | 最後時段起點 |

### 2.2 `validateReport(data)` — 資料驗證

| 測試編號 | 測試情境 | 預期行為 |
|----------|----------|----------|
| UT-10 | lat/lng 為有效台北座標 | 不拋出例外 |
| UT-11 | lat 為字串 "25.0" | 拋出 INVALID_COORDINATES |
| UT-12 | lat 為 undefined | 拋出 INVALID_COORDINATES |
| UT-13 | 座標在台北範圍外（25.5, 121.5）| 拋出 OUT_OF_TAIPEI_BOUNDS |
| UT-14 | locationSource 為 "gps" | 不拋出例外 |
| UT-15 | locationSource 為 "manual" | 不拋出例外 |
| UT-16 | locationSource 為 "unknown" | 拋出 INVALID_LOCATION_SOURCE |
| UT-17 | locationSource 為空字串 | 拋出 INVALID_LOCATION_SOURCE |

### 2.3 `haversineKm(lat1, lng1, lat2, lng2)` — 距離計算

| 測試編號 | 輸入 | 預期輸出 | 說明 |
|----------|------|----------|------|
| UT-20 | 同一點 (25.03, 121.56) × 2 | 0 km | 距離為零 |
| UT-21 | 台北市政府 → 台北 101 | ≈ 0.7 km | 已知距離 |
| UT-22 | 台灣端點（北南）| ≈ 380 km | 合理範圍內 |
| UT-23 | 台北 → 板橋（跨城市）| 約 5–8 km | 跨縣市距離 |

### 2.4 `isDuplicateReport()` — 重複偵測

| 測試編號 | 測試情境 | 預期行為 |
|----------|----------|----------|
| UT-30 | 空工作表，任何資料 | 回傳 false |
| UT-31 | 不同 hash，相同位置時段 | 回傳 false |
| UT-32 | 相同 hash，不同時段 | 回傳 false |
| UT-33 | 相同 hash，相同時段，距離 < 100m | 回傳 true |
| UT-34 | 相同 hash，相同時段，距離 > 100m | 回傳 false |
| UT-35 | hash 為空字串 | 回傳 false |

### 2.5 `GeoJSON 格式化` — API 回傳格式

| 測試編號 | 測試情境 | 預期行為 |
|----------|----------|----------|
| UT-40 | 空工作表，slot=all | features 為空陣列 |
| UT-41 | 3 筆資料，slot=all | features.length === 3 |
| UT-42 | 3 筆資料（slot 0/4/7），slot=4 | features.length === 1 |
| UT-43 | 含 NaN 座標的列 | 該列被過濾掉 |
| UT-44 | 正確的 GeoJSON 結構 | type="FeatureCollection", coordinates=[lng,lat] |

---

## 三、整合測試規劃

### 3.1 前端表單整合測試

| 測試編號 | 測試情境 | 前置條件 | 步驟 | 預期結果 |
|----------|----------|----------|------|----------|
| IT-01 | GPS 定位成功流程 | 瀏覽器允許定位 | 1. 開啟表單 2. 點擊「取得 GPS 定位」3. 等待定位完成 4. 送出 | 按鈕變綠色，地圖預覽顯示，送出成功 |
| IT-02 | GPS 拒絕授權 | 瀏覽器拒絕定位 | 1. 開啟表單 2. 點擊「取得 GPS 定位」| 顯示錯誤訊息，地址輸入框可用 |
| IT-03 | 地址輸入與地理編碼 | 網路正常 | 1. 輸入「台北市信義區市府路45號」2. 點擊查詢 | Nominatim 回傳座標，地圖預覽更新 |
| IT-04 | 地址查無結果 | 網路正常 | 1. 輸入「無效地址xyz」2. 點擊查詢 | 顯示「找不到此地址」錯誤訊息 |
| IT-05 | 完整表單送出（GPS）| GPS 可用、Sheets 已設定 | 1. GPS 定位 2. 填補充說明 3. 送出 | 顯示成功訊息，表單重置 |
| IT-06 | 重複回報攔截 | 已存在同時段同位置回報 | 1. 相同 token 再次回報相同地點 | 顯示「已在此時段回報」提示 |
| IT-07 | 送出按鈕防重複點擊 | 無 | 1. 送出後立即再次點擊 | 按鈕停用，只送出一次 |

### 3.2 後端 API 整合測試

| 測試編號 | 測試情境 | 請求 | 預期回應 |
|----------|----------|------|----------|
| IT-20 | 取得所有回報 | GET ?action=getReports | 200 OK，GeoJSON FeatureCollection |
| IT-21 | 取得特定時段 | GET ?action=getReports&slot=7 | 只含 time_slot=7 的 features |
| IT-22 | 取得全部時段 | GET ?action=getReports&slot=all | 所有 features |
| IT-23 | 無效時段（超出範圍）| GET ?action=getReports&slot=99 | 回傳空 features（無符合） |
| IT-24 | 表單頁面請求 | GET（無 action）| 回傳 HTML 表單 |

### 3.3 地圖頁面整合測試

| 測試編號 | 測試情境 | 步驟 | 預期結果 |
|----------|----------|------|----------|
| IT-30 | 頁面初始載入 | 開啟 index.html | 地圖顯示台北市，載入動畫出現後消失 |
| IT-31 | API 無法存取（fallback）| 斷網或 API_URL 無效 | 改用 api-mock.json，地圖仍正常顯示 |
| IT-32 | 時段篩選 | 點擊某一時段按鈕 | 地圖即時過濾，統計數字更新 |
| IT-33 | 點位 popup | 點擊地圖上的點位 | 顯示時段、地址、說明、時間 |
| IT-34 | 定位按鈕 | 點擊定位按鈕（允許定位）| 地圖移至使用者位置 |
| IT-35 | 統計浮框 | 切換時段 | 「顯示點位」數字隨篩選更新 |
| IT-36 | 全選時段 | 點擊「全部」按鈕 | 顯示所有點位 |

---

## 四、測試執行環境

### 4.1 Apps Script 邏輯測試（Node.js）

```bash
npm test                    # 執行所有單元測試
npm run test:unit           # 只執行單元測試
npm run test:integration    # 執行整合測試（需連線）
npm run test:coverage       # 產生覆蓋率報告
```

### 4.2 瀏覽器手動測試

- Chrome DevTools → Application → Location：模擬 GPS 座標或拒絕授權
- Network Throttle：測試慢速網路下的載入行為
- Responsive Mode：手機螢幕尺寸測試（375px, 390px, 414px）

### 4.3 Apps Script 原生測試

在 Apps Script 編輯器中手動執行 `runAllTests()` 函式。

---

## 五、驗收標準

| 項目 | 通過條件 |
|------|----------|
| 單元測試覆蓋率 | ≥ 85% |
| 單元測試通過率 | 100% |
| 整合測試通過率 | ≥ 90% |
| 表單 GPS 成功率 | 在 HTTPS 環境下 ≥ 95% |
| 地圖載入時間 | ≤ 3 秒（一般網路環境） |
| 行動裝置相容性 | iOS Safari 16+, Android Chrome 110+ |
