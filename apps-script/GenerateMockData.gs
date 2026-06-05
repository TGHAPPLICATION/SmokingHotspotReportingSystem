// ============================================================
// 測試資料產生器
// 使用方式：
//   在 Apps Script 編輯器選取 generateMockData 函式 → 點「執行」
//   執行完畢後 SmokingReports 工作表會新增 10000 筆測試資料
//
// 清除測試資料：執行 clearMockData 函式
// ============================================================

var MOCK_COUNT = 10000;   // 產生筆數
var BATCH_SIZE = 500;     // 每批寫入列數（避免逾時）

// 台北市各區熱點（真實地標座標 + 相對權重）
var HOTSPOTS = [
  { lat: 25.0330, lng: 121.5654, w: 8, dist: '信義區', places: ['市府路','松壽路','松仁路','信義路五段'] },
  { lat: 25.0409, lng: 121.5686, w: 7, dist: '信義區', places: ['統一時代','ATT4FUN前','台北101附近','松高路'] },
  { lat: 25.0330, lng: 121.5430, w: 7, dist: '大安區', places: ['忠孝東路四段','仁愛路四段','敦化南路','建國南路'] },
  { lat: 25.0270, lng: 121.5395, w: 5, dist: '大安區', places: ['師大路','和平東路','羅斯福路三段','新生南路'] },
  { lat: 25.0478, lng: 121.5198, w: 9, dist: '中山區', places: ['南京東路二段','林森北路','中山北路二段','長安東路'] },
  { lat: 25.0589, lng: 121.5240, w: 6, dist: '中山區', places: ['民族東路','民權東路','新生北路','松江路'] },
  { lat: 25.0455, lng: 121.5395, w: 8, dist: '中正區', places: ['忠孝東路一段','忠孝西路','館前路','重慶南路'] },
  { lat: 25.0430, lng: 121.5060, w: 5, dist: '中正區', places: ['中華路','西門町','漢中街','成都路'] },
  { lat: 25.0380, lng: 121.5005, w: 6, dist: '萬華區', places: ['西園路','艋舺大道','康定路','長沙街'] },
  { lat: 25.0640, lng: 121.5130, w: 5, dist: '大同區', places: ['重慶北路','延平北路','民生西路','南京西路'] },
  { lat: 25.0500, lng: 121.5770, w: 6, dist: '松山區', places: ['南京東路五段','敦化北路','八德路四段','饒河街'] },
  { lat: 25.0440, lng: 121.5580, w: 5, dist: '松山區', places: ['忠孝東路五段','光復北路','市民大道四段'] },
  { lat: 25.0630, lng: 121.5890, w: 4, dist: '內湖區', places: ['內湖路','文德路','成功路','康寧路'] },
  { lat: 25.0550, lng: 121.6050, w: 3, dist: '南港區', places: ['南港路','研究院路','中研路'] },
  { lat: 24.9900, lng: 121.5710, w: 4, dist: '文山區', places: ['羅斯福路六段','木柵路','興隆路','景美街'] },
  { lat: 25.0930, lng: 121.5240, w: 5, dist: '士林區', places: ['中山北路五段','文林路','天母東路','士林夜市'] },
  { lat: 25.1320, lng: 121.4990, w: 3, dist: '北投區', places: ['中和街','大業路','光明路','中央北路'] }
];

// 時段權重（通勤/午餐/下班偏高）
var SLOT_WEIGHTS = [1, 0.5, 0.5, 1, 4, 5, 3, 6, 5, 8, 6, 4];

var DESCRIPTIONS = [
  '騎樓下', '公車站牌旁', '捷運出口', '地下街出口', '停車場入口',
  '便利商店旁', '夜市附近', '公園旁', '百貨入口', '餐廳外',
  '廁所附近', '早市旁', '學校附近', '辦公大樓前', '巷子口',
  '市場旁', '加油站旁', '', '', ''
];

