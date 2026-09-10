// ============================================================
// 吸菸區巡查 — 稽查人員巡檢指定吸菸區專用表單後端
// ============================================================
// 讀取「指定吸菸區設定」分頁（G:行政區、H:地點、J:管理單位）提供
// 表單下拉選單，巡查結果固定寫入「吸菸區巡查」分頁。與 Inspection.gs
// 的「環保局菸蒂回報」是兩張獨立分頁，互不影響；照片上傳共用
// Inspection.gs 的 uploadInspectionPhoto（同一個 Drive 資料夾）。

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
