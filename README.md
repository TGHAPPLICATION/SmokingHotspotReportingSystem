# 台北市吸菸熱點通報系統

提供市民透過手機瀏覽器即時通報吸菸熱點，並以互動地圖呈現時空分布與長期成效趨勢，協助衛生局掌握吸菸行為的時空分布與稽查成效。

## 線上展示

| 功能 | 網址 |
|------|------|
| 統計地圖 | `https://tghtaipei.github.io/SmokingHotspotReportingSystem/` |
| 稽查通報表單 | Apps Script 部署網址（見部署步驟），也是地圖右上角「📍 通報」按鈕的連結 |

---

## 系統架構

```
使用者手機瀏覽器
       │
       ├──[通報] Apps Script Web App (HTML Service)
       │              │
       │         POST doPost() → 驗證 → 去重 → 寫入
       │              │
       │         Google Sheets（分頁名稱、試算表 ID 皆讀取
       │         Apps Script「指令碼屬性」，不寫死於程式碼）
       │
       └──[查看地圖] GitHub Pages (docs/index.html)
                     │
                     └── Apps Script Web App
                           ?action=listSheets   → 回傳分頁清單（排除
                                                   指定吸菸區設定，見下）
                           ?action=getSheetRows → 回傳指定分頁座標 GeoJSON
                             sheet=吸菸區巡查 這個分頁比較特別：改讀
                             「指定吸菸區設定」I 欄地址地理編碼成座標
                             （結果快取在指令碼屬性），並帶入每個地點
                             在「吸菸區巡查」分頁最新一筆照片；其他
                             分頁維持一般的座標欄位自動偵測
                         （前端不持有試算表 ID 或任何 Google API 金鑰，
                          一律透過 JSONP 向自家 Apps Script 拿資料）
```

**技術選型**

| 元件 | 技術 |
|------|------|
| 通報表單 | Google Apps Script HTML Service |
| 資料庫 | Google Sheets（ID 存於 Apps Script 指令碼屬性，非公開） |
| 後端 API（寫入 / 讀取） | Apps Script Web App（doPost 寫入；doGet 以 JSONP 提供 `getReports`／`listSheets`／`getSheetRows`） |
| 設定管理 | Apps Script Script Properties（`Config.gs`），程式碼中不含任何金鑰或試算表 ID |
| 吸菸區巡查地圖圖層 | 讀「指定吸菸區設定」分頁地址，Apps Script 地理編碼後即時提供（`ZonePatrol.gs`） |
| 地圖前端 | GitHub Pages + MapLibre GL JS 4.3.2 |
| 分群演算法 | supercluster 8.0.1（JS 端手動計算） |
| 圖表報表 | Chart.js 4.4.3 |
| 底圖 | OpenFreeMap liberty（免費、無需 API Key） |
| 測試資料產生 | Apps Script GenerateMockData.gs（10,000 筆） |
| 稽查通報表單 | Apps Script HTML Service（`Form.html` + `Inspection.gs`），固定寫入「環保局菸蒂回報」分頁 |
| 照片儲存 | Google Drive（用戶端先壓縮成 JPEG 再以 base64 上傳，Apps Script 寫入指定資料夾並設為「知道連結即可檢視」） |

---

## 地圖功能

### 三種視覺化模式（可即時切換）

| 模式 | 說明 |
|------|------|
| 🔵 分群 | supercluster 動態聚合，圓圈大小與顏色深淺呈現數量（綠→黃→橘→紅） |
| 🔥 熱力 | WebGL heatmap，密度梯度呈現空間分布 |
| ⚪ 點位 | 所有個別點位，依時段 4 色顯示 |

### 多分頁動態圖層

