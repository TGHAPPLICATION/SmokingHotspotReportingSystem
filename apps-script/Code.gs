// ============================================================
// 吸菸熱點通報系統 — Google Apps Script 主程式
// ============================================================

var SHEET_ID = 'YOUR_GOOGLE_SHEET_ID_HERE';  // ← 部署時替換
var SHEET_NAME = 'SmokingReports';
var ALLOWED_ORIGIN = 'https://tghtaipei.github.io';  // GitHub Pages 網域

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

  if (action === 'getReports') {
    return getReportsJson(e);
  }

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

  var ss = SpreadsheetApp.openById(SHEET_ID);
  var sheet = getOrCreateSheet(ss);

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
  var ss = SpreadsheetApp.openById(SHEET_ID);
  var sheet = getOrCreateSheet(ss);
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

function getOrCreateSheet(ss) {
  var sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(SHEET_NAME);
    sheet.appendRow([
      'id', 'timestamp', 'time_slot', 'lat', 'lng',
      'location_source', 'address_input', 'description', 'reporter_hash'
    ]);
  }
  return sheet;
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
