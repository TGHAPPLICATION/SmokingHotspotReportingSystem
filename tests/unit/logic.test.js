// ============================================================
// 單元測試 — Apps Script 核心邏輯
// 使用 Node.js 內建 assert 模組，無需額外框架
// ============================================================

'use strict';

var assert = require('assert');

// ── 從 Apps Script 抽出的純函式（可在 Node.js 執行）────────

function calcTimeSlot(hour) {
  return Math.floor(hour / 2);
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

function buildGeoJsonFeature(row, colOffset) {
  // colOffset = 0（陣列索引從 0 開始）
  var c = colOffset || 0;
  return {
    type: 'Feature',
    geometry: {
      type: 'Point',
      coordinates: [parseFloat(row[c + 4]), parseFloat(row[c + 3])]  // [lng, lat]
    },
    properties: {
      id: row[c + 0],
      timestamp: row[c + 1],
      time_slot: parseInt(row[c + 2]),
      address_input: row[c + 6],
      description: row[c + 7]
    }
  };
}

function filterFeaturesBySlot(features, slot) {
  if (slot === 'all') return features;
  return features.filter(function(f) {
    return String(f.properties.time_slot) === slot;
  });
}

function isDuplicateInMemory(rows, hash, timeSlot, lat, lng) {
  if (!hash) return false;
  for (var i = 1; i < rows.length; i++) {
    var row = rows[i];
    if (row[8] !== hash) continue;
    if (row[2] !== timeSlot) continue;
    var dist = haversineKm(lat, lng, parseFloat(row[3]), parseFloat(row[4]));
    if (dist < 0.1) return true;
  }
  return false;
}

// ── 測試輔助 ─────────────────────────────────────────────────
var passed = 0;
var failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log('  ✓ ' + name);
    passed++;
  } catch (e) {
    console.error('  ✗ ' + name);
    console.error('    ' + e.message);
    failed++;
  }
}

function suite(name, fn) {
  console.log('\n' + name);
  fn();
}

// ── 測試套件 ─────────────────────────────────────────────────

suite('calcTimeSlot — 時段計算', function() {
  test('UT-01: 0 點 → 時段 0', function() {
    assert.strictEqual(calcTimeSlot(0), 0);
  });
  test('UT-02: 1 點 → 時段 0', function() {
    assert.strictEqual(calcTimeSlot(1), 0);
  });
  test('UT-03: 2 點 → 時段 1（時段邊界）', function() {
    assert.strictEqual(calcTimeSlot(2), 1);
  });
  test('UT-04: 11 點 → 時段 5', function() {
    assert.strictEqual(calcTimeSlot(11), 5);
  });
  test('UT-05: 12 點 → 時段 6', function() {
    assert.strictEqual(calcTimeSlot(12), 6);
  });
  test('UT-06: 23 點 → 時段 11', function() {
    assert.strictEqual(calcTimeSlot(23), 11);
  });
  test('UT-07: 22 點 → 時段 11（最後時段起點）', function() {
    assert.strictEqual(calcTimeSlot(22), 11);
  });
  test('所有 24 個小時皆落在 0–11', function() {
    for (var h = 0; h < 24; h++) {
      var slot = calcTimeSlot(h);
      assert.ok(slot >= 0 && slot <= 11, '小時 ' + h + ' 的時段 ' + slot + ' 超出範圍');
    }
  });
});

suite('validateReport — 資料驗證', function() {
  var validData = { lat: 25.0330, lng: 121.5654, locationSource: 'gps' };

  test('UT-10: 有效台北座標不拋出例外', function() {
    assert.doesNotThrow(function() { validateReport(validData); });
  });
  test('UT-11: lat 為字串 → INVALID_COORDINATES', function() {
    assert.throws(
      function() { validateReport({ lat: '25.0', lng: 121.5, locationSource: 'gps' }); },
      /INVALID_COORDINATES/
    );
  });
  test('UT-12: lat 為 undefined → INVALID_COORDINATES', function() {
    assert.throws(
      function() { validateReport({ lat: undefined, lng: 121.5, locationSource: 'gps' }); },
      /INVALID_COORDINATES/
    );
  });
  test('UT-13: 範圍外座標（25.5）→ OUT_OF_TAIPEI_BOUNDS', function() {
    assert.throws(
      function() { validateReport({ lat: 25.5, lng: 121.5, locationSource: 'gps' }); },
      /OUT_OF_TAIPEI_BOUNDS/
    );
  });
  test('UT-14: locationSource="gps" 有效', function() {
    assert.doesNotThrow(function() {
      validateReport({ lat: 25.03, lng: 121.56, locationSource: 'gps' });
    });
  });
  test('UT-15: locationSource="manual" 有效', function() {
    assert.doesNotThrow(function() {
      validateReport({ lat: 25.03, lng: 121.56, locationSource: 'manual' });
    });
  });
  test('UT-16: locationSource="unknown" → INVALID_LOCATION_SOURCE', function() {
    assert.throws(
      function() { validateReport({ lat: 25.03, lng: 121.56, locationSource: 'unknown' }); },
      /INVALID_LOCATION_SOURCE/
    );
  });
  test('UT-17: locationSource="" → INVALID_LOCATION_SOURCE', function() {
    assert.throws(
      function() { validateReport({ lat: 25.03, lng: 121.56, locationSource: '' }); },
      /INVALID_LOCATION_SOURCE/
    );
  });
});

