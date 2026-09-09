// ============================================================
// 吸菸熱點通報系統 — Google Apps Script 主程式
// ============================================================

// SHEET_ID / SHEET_NAME / ALLOWED_ORIGIN 一律由 Config.gs 的
// getConfig_() 從「指令碼屬性」讀取，不再寫死於程式碼中。

// ── 動態圖層讀取用的經緯度欄位名稱（不分大小寫比對）───────────
var LAT_KEYS = ['lat', 'latitude', '緯度', 'y座標', '座標y', 'wgs84緯度', '座標-wgs84-y'];
var LNG_KEYS = ['lng', 'longitude', '經度', 'x座標', '座標x', 'wgs84經度', '座標-wgs84-x'];

// ── 欄位索引常數 ─────────────────────────────────────────────
var COL = {
  ID: 1,
  TIMESTAMP: 2,
  TIME_SLOT: 3,
  LAT: 4,
  LNG: 5,
  LOCATION_SOURCE: 6,
  ADDRESS_INPUT: 7,
  DESCRIPTION: 8,
  REPORTER_HASH: 9
};

// ── 頁面服務（表單主頁）─────────────────────────────────────
function doGet(e) {
  var action = e && e.parameter && e.parameter.action;

  if (action === 'getReports')  return getReportsJson(e);
  if (action === 'listSheets')  return listSheetsJson(e);
  if (action === 'getSheetRows') return getSheetRowsJson(e);

  // 回傳表單 HTML
  return HtmlService
    .createHtmlOutputFromFile('Form')
    .setTitle('吸菸熱點通報')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

// ── 表單送出處理 ─────────────────────────────────────────────
function doPost(e) {
  try {
    var data = JSON.parse(e.postData.contents);
    var result = saveReport(data);
    return buildJsonResponse({ success: true, id: result.id });
  } catch (err) {
    return buildJsonResponse({ success: false, error: err.message }, 400);
  }
}

// ── 儲存回報至 Google Sheets ─────────────────────────────────
function saveReport(data) {
  validateReport(data);

  var cfg = getConfig_();
  var ss = SpreadsheetApp.openById(cfg.SHEET_ID);
  var sheet = getOrCreateSheet(ss, cfg.SHEET_NAME);

  var now = new Date();
  var id = generateUUID();
  var timeSlot = calcTimeSlot(now);
  var reporterHash = hashString(data.reporterToken || '');

  // 重複回報偵測（同一 hash 在同時段同位置 100m 內）
  if (isDuplicateReport(sheet, reporterHash, timeSlot, data.lat, data.lng)) {
    throw new Error('DUPLICATE_REPORT');
  }

  sheet.appendRow([
    id,
    now.toISOString(),
    timeSlot,
    data.lat,
    data.lng,
    data.locationSource,
    data.addressInput || '',
    data.description || '',
    reporterHash
  ]);

  return { id: id };
}

// ── 取得回報資料（GeoJSON）───────────────────────────────────
function getReportsJson(e) {
  var slot     = e && e.parameter && e.parameter.slot;
  var callback = e && e.parameter && e.parameter.callback; // JSONP support
  var cfg = getConfig_();
  var ss = SpreadsheetApp.openById(cfg.SHEET_ID);
  var sheet = getOrCreateSheet(ss, cfg.SHEET_NAME);
  var rows = sheet.getDataRange().getValues();

  var features = [];
  for (var i = 1; i < rows.length; i++) {
    var row = rows[i];
    var rowSlot = String(row[COL.TIME_SLOT - 1]);
    if (slot && slot !== 'all' && rowSlot !== slot) continue;

    var lat = parseFloat(row[COL.LAT - 1]);
    var lng = parseFloat(row[COL.LNG - 1]);
    if (isNaN(lat) || isNaN(lng)) continue;

    features.push({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [lng, lat] },
      properties: {
        id: row[COL.ID - 1],
        timestamp: row[COL.TIMESTAMP - 1],
        time_slot: parseInt(rowSlot),
        address_input: row[COL.ADDRESS_INPUT - 1],
        description: row[COL.DESCRIPTION - 1]
      }
    });
  }

  var geojson = JSON.stringify({ type: 'FeatureCollection', features: features });

  // JSONP：用 script tag 載入可繞過 CORS
  if (callback) {
    return ContentService
      .createTextOutput(callback + '(' + geojson + ')')
      .setMimeType(ContentService.MimeType.JAVASCRIPT);
  }
  return ContentService.createTextOutput(geojson).setMimeType(ContentService.MimeType.JSON);
}

// ── 工具函式 ─────────────────────────────────────────────────

function calcTimeSlot(date) {
  return Math.floor(date.getHours() / 2);
}

function generateUUID() {
  return Utilities.getUuid();
}

function hashString(str) {
  var raw = Utilities.computeDigest(
    Utilities.DigestAlgorithm.SHA_256,
    str,
    Utilities.Charset.UTF_8
  );
  return raw.map(function(b) {
    return ('0' + (b & 0xff).toString(16)).slice(-2);
  }).join('').substring(0, 16);
}

function getOrCreateSheet(ss, sheetName) {
  var sheet = ss.getSheetByName(sheetName);
  if (!sheet) {
    sheet = ss.insertSheet(sheetName);
    sheet.appendRow([
      'id', 'timestamp', 'time_slot', 'lat', 'lng',
      'location_source', 'address_input', 'description', 'reporter_hash'
    ]);
  }
  return sheet;
}