- Header 會自動列出試算表中「每一個分頁」，各自變成一個可獨立開關的圖層按鈕（不同顏色區分）——**除了 `指定吸菸區設定`**，這張表純粹是給後端讀取的參考資料，`listSheetsJson()` 會把它從清單裡排除，不會出現在按鈕列
- 每個分頁各自獨立分群、獨立計數，可同時開啟多個分頁比對
- 座標欄位採自動偵測：優先比對常見欄位名稱（`lat`/`緯度`/`經度`…），找不到時自動掃描台北座標範圍內的數值欄位，因此可直接沿用衛生局、環保局等單位既有的 Excel／表單格式，不需要改造成固定的九欄格式
- 資料一律由 Apps Script Web App 代理讀取（見〈系統架構〉），試算表本身不需要公開分享
- 若點位的 `photo_url` 欄位有值，放大到「點位模式」（分群失效、顯示個別點位時）點擊該點位，彈出視窗會直接顯示現場照片，不會跟其他文字屬性混在一起列出

**「吸菸區巡查」是特例圖層**：這個分頁本身記錄的是巡查結果（沒有座標），但它的按鈕點下去，地圖畫的是「指定吸菸區設定」I 欄地址地理編碼出來的座標點（見〈系統架構〉），並自動帶入該地點在「吸菸區巡查」分頁最新一筆的巡查照片——所以點擊這個圖層的點位，看到的是「這個指定吸菸區、最近一次巡查拍的照片」，而不是巡查紀錄本身的清單。

### 篩選功能

- **月份滑桿**：選取特定月份或「全部時間」，◀ ▶ 按鈕逐月切換
- **時段 band 篩選**：點選 00–04 / 04–10 / 10–16 / 16–24 時，可多選
- 月份與時段篩選串聯，同步更新所有視覺化模式

### 統計資訊（左側面板）

- 顯示點位數（目前**已開啟圖層**篩選後的加總）
- 總回報數（已開啟圖層的全部資料）
- 最熱時段

> 統計資訊與下方「📊 成效報表」皆以目前**已手動開啟的圖層**資料為準；尚未點開任何圖層按鈕時，兩者皆為空。

### 📊 成效報表

點擊 Header「📊 成效報表」按鈕，從右側滑出報表面板，包含：

- **指標卡**：總通報數、環比變化（%）、連續下降月數、峰值月份、最熱時段、涵蓋月數
- **月趨勢折線圖**：每月通報量走勢
- **時段分布橫條圖**：各時段佔比
- **月份 × 時段堆疊橫條圖**：每月各時段比例，可觀察稽查後尖峰時段是否轉移

**報表按鈕的顯示規則**：報表統計是靠每個點位的 `timestamp` 欄位算出來的，不是每個動態圖層分頁都有這個欄位（例如純粹的地點清單）。因此按鈕會依目前**已開啟**的圖層動態顯示／隱藏：

| 已開啟的圖層狀態 | 報表按鈕 |
|---|---|
| 沒有開啟任何圖層 | 隱藏 |
| 開啟的圖層都有 `timestamp` 資料 | 顯示（多個圖層的資料會疊加一起統計） |
| 開啟的圖層中，只要有一個沒有 `timestamp` 資料 | 隱藏 |

若某個分頁明明是通報類資料、報表按鈕卻一直沒出現，通常代表該分頁缺少標題列，或標題沒有命名為 `timestamp`／`time_slot`，請參考〈Google Sheets 資料欄位〉章節補上。

---

## 目錄結構

```
├── docs/
│   ├── index.html              # 統計熱點地圖（MapLibre GL + supercluster + Chart.js）
│   └── api-mock.json           # 本機示範資料（10,000 筆）
├── apps-script/
│   ├── Code.gs                 # 主程式（API、去重、驗證、動態圖層讀取，doPost 寫入 SmokingReports）
│   ├── Config.gs               # 設定值管理（讀取 Script Properties，不寫死金鑰/ID）
│   ├── Inspection.gs           # 稽查通報後端（環保局菸蒂回報分頁讀寫、Drive 照片上傳）
│   ├── ZonePatrol.gs           # 吸菸區巡查後端 + 地圖圖層資料（地址地理編碼、快取）
│   ├── GenerateMockData.gs     # 測試資料產生器（10,000 筆，含清除功能）
│   ├── Form.html               # 稽查通報表單（分頁：菸蒂通報／吸菸區巡查）
│   ├── processFormData.gs      # HTML Service 表單資料橋接（呼叫 Inspection.gs）/ 地址地理編碼
│   └── appsscript.json         # Apps Script 專案設定
├── design/
│   └── system-design.md        # 系統設計規劃文件
└── README.md
```