suite('haversineKm — 距離計算', function() {
  test('UT-20: 同一點距離為 0', function() {
    var d = haversineKm(25.0330, 121.5654, 25.0330, 121.5654);
    assert.ok(d < 0.001, '距離應接近 0，實際：' + d);
  });
  test('UT-21: 台北市政府 → 台北101 約 0.5–1.0 km', function() {
    // 市政府：25.0378, 121.5646 / 台北101：25.0330, 121.5654
    var d = haversineKm(25.0378, 121.5646, 25.0330, 121.5654);
    assert.ok(d > 0.4 && d < 1.2, '距離應約 0.5-1.0km，實際：' + d);
  });
  test('UT-22: 距離計算回傳數值型別', function() {
    var d = haversineKm(25.0, 121.5, 24.0, 121.0);
    assert.strictEqual(typeof d, 'number');
    assert.ok(!isNaN(d));
  });
  test('UT-23: 台北 → 板橋約 5–10 km', function() {
    var d = haversineKm(25.0478, 121.5198, 25.0142, 121.4630);
    assert.ok(d > 4 && d < 11, '板橋距離應約 5-10km，實際：' + d);
  });
});

suite('isDuplicateInMemory — 重複回報偵測', function() {
  var makeRow = function(hash, slot, lat, lng) {
    return ['id', '2026-01-01T00:00:00Z', slot, lat, lng, 'gps', '', '', hash];
  };

  test('UT-30: 空工作表回傳 false', function() {
    var rows = [['header']];
    assert.strictEqual(isDuplicateInMemory(rows, 'abc', 7, 25.03, 121.56), false);
  });
  test('UT-31: 不同 hash，相同位置時段 → false', function() {
    var rows = [['header'], makeRow('hash1', 7, 25.0330, 121.5654)];
    assert.strictEqual(isDuplicateInMemory(rows, 'hash2', 7, 25.0330, 121.5654), false);
  });
  test('UT-32: 相同 hash，不同時段 → false', function() {
    var rows = [['header'], makeRow('hash1', 6, 25.0330, 121.5654)];
    assert.strictEqual(isDuplicateInMemory(rows, 'hash1', 7, 25.0330, 121.5654), false);
  });
  test('UT-33: 相同 hash、時段、距離 < 100m → true', function() {
    var rows = [['header'], makeRow('hash1', 7, 25.0330, 121.5654)];
    // 50m 內的座標（約 0.00045 度緯度）
    assert.strictEqual(isDuplicateInMemory(rows, 'hash1', 7, 25.0334, 121.5654), true);
  });
  test('UT-34: 相同 hash、時段，但距離 > 100m → false', function() {
    var rows = [['header'], makeRow('hash1', 7, 25.0330, 121.5654)];
    // 約 500m 外
    assert.strictEqual(isDuplicateInMemory(rows, 'hash1', 7, 25.0375, 121.5720), false);
  });
  test('UT-35: hash 為空字串 → false', function() {
    var rows = [['header'], makeRow('', 7, 25.0330, 121.5654)];
    assert.strictEqual(isDuplicateInMemory(rows, '', 7, 25.0330, 121.5654), false);
  });
});

suite('filterFeaturesBySlot — GeoJSON 篩選', function() {
  var makeFeature = function(slot) {
    return {
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [121.56, 25.03] },
      properties: { time_slot: slot }
    };
  };

  test('UT-40: slot=all 回傳所有 features', function() {
    var features = [makeFeature(0), makeFeature(4), makeFeature(7)];
    assert.strictEqual(filterFeaturesBySlot(features, 'all').length, 3);
  });
  test('UT-41: slot=4 只回傳 time_slot=4 的 features', function() {
    var features = [makeFeature(0), makeFeature(4), makeFeature(7), makeFeature(4)];
    assert.strictEqual(filterFeaturesBySlot(features, '4').length, 2);
  });
  test('UT-42: slot=99（無資料）回傳空陣列', function() {
    var features = [makeFeature(0), makeFeature(4), makeFeature(7)];
    assert.strictEqual(filterFeaturesBySlot(features, '99').length, 0);
  });
  test('UT-43: 空 features 陣列 → 回傳空陣列', function() {
    assert.strictEqual(filterFeaturesBySlot([], 'all').length, 0);
    assert.strictEqual(filterFeaturesBySlot([], '7').length, 0);
  });
});

suite('buildGeoJsonFeature — GeoJSON 格式化', function() {
  test('UT-44: 座標順序應為 [lng, lat]', function() {
    var row = ['id-1', '2026-01-01T00:00:00Z', 7, 25.0330, 121.5654, 'gps', '台北市', '騎樓下', 'hash'];
    var feature = buildGeoJsonFeature(row);
    assert.strictEqual(feature.geometry.coordinates[0], 121.5654, 'coordinates[0] 應為經度');
    assert.strictEqual(feature.geometry.coordinates[1], 25.0330, 'coordinates[1] 應為緯度');
  });
  test('UT-45: type 應為 Feature', function() {
    var row = ['id-1', '2026-01-01T00:00:00Z', 7, 25.03, 121.56, 'gps', '', '', 'hash'];
    var feature = buildGeoJsonFeature(row);
    assert.strictEqual(feature.type, 'Feature');
    assert.strictEqual(feature.geometry.type, 'Point');
  });
  test('UT-46: properties.time_slot 應為整數', function() {
    var row = ['id-1', '2026-01-01T00:00:00Z', '7', 25.03, 121.56, 'gps', '', '', 'hash'];
    var feature = buildGeoJsonFeature(row);
    assert.strictEqual(typeof feature.properties.time_slot, 'number');
    assert.strictEqual(feature.properties.time_slot, 7);
  });
});

// ── 測試結果摘要 ─────────────────────────────────────────────
console.log('\n' + '─'.repeat(50));
console.log('測試結果：' + passed + ' 通過，' + failed + ' 失敗');
if (failed > 0) {
  process.exit(1);
} else {
  console.log('✅ 全部通過！');
}
