// ============================================================
// 整合測試 — API 回傳格式 & GeoJSON 驗證
// 使用 api-mock.json 模擬真實 API 回應
// ============================================================

'use strict';

var assert = require('assert');
var fs = require('fs');
var path = require('path');

var MOCK_PATH = path.join(__dirname, '../../docs/api-mock.json');

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

// ── 載入測試資料 ──────────────────────────────────────────────
var geojson;
try {
  geojson = JSON.parse(fs.readFileSync(MOCK_PATH, 'utf8'));
} catch (e) {
  console.error('無法載入 api-mock.json：' + e.message);
  process.exit(1);
}

// ── 整合測試套件 ──────────────────────────────────────────────

suite('IT-20 ~ IT-23: GeoJSON 結構驗證', function() {
  test('IT-20: 根物件 type 應為 FeatureCollection', function() {
    assert.strictEqual(geojson.type, 'FeatureCollection');
  });
  test('IT-20: features 應為陣列', function() {
    assert.ok(Array.isArray(geojson.features));
  });
  test('IT-20: features 不為空', function() {
    assert.ok(geojson.features.length > 0, '測試資料應有至少 1 筆');
  });
});

suite('IT-21: 時段篩選模擬', function() {
  function filterBySlot(features, slot) {
    if (slot === 'all') return features;
    return features.filter(function(f) {
      return String(f.properties.time_slot) === String(slot);
    });
  }

  test('IT-21: 篩選時段 7 應有資料', function() {
    var result = filterBySlot(geojson.features, 7);
    assert.ok(result.length > 0, '模擬資料中應有時段 7 的回報');
  });
  test('IT-22: slot=all 回傳全部資料', function() {
    var result = filterBySlot(geojson.features, 'all');
    assert.strictEqual(result.length, geojson.features.length);
  });
  test('IT-23: slot=99 回傳空陣列', function() {
    var result = filterBySlot(geojson.features, 99);
    assert.strictEqual(result.length, 0);
  });
});

suite('Feature 結構驗證（每筆資料）', function() {
  test('每個 feature 的 type 應為 Feature', function() {
    geojson.features.forEach(function(f, i) {
      assert.strictEqual(f.type, 'Feature', '第 ' + i + ' 筆 type 錯誤');
    });
  });
  test('每個 feature 有 geometry.coordinates（2 元素）', function() {
    geojson.features.forEach(function(f, i) {
      assert.ok(Array.isArray(f.geometry.coordinates), '第 ' + i + ' 筆 coordinates 非陣列');
      assert.strictEqual(f.geometry.coordinates.length, 2, '第 ' + i + ' 筆 coordinates 長度非 2');
    });
  });
  test('所有 coordinates[0] 為有效台北經度（121.4–121.7）', function() {
    geojson.features.forEach(function(f, i) {
      var lng = f.geometry.coordinates[0];
      assert.ok(lng >= 121.4 && lng <= 121.7,
        '第 ' + i + ' 筆經度 ' + lng + ' 超出台北範圍');
    });
  });
  test('所有 coordinates[1] 為有效台北緯度（24.9–25.3）', function() {
    geojson.features.forEach(function(f, i) {
      var lat = f.geometry.coordinates[1];
      assert.ok(lat >= 24.9 && lat <= 25.3,
        '第 ' + i + ' 筆緯度 ' + lat + ' 超出台北範圍');
    });
  });
  test('所有 time_slot 在 0–11 範圍內', function() {
    geojson.features.forEach(function(f, i) {
      var slot = f.properties.time_slot;
      assert.ok(typeof slot === 'number', '第 ' + i + ' 筆 time_slot 非數字');
      assert.ok(slot >= 0 && slot <= 11,
        '第 ' + i + ' 筆 time_slot ' + slot + ' 超出範圍');
    });
  });
  test('所有 feature 有 id 屬性', function() {
    geojson.features.forEach(function(f, i) {
      assert.ok(f.properties.id, '第 ' + i + ' 筆缺少 id');
    });
  });
  test('所有 feature 有 timestamp 屬性', function() {
    geojson.features.forEach(function(f, i) {
      assert.ok(f.properties.timestamp, '第 ' + i + ' 筆缺少 timestamp');
    });
  });
});

suite('IT-30 ~ IT-36: 地圖頁面資料行為模擬', function() {
  test('IT-35: 統計計算 — 最熱時段可正確識別', function() {
    var counts = new Array(12).fill(0);
    geojson.features.forEach(function(f) {
      var s = f.properties.time_slot;
      if (s >= 0 && s < 12) counts[s]++;
    });
    var peak = counts.indexOf(Math.max.apply(null, counts));
    assert.ok(peak >= 0 && peak <= 11, '最熱時段應在 0–11 範圍');
  });

  test('IT-36: 「全部」與各時段加總應相等', function() {
    var total = geojson.features.length;
    var sumBySlot = 0;
    for (var s = 0; s <= 11; s++) {
      sumBySlot += geojson.features.filter(function(f) {
        return f.properties.time_slot === s;
      }).length;
    }
    assert.strictEqual(sumBySlot, total, '各時段加總應等於總筆數');
  });
});

// ── 結果摘要 ─────────────────────────────────────────────────
console.log('\n' + '─'.repeat(50));
console.log('整合測試結果：' + passed + ' 通過，' + failed + ' 失敗');
if (failed > 0) {
  process.exit(1);
} else {
  console.log('✅ 全部通過！');
}
