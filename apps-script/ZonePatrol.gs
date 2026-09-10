// ============================================================
// 吸菸區巡查 — 稽查人員巡檢指定吸菸區專用表單後端
// ============================================================
// 讀取「指定吸菸區設定」分頁（G:行政區、H:地點、I:地址、J:管理單位）
// 提供表單下拉選單，巡查結果固定寫入「吸菸區巡查」分頁。與
// Inspection.gs 的「環保局菸蒂回報」是兩張獨立分頁，互不影響；照片
// 上傳共用 Inspection.gs 的 uploadInspectionPhoto（同一個 Drive 資料夾）。
//
// 這個檔案同時提供地圖「合法吸菸區」圖層的資料（doGet action=
// getDesignatedZones）：把 I 欄地址地理編碼成座標（結果快取在
// Script Properties），並帶入該地點在「吸菸區巡查」最新一筆照片。

var ZONE_SETTING_SHEET_NAME = '指定吸菸區設定';
var ZONE_PATROL_SHEET_NAME = '吸菸區巡查';
var ZONE_PATROL_HEADERS = [
  'id', 'timestamp', 'time_slot', 'district', 'location',
  'managing_unit', 'reporter_name', 'photo_url'
];

// ── 讀取「指定吸菸區設定」G/H/J 欄，供表單下拉選單使用 ─────────
function getDesignatedSmokingZones() {
  try {
    var cfg = getConfig_();
    var ss = SpreadsheetApp.openById(cfg.SHEET_ID);
    var sheet = ss.getSheetByName(ZONE_SETTING_SHEET_NAME);
    if (!sheet) return { success: false, error: 'ZONE_SHEET_NOT_FOUND' };

    var lastRow = sheet.getLastRow();
    if (lastRow < 2) return { success: true, zones: [] };

    // G:J 共 4 欄（G=行政區, H=地點, I=略過, J=管理單位），從第 2 列開始（略過標題列）
    var values = sheet.getRange(2, 7, lastRow - 1, 4).getValues();
    var zones = [];
    values.forEach(function(row) {
      var district = String(row[0] || '').trim();
      var location = String(row[1] || '').trim();
      var unit = String(row[3] || '').trim();
      if (district && location) zones.push({ district: district, location: location, unit: unit });
    });
    return { success: true, zones: zones };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

// ── 取得或建立「吸菸區巡查」分頁，並確保標題列完整 ─────────────
function getOrCreateZonePatrolSheet_(ss) {
  var sheet = ss.getSheetByName(ZONE_PATROL_SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(ZONE_PATROL_SHEET_NAME);
    sheet.getRange(1, 1, 1, ZONE_PATROL_HEADERS.length).setValues([ZONE_PATROL_HEADERS]);
    return sheet;
  }

  var lastCol = Math.max(sheet.getLastColumn(), 1);
  var existingHeaderRow = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
  var looksLikeHeader = String(existingHeaderRow[1] || '').toLowerCase() === 'timestamp';

  if (!looksLikeHeader) {
    sheet.insertRowBefore(1);
    sheet.getRange(1, 1, 1, ZONE_PATROL_HEADERS.length).setValues([ZONE_PATROL_HEADERS]);
  } else if (existingHeaderRow.length < ZONE_PATROL_HEADERS.length) {
    var missing = ZONE_PATROL_HEADERS.slice(existingHeaderRow.length);
    sheet.getRange(1, existingHeaderRow.length + 1, 1, missing.length).setValues([missing]);
  }
  return sheet;
}

// ── 儲存巡查紀錄 ─────────────────────────────────────────────
function saveZonePatrol(data) {
  if (!data.district) throw new Error('MISSING_DISTRICT');
  if (!data.location) throw new Error('MISSING_LOCATION');
  if (!data.managingUnit) throw new Error('MISSING_MANAGING_UNIT');
  if (!data.reporterName) throw new Error('MISSING_REPORTER_NAME');

  var cfg = getConfig_();
  var ss = SpreadsheetApp.openById(cfg.SHEET_ID);
  var sheet = getOrCreateZonePatrolSheet_(ss);

  var now = new Date();
  var id = generateUUID();
  var timeSlot = calcTimeSlot(now);

  sheet.appendRow([
    id,
    now.toISOString(),
    timeSlot,
    data.district,
    data.location,
    data.managingUnit,
    data.reporterName,
    data.photoUrl || ''
  ]);

  return { id: id };
}

function processZonePatrolData(data) {
  try {
    var result = saveZonePatrol(data);
    return { success: true, id: result.id };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

// ============================================================
// 地圖「合法吸菸區」資料來源：改讀「指定吸菸區設定」I 欄地址，
// 地理編碼後畫成點位，並帶入「吸菸區巡查」該地點最新一張照片。
// ============================================================

var ZONE_GEOCODE_CACHE_KEY = 'ZONE_GEOCODE_CACHE'; // Script Properties：{address: {lat,lng}} JSON

// 地址地理編碼，結果快取在 Script Properties，避免每次地圖載入都重新查詢
// （指定吸菸區的地址基本不會變動，快取幾乎不需要失效）
function geocodeAddressesCached_(addresses) {
  var props = PropertiesService.getScriptProperties();
  var raw = props.getProperty(ZONE_GEOCODE_CACHE_KEY);
  var cache = raw ? JSON.parse(raw) : {};
  var dirty = false;
  var geocoder = Maps.newGeocoder().setRegion('tw');

  addresses.forEach(function(addr) {
    if (!addr || cache[addr]) return;
    try {
      var result = geocoder.geocode(addr);
      if (result.status === 'OK' && result.results.length > 0) {
        var loc = result.results[0].geometry.location;
        cache[addr] = { lat: loc.lat, lng: loc.lng };
        dirty = true;
      }
    } catch (e) { /* 地理編碼失敗就跳過這筆，不影響其他地址 */ }
  });

  if (dirty) props.setProperty(ZONE_GEOCODE_CACHE_KEY, JSON.stringify(cache));
  return cache;
}

// 供部署者在 Apps Script 編輯器手動執行：一次把所有地址地理編碼完、寫入快取，
// 避免地圖使用者剛好遇到大量地址第一次查詢、doGet 執行時間過長逾時
function warmZoneGeocodeCache() {
  var cfg = getConfig_();
  var ss = SpreadsheetApp.openById(cfg.SHEET_ID);
  var sheet = ss.getSheetByName(ZONE_SETTING_SHEET_NAME);
  if (!sheet) { Logger.log('找不到「指定吸菸區設定」分頁'); return; }
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) { Logger.log('「指定吸菸區設定」沒有資料'); return; }
  var addresses = sheet.getRange(2, 9, lastRow - 1, 1).getValues() // I 欄
    .map(function(row) { return String(row[0] || '').trim(); })
    .filter(function(a) { return a; });
  geocodeAddressesCached_(addresses);
  Logger.log('✅ 已處理 ' + addresses.length + ' 筆地址的地理編碼快取');
}

// 從「吸菸區巡查」找出每個地點（district+location）最新一筆照片
function getLatestPatrolPhotos_(ss) {
  var sheet = ss.getSheetByName(ZONE_PATROL_SHEET_NAME);
  if (!sheet) return {};
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return {};

  var values = sheet.getRange(2, 1, lastRow - 1, ZONE_PATROL_HEADERS.length).getValues();
  var idxTimestamp = ZONE_PATROL_HEADERS.indexOf('timestamp');
  var idxDistrict  = ZONE_PATROL_HEADERS.indexOf('district');
  var idxLocation  = ZONE_PATROL_HEADERS.indexOf('location');
  var idxPhoto     = ZONE_PATROL_HEADERS.indexOf('photo_url');

  var latest = {}; // key: "district|location" -> { photoUrl, timestamp }
  values.forEach(function(row) {
    var photoUrl = String(row[idxPhoto] || '').trim();
    if (!photoUrl) return;
    var key = String(row[idxDistrict] || '').trim() + '|' + String(row[idxLocation] || '').trim();
    var ts = row[idxTimestamp];
    var current = latest[key];
    if (!current || new Date(ts) > new Date(current.timestamp)) {
      latest[key] = { photoUrl: photoUrl, timestamp: ts };
    }
  });

  var result = {};
  Object.keys(latest).forEach(function(k) { result[k] = latest[k].photoUrl; });
  return result;
}

// ── 地圖用：合法吸菸區 GeoJSON（doGet action=getDesignatedZones）──
function getDesignatedZoneGeoJson(e) {
  var callback = e && e.parameter && e.parameter.callback;
  try {
    var cfg = getConfig_();
    var ss = SpreadsheetApp.openById(cfg.SHEET_ID);
    var settingSheet = ss.getSheetByName(ZONE_SETTING_SHEET_NAME);
    if (!settingSheet) return jsonpErrorResponse_('ZONE_SHEET_NOT_FOUND', callback);

    var lastRow = settingSheet.getLastRow();
    var zones = [];
    if (lastRow >= 2) {
      // G:J 共 4 欄（G=行政區, H=地點, I=地址, J=管理單位）
      var values = settingSheet.getRange(2, 7, lastRow - 1, 4).getValues();
      values.forEach(function(row) {
        var district = String(row[0] || '').trim();
        var location = String(row[1] || '').trim();
        var address  = String(row[2] || '').trim();
        var unit     = String(row[3] || '').trim();
        if (district && location && address) {
          zones.push({ district: district, location: location, address: address, unit: unit });
        }
      });
    }

    var coords = geocodeAddressesCached_(zones.map(function(z) { return z.address; }));
    var latestPhotos = getLatestPatrolPhotos_(ss);

    var features = [];
    zones.forEach(function(z) {
      var coord = coords[z.address];
      if (!coord) return; // 地理編碼失敗的地址跳過，不影響其他點位
      var key = z.district + '|' + z.location;
      features.push({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [coord.lng, coord.lat] },
        properties: {
          district: z.district,
          location: z.location,
          address: z.address,
          managing_unit: z.unit,
          photo_url: latestPhotos[key] || ''
        }
      });
    });

    var geojson = JSON.stringify({ type: 'FeatureCollection', features: features });
    if (callback) {
      return ContentService
        .createTextOutput(callback + '(' + geojson + ')')
        .setMimeType(ContentService.MimeType.JAVASCRIPT);
    }
    return ContentService.createTextOutput(geojson).setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return jsonpErrorResponse_(err.message, callback);
  }
}