---

## Google Sheets 資料欄位

### 通報資料工作表（表單寫入專用）

工作表名稱：預設 `SmokingReports`，可透過 Script Properties 的 `SHEET_NAME` 調整（見〈部署步驟〉）。

| 欄位 | 型別 | 說明 |
|------|------|------|
| id | STRING | UUID（自動產生） |
| timestamp | DATETIME | 回報時間（ISO 8601） |
| time_slot | INTEGER | 時段 0–11（`floor(hour/2)`） |
| lat | FLOAT | 緯度 |
| lng | FLOAT | 經度 |
| location_source | STRING | `gps` 或 `manual` |
| address_input | STRING | 使用者輸入的地址（選填） |
| description | STRING | 補充說明（選填） |
| reporter_hash | STRING | SHA-256 雜湊前 16 碼（用於去重，不儲存個人資料） |

### 環保局菸蒂回報工作表（稽查通報表單專用）

工作表名稱固定為 `環保局菸蒂回報`（寫死在 `Inspection.gs`）。前 9 欄與上方 `SmokingReports` 完全相同、後 4 欄是稽查表單新增的欄位，接在既有欄位之後、不打亂順序，對舊資料完全相容：

| # | 欄位 | 型別 | 說明 |
|---|------|------|------|
| 1–9 | id / timestamp / time_slot / lat / lng / location_source / address_input / description / reporter_hash | 同上 | 意義與 `SmokingReports` 相同 |
| 10 | district | STRING | 行政區（表單下拉選單，台北市 12 行政區） |
| 11 | inspector_unit | STRING | 稽查單位（表單必填） |
| 12 | inspector_name | STRING | 稽查人員姓名（表單必填） |
| 13 | photo_url | STRING | 現場照片的 Google Drive 公開檢視連結，無照片則空白 |
| 14 | butt_count | INTEGER | 菸蒂數量（選填，只能填正整數，無填寫則空白） |

> 這張工作表記錄的是**內部稽查人員**的登錄資料（含真實姓名、單位），跟上方 `SmokingReports` 給一般民眾匿名通報的設計不同，兩者刻意分開存放、互不影響。若這張分頁原本沒有標題列（例如舊資料直接匯入），`Inspection.gs` 的 `getOrCreateInspectionSheet_()` 第一次寫入時會自動補上標題列，不需要手動到 Google Sheets 編輯。

### 指定吸菸區設定工作表（既有資料，僅供讀取）

工作表名稱固定為 `指定吸菸區設定`（寫死在 `ZonePatrol.gs`），**必須和主資料庫在同一份試算表**（即 Script Properties 的 `SHEET_ID`）。這張表不是本系統建立或寫入的，是既有的管理資料，`ZonePatrol.gs` 只會讀取，不會修改。目前用到 4 欄：

| 欄位位置 | 說明 | 用途 |
|---|---|---|
| G 欄 | 行政區 | 稽查表單下拉選單第一層；地圖點位屬性 |
| H 欄 | 地點 | 稽查表單下拉選單第二層（依行政區篩選）；地圖點位屬性 |
| I 欄 | 地址 | 地圖「吸菸區巡查」圖層的座標來源，由 Apps Script 地理編碼 |
| J 欄 | 管理單位 | 稽查表單選定地點後自動帶入（唯讀）；地圖點位屬性 |

> 這 4 欄用**欄位位置**（G/H/I/J）讀取而非欄位名稱比對，若這張表的欄位順序調整過，`ZonePatrol.gs` 的 `getDesignatedSmokingZones()` 和 `getDesignatedZoneGeoJson()` 都要跟著改。

### 吸菸區巡查工作表（吸菸區巡查表單專用）

工作表名稱固定為 `吸菸區巡查`（寫死在 `ZonePatrol.gs`），分頁不存在或缺標題列時，`getOrCreateZonePatrolSheet_()` 會自動建立／補上標題列，機制與 `環保局菸蒂回報` 相同：