// ── 加權隨機 ──
function weightedRandom_(weights) {
  var total = 0;
  for (var i = 0; i < weights.length; i++) total += weights[i];
  var r = Math.random() * total;
  for (var j = 0; j < weights.length; j++) {
    r -= weights[j];
    if (r <= 0) return j;
  }
  return weights.length - 1;
}

// ── Box-Muller 高斯亂數 ──
function gaussian_(mean, std) {
  var u = Math.random(), v = Math.random();
  while (u === 0) u = Math.random();
  return mean + std * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

// ── 產生單筆 row ──
function makeRow_(baseDate) {
  var hotspotWeights = HOTSPOTS.map(function(h) { return h.w; });
  var hi  = weightedRandom_(hotspotWeights);
  var spot = HOTSPOTS[hi];

  var lat = gaussian_(spot.lat, 0.005);
  var lng = gaussian_(spot.lng, 0.005);
  lat = Math.round(lat * 10000) / 10000;
  lng = Math.round(lng * 10000) / 10000;

  var slot   = weightedRandom_(SLOT_WEIGHTS);
  var hour   = slot * 2 + Math.floor(Math.random() * 2);
  var min    = Math.floor(Math.random() * 60);
  var sec    = Math.floor(Math.random() * 60);
  var daysAgo = Math.floor(Math.random() * 180);
  var ts = new Date(baseDate - daysAgo * 86400000);
  ts.setHours(hour, min, sec, 0);

  var place = spot.places[Math.floor(Math.random() * spot.places.length)];
  var desc  = DESCRIPTIONS[Math.floor(Math.random() * DESCRIPTIONS.length)];

  return [
    Utilities.getUuid(),                    // id
    ts.toISOString(),                        // timestamp
    slot,                                    // time_slot
    lat,                                     // lat
    lng,                                     // lng
    'manual',                                // location_source
    '台北市' + spot.dist + place,            // address_input
    desc,                                    // description
    'mock-' + Math.random().toString(36).slice(2, 10) // reporter_hash
  ];
}

// ── 主函式：產生測試資料 ──
function generateMockData() {
  var ss    = SpreadsheetApp.openById(SHEET_ID);
  var sheet = getOrCreateSheet(ss);
  var baseDate = new Date();
  var rows = [];

  for (var i = 0; i < MOCK_COUNT; i++) {
    rows.push(makeRow_(baseDate));

    // 每批寫入一次
    if (rows.length === BATCH_SIZE) {
      sheet.getRange(sheet.getLastRow() + 1, 1, rows.length, rows[0].length)
           .setValues(rows);
      rows = [];
      SpreadsheetApp.flush();
    }
  }

  // 寫入最後一批
  if (rows.length > 0) {
    sheet.getRange(sheet.getLastRow() + 1, 1, rows.length, rows[0].length)
         .setValues(rows);
    SpreadsheetApp.flush();
  }

  var total = sheet.getLastRow() - 1; // 減去 header
  Logger.log('✅ 完成！試算表現有 ' + total + ' 筆資料（含測試資料）');
  SpreadsheetApp.getUi().alert('✅ 成功產生 ' + MOCK_COUNT + ' 筆測試資料！\n試算表現有共 ' + total + ' 筆。');
}

// ── 清除所有 mock 資料（reporter_hash 以 mock- 開頭）──
function clearMockData() {
  var ss    = SpreadsheetApp.openById(SHEET_ID);
  var sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) { Logger.log('找不到工作表'); return; }

  var data = sheet.getDataRange().getValues();
  var toDelete = [];
  // 從最後一列往前找，避免 index 錯位
  for (var i = data.length - 1; i >= 1; i--) {
    var hash = String(data[i][8]); // reporter_hash 欄
    if (hash.indexOf('mock-') === 0) toDelete.push(i + 1);
  }

  toDelete.forEach(function(rowNum) { sheet.deleteRow(rowNum); });
  Logger.log('✅ 已刪除 ' + toDelete.length + ' 筆 mock 資料');
  SpreadsheetApp.getUi().alert('✅ 已清除 ' + toDelete.length + ' 筆測試資料。');
}