// ── 動態圖層：列出試算表所有分頁名稱（取代前端直接呼叫 Sheets API）──
function listSheetsJson(e) {
  var callback = e && e.parameter && e.parameter.callback;
  var cfg = getConfig_();
  var ss = SpreadsheetApp.openById(cfg.SHEET_ID);
  var names = ss.getSheets().map(function(s) { return s.getName(); });
  var json = JSON.stringify({ sheets: names });

  if (callback) {
    return ContentService
      .createTextOutput(callback + '(' + json + ')')
      .setMimeType(ContentService.MimeType.JAVASCRIPT);
  }
  return ContentService.createTextOutput(json).setMimeType(ContentService.MimeType.JSON);
}

// ── 動態圖層：讀取指定分頁的座標資料（取代前端直接呼叫 gviz）───
function getSheetRowsJson(e) {
  var sheetName = e && e.parameter && e.parameter.sheet;
  var callback  = e && e.parameter && e.parameter.callback;
  if (!sheetName) return jsonpErrorResponse_('MISSING_SHEET_PARAM', callback);

  var cfg = getConfig_();
  var ss = SpreadsheetApp.openById(cfg.SHEET_ID);
  var sheet = ss.getSheetByName(sheetName);
  if (!sheet) return jsonpErrorResponse_('SHEET_NOT_FOUND', callback);

  var values = sheet.getDataRange().getValues();
  var headers = values.length > 0 ? values[0] : [];
  var headersLower = headers.map(function(h) { return String(h).toLowerCase(); });

  var latIdx = -1, lngIdx = -1;
  headersLower.forEach(function(h, i) {
    if (latIdx < 0 && LAT_KEYS.indexOf(h) >= 0) latIdx = i;
    if (lngIdx < 0 && LNG_KEYS.indexOf(h) >= 0) lngIdx = i;
  });

  var features = [];
  for (var r = 1; r < values.length; r++) {
    var row = values[r];
    var lat, lng;
    if (latIdx >= 0 && lngIdx >= 0) {
      lat = parseFloat(row[latIdx]);
      lng = parseFloat(row[lngIdx]);
    } else {
      // 找不到明確的經緯度欄位名稱時，自動掃描台北座標範圍
      row.forEach(function(v) {
        var n = parseFloat(v);
        if (isNaN(n)) return;
        if (lat === undefined && n >= 24.9 && n <= 25.3) lat = n;
        if (lng === undefined && n >= 121.4 && n <= 121.7) lng = n;
      });
    }
    if (lat === undefined || lng === undefined || isNaN(lat) || isNaN(lng)) continue;

    var props = {};
    headers.forEach(function(h, i) { props[h] = row[i]; });
    features.push({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [lng, lat] },
      properties: props
    });
  }

  var geojson = JSON.stringify({ type: 'FeatureCollection', features: features });
  if (callback) {
    return ContentService
      .createTextOutput(callback + '(' + geojson + ')')
      .setMimeType(ContentService.MimeType.JAVASCRIPT);
  }
  return ContentService.createTextOutput(geojson).setMimeType(ContentService.MimeType.JSON);
}

function validateReport(data) {
  if (typeof data.lat !== 'number' || typeof data.lng !== 'number') {
    throw new Error('INVALID_COORDINATES');
  }
  if (data.lat < 24.9 || data.lat > 25.3 || data.lng < 121.4 || data.lng > 121.7) {
    throw new Error('OUT_OF_TAIPEI_BOUNDS');
  }
  if (!['gps', 'manual'].includes(data.locationSource)) {
    throw new Error('INVALID_LOCATION_SOURCE');
  }
}

function isDuplicateReport(sheet, hash, timeSlot, lat, lng) {
  if (!hash) return false;
  var rows = sheet.getDataRange().getValues();
  for (var i = 1; i < rows.length; i++) {
    var row = rows[i];
    if (row[COL.REPORTER_HASH - 1] !== hash) continue;
    if (row[COL.TIME_SLOT - 1] !== timeSlot) continue;
    var dist = haversineKm(lat, lng,
      parseFloat(row[COL.LAT - 1]),
      parseFloat(row[COL.LNG - 1]));
    if (dist < 0.1) return true;
  }
  return false;
}

function haversineKm(lat1, lng1, lat2, lng2) {
  var R = 6371;
  var dLat = (lat2 - lat1) * Math.PI / 180;
  var dLng = (lng2 - lng1) * Math.PI / 180;
  var a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLng / 2) * Math.sin(dLng / 2);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function buildJsonResponse(obj, statusCode) {
  var output = ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
  return output;
}

// JSONP 情境下的錯誤回應：即使失敗也要呼叫 callback，前端才能收到並清除暫存的 <script>
function jsonpErrorResponse_(errorCode, callback) {
  var json = JSON.stringify({ success: false, error: errorCode });
  if (callback) {
    return ContentService
      .createTextOutput(callback + '(' + json + ')')
      .setMimeType(ContentService.MimeType.JAVASCRIPT);
  }
  return ContentService.createTextOutput(json).setMimeType(ContentService.MimeType.JSON);
}