| # | 欄位 | 型別 | 說明 |
|---|------|------|------|
| 1 | id | STRING | UUID |
| 2 | timestamp | DATETIME | 巡查時間（伺服器端產生，ISO 8601） |
| 3 | time_slot | INTEGER | 時段 0–11 |
| 4 | district | STRING | 行政區（來自指定吸菸區設定 G 欄） |
| 5 | location | STRING | 地點（來自指定吸菸區設定 H 欄） |
| 6 | managing_unit | STRING | 管理單位（來自指定吸菸區設定 J 欄，自動帶入） |
| 7 | reporter_name | STRING | 填報人姓名（表單必填） |
| 8 | photo_url | STRING | 現場照片的 Google Drive 公開檢視連結，無照片則空白 |

> 這張表本身沒有經緯度欄位，但地圖 Header 的「吸菸區巡查」按鈕**不是**直接讀這張表的座標——`Code.gs` 的 `getSheetRowsJson()` 對這個分頁名稱做了特殊轉接，改成畫「指定吸菸區設定」的地址點位，並從這張表撈每個地點最新一筆照片附上去（見〈多分頁動態圖層〉的「吸菸區巡查是特例圖層」說明）。

### 其他動態圖層分頁（選用）

同一份試算表底下可自由新增其他分頁（例如稽查單位自建的 Excel 匯入資料），會自動出現在地圖 Header 成為獨立圖層，欄位格式不需要與上表一致——只要有一欄能被判定為緯度、一欄能被判定為經度即可（見〈多分頁動態圖層〉）。

---

## 部署步驟

### 一、Google Sheets 設定

1. 建立新 Google Sheets，複製試算表 ID（URL 中的長字串）
2. **共用設定維持預設（限制／僅擁有者）即可，不需要公開分享**——因為所有讀取都改由 Apps Script Web App 以「執行者：我」的身分代理存取（見下方），不再有前端直接呼叫 Google API 的路徑

### 二、Apps Script 部署

1. 開啟 [Google Apps Script](https://script.google.com) 建立新專案
2. 複製以下檔案至對應 `.gs` / `.html`：
   - `Code.gs`、`Config.gs`、`Inspection.gs`、`ZonePatrol.gs`、`GenerateMockData.gs`、`Form.html`、`processFormData.gs`、`appsscript.json`
3. **設定專案設定 → 指令碼屬性**（不要把 ID 寫進程式碼）：
   | 屬性名稱 | 必填 | 值 |
   |---|---|---|
   | `SHEET_ID` | 是 | 您的試算表 ID |
   | `SHEET_NAME` | 否 | 通報資料工作表名稱，預設 `SmokingReports` |
   | `ALLOWED_ORIGIN` | 否 | 前端網域，預設 `https://tghtaipei.github.io` |
4. **部署 → 新增部署 → 網頁應用程式**
   - 執行者：**我**
   - 存取者：**所有人**
5. 複製部署網址：這個網址同時是「通報表單」的網址，也是 `docs/index.html` 的 `API_URL`（見下方步驟三），Form.html 本身不需要另外填任何網址

> 之後若需要更換試算表（例如原檔損毀重建），只要回到「指令碼屬性」改 `SHEET_ID` 即可，不需要改動、也不需要重新部署任何程式碼。

> **首次加入照片上傳功能時**：因為 `Inspection.gs` 用到 `DriveApp`，存檔或執行時 Apps Script 會跳出「這個應用程式需要存取你的 Google 雲端硬碟」的授權畫面，需要部署者本人手動點「允許」一次，這步驟無法代為執行。之後每次部署新版本都不會再跳出（除非撤銷授權）。

> **首次啟用「吸菸區巡查」地圖圖層時**：`ZonePatrol.gs` 用到 `Maps.newGeocoder()`，同樣需要手動同意一次地圖服務的授權畫面。建議部署後先到 Apps Script 編輯器手動執行一次 `warmZoneGeocodeCache()`，把「指定吸菸區設定」裡所有地址一次地理編碼完並寫入快取，避免第一位打開地圖的使用者剛好遇到大量地址同時查詢、doGet 執行時間過長逾時。之後只有新增的地址才需要重新查詢。

### 三、GitHub Pages 設定

1. 修改 `docs/index.html` 中的 `API_URL` 為您的 Apps Script 部署網址（`Form.html` 用的同一個網址）
2. Repository Settings → Pages → Branch: `main`，Folder: `/docs`
3. 約 1–2 分鐘後生效

> `docs/index.html` 不再需要、也不應該填入試算表 ID 或任何 Google API 金鑰——地圖資料一律透過上面的 `API_URL` 向 Apps Script 拿。

### 四、產生測試資料（選用）

在 Apps Script 編輯器執行 `generateMockData()`，自動寫入 10,000 筆台北市模擬通報資料。執行 `clearMockData()` 可清除（reporter_hash 以 `mock-` 開頭的資料）。

---

## 安全性設計

- 通報表單（`SmokingReports`／`doPost`／`GenerateMockData.gs` 這條路徑）不儲存使用者個人資料，以裝置識別碼 SHA-256 雜湊去重，同一裝置同時段同位置（100m 內）僅計 1 筆
- 座標限制於台北市範圍（緯度 24.9–25.3，經度 121.4–121.7）
- 試算表 ID、工作表名稱等設定值一律存放於 Apps Script「指令碼屬性」，不寫死在程式碼中，前端與 GitHub 上的原始碼皆不含任何試算表 ID 或 API 金鑰
- 所有讀取（圖層清單、座標資料）都透過 Apps Script Web App 以「執行者：我」代理存取，Google Sheets 本身**不需要公開分享**，降低原始通報資料（含地址、備註）被任意知道連結的人讀取的風險
- **例外**：稽查通報表單（`Form.html` → `Inspection.gs` → `環保局菸蒂回報`）是內部登錄工具，**會**明碼記錄稽查人員的單位與姓名，這是刻意設計（供內部稽核追蹤），不適用「不儲存個人資料」這條原則，請勿把這張分頁的存取權隨意分享出去
- 現場照片存於 Google Drive，設定為「知道連結即可檢視」（地圖需要直接用 `<img>` 嵌入顯示，因此無法要求登入才能看）。照片檔案 ID 為長隨機字串、不會被公開列出目錄，但拍攝內容本身（門牌、路人等）一經上傳即可被任何取得連結的人看到，請提醒稽查人員拍照時留意畫面內容

---

## 已知限制

| 項目 | 說明 |
|------|------|
| GPS 精度 | 依裝置與環境，室內可能偏差 10–50m |
| Apps Script 配額 | 免費帳號每日執行時間上限 6 分鐘，大量資料讀取時需注意 |
| 動態圖層座標偵測 | 分頁若缺乏可辨識的經緯度欄位名稱、且數值也不落在台北座標範圍內，該分頁將無法顯示任何點位 |
| 前端狀態快取 | 地圖點位與「📊 成效報表」資料皆暫存於瀏覽器記憶體，僅在使用者手動點擊圖層按鈕或按下「🔄 重新整理」時才會向 Apps Script 重新取資料；背景試算表異動不會即時反映在已開啟的分頁 |
| 字體限制 | OpenFreeMap 不提供自訂字體，地圖標籤使用底圖內建字體 |
| 照片上傳大小 | 表單會在瀏覽器端先壓縮（長邊 1600px、JPEG 品質 0.75）再上傳，避免手機原圖過大塞爆 `google.script.run` 的傳輸與 Apps Script 執行時間；壓縮後仍可能因網路狀況上傳較慢 |
| 吸菸區巡查圖層地址地理編碼 | 地址若地理編碼失敗（例如地址寫得不夠完整），該筆點位會直接跳過、不會顯示在地圖上；建議部署後執行一次 `warmZoneGeocodeCache()` 並檢查 Apps Script 執行紀錄，確認沒有地址失敗 |
| 吸菸區巡查圖層資料即時性 | 座標快取在指令碼屬性，同一地址不會重複查詢；「指定吸菸區設定」若修改了某筆既有地址，需要手動清除該筆快取（或整個 `ZONE_GEOCODE_CACHE` 屬性）才會重新查詢新地址 |
