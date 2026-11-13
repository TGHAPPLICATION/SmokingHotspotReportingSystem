/* ============================================================
 * 吸菸熱點（CSV 匯入）圖層 + 動態篩選報表 —— 獨立模組
 *
 * 資料來源：docs/data/smoking-hotspots.csv（系統匯出檔，直接覆蓋即可更新）
 * 欄位：單位,上傳時間,行政區,座標,專案名稱,場域說明,通報指標,吸菸區,菸蒂估算數量,備註說明
 *
 * 依賴 index.html 既有全域：map、mapLoaded、viewMode、esc()、sheetLayers、addSheetLayer、
 *   createSheetLayerButton、buildSheetSupercluster、setViewMode、updateReportButtonVisibility、Chart
 * 對外只暴露 window.HotspotReport.ready（供 updateReportButtonVisibility 判斷）
 * ============================================================ */
(function () {
  'use strict';

  var CSV_URL = './data/smoking-hotspots.csv';
  var LAYER_COLOR = '#f97316';
  // 菸蒂數量分級（單一色相、淺→深，表示量級）
  var STEPS = [
    { max: 5,        color: '#fdbe85', r: 5,  label: '1–5 支' },
    { max: 15,       color: '#fd8d3c', r: 7,  label: '6–15 支' },
    { max: 30,       color: '#e6550d', r: 9,  label: '16–30 支' },
    { max: Infinity, color: '#a63603', r: 12, label: '31 支以上' }
  ];
  var DISTRICTS = ['中正區','大同區','中山區','松山區','大安區','萬華區','信義區','士林區','北投區','內湖區','南港區','文山區'];

  var state = {
    rows: [],
    from: '', to: '', minDate: '', maxDate: '',
    districts: {} // 空物件 = 全部行政區
  };
  var charts = {};
  var api = window.HotspotReport = { ready: false };

  // ── CSV 解析（支援雙引號欄位，未來匯出若含逗號也不會錯位） ──
  function parseCsv(text) {
    text = text.replace(/^﻿/, '');
    var rows = [], row = [], cell = '', q = false;
    for (var i = 0; i < text.length; i++) {
      var ch = text[i];
      if (q) {
        if (ch === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; }
        else cell += ch;
      } else if (ch === '"') q = true;
      else if (ch === ',') { row.push(cell); cell = ''; }
      else if (ch === '\n' || ch === '\r') {
        if (ch === '\r' && text[i + 1] === '\n') i++;
        row.push(cell); rows.push(row); row = []; cell = '';
      } else cell += ch;
    }
    if (cell || row.length) { row.push(cell); rows.push(row); }
    var head = rows.shift() || [];
    return rows.map(function (r) {
      var o = {}; head.forEach(function (h, k) { o[h.trim()] = (r[k] || '').trim(); }); return o;
    });
  }

  function pad(n) { return String(n).padStart(2, '0'); }
  function ymd(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }

  // 「2026/10/19 06:18」→ Date；「25.05，121.55」（全形或半形逗號）→ [lng, lat]
  function toRecord(r) {
    var t = /^(\d{4})\/(\d{1,2})\/(\d{1,2})\s+(\d{1,2}):(\d{2})/.exec(r['上傳時間'] || '');
    var c = (r['座標'] || '').split(/[，,]/).map(parseFloat);
    if (!t || c.length !== 2 || isNaN(c[0]) || isNaN(c[1])) return null;
    var lat = c[0], lng = c[1];
    if (lat > 100) { var tmp = lat; lat = lng; lng = tmp; } // 容錯：經緯度順序顛倒
    var d = new Date(+t[1], +t[2] - 1, +t[3], +t[4], +t[5]);
    return {
      date: d, day: ymd(d), hour: d.getHours(),
      time: r['上傳時間'], district: r['行政區'] || '未填', unit: r['單位'],
      project: r['專案名稱'] || '未填', place: r['場域說明'], note: r['備註說明'],
      butts: parseInt(r['菸蒂估算數量'], 10) || 0, lng: lng, lat: lat
    };
  }

  function filtered() {
    var ds = Object.keys(state.districts);
    return state.rows.filter(function (r) {
      return (!state.from || r.day >= state.from) && (!state.to || r.day <= state.to) &&
             (!ds.length || state.districts[r.district]);
    });
  }

  // ── 地圖圖層：註冊進 index.html 既有 sheetLayers，沿用分群／熱力／點位、統計與原成效報表 ──
  var layer = {
    name: '吸菸熱點', safeName: 'hs_hotspot', color: LAYER_COLOR,
    sourceId: 'source-hs_hotspot', layerId: 'layer-hs_hotspot',
    clusterSourceId: 'source-cl-hs_hotspot', clusterGlowId: 'layer-cl-glow-hs_hotspot',
    clusterLayerId: 'layer-cl-hs_hotspot',
    sc: null, visible: false, loaded: true, canReport: true,
    local: true, // 靜態 CSV，重新整理時不向 Apps Script 取資料
    legend: STEPS.map(function (s) { return { color: s.color, label: '菸蒂 ' + s.label }; }), // 點位模式圖例
    features: []
  };

  function colorExpr() {
    var e = ['step', ['to-number', ['get', '菸蒂估算數量']], STEPS[0].color];
    for (var i = 1; i < STEPS.length; i++) e.push(STEPS[i - 1].max + 1, STEPS[i].color);
    return e;
  }

  function toFeature(r) {
    return {
      type: 'Feature', geometry: { type: 'Point', coordinates: [r.lng, r.lat] },
      properties: {
        '地點': r.place || r.note || '', '菸蒂估算數量': r.butts, '行政區': r.district,
        '專案名稱': r.project, '單位': r.unit, '備註說明': r.place ? r.note : '', '上傳時間': r.time,
        // 既有報表 / 統計 / 時段配色所需欄位
        timestamp: r.date.toISOString(), time_slot: Math.floor(r.hour / 2)
      }
    };
  }

  // 點位依菸蒂數量分級著色（覆寫既有單色點位）
  function paintLayer() {
    if (map.getLayer(layer.layerId)) map.setPaintProperty(layer.layerId, 'circle-color', colorExpr());
    var lg = document.getElementById('hs-legend');
    // 點位模式由左側面板圖例呈現，浮動圖例只在分群模式（孤立點同樣分級著色）顯示
    if (lg) lg.classList.toggle('hidden', !(layer.visible && viewMode === 'cluster'));
  }

  // 篩選結果套用到地圖：替換 features → 重建分群 → 交由既有 setViewMode 重繪（分群/熱力/點位/統計）
  function refreshMap() {
    layer.features = filtered().map(toFeature);
    var cnt = document.getElementById('layer-count-' + layer.safeName);
    if (cnt) cnt.textContent = ' ' + layer.features.length + ' 處';
    if (!mapLoaded) return;
    addSheetLayer(layer);
    paintLayer();
    if (layer.visible) {
      buildSheetSupercluster(layer);
      setViewMode(viewMode);
    } else {
      layer.sc = null; // 下次開啟時由既有按鈕邏輯依新篩選結果重建
    }
  }

  function registerLayer() {
    sheetLayers.push(layer);
    if (mapLoaded) addSheetLayer(layer);
    createSheetLayerButton(layer); // 既有按鈕邏輯：切換可見、套用 viewMode、更新報表按鈕
    var bar = document.getElementById('header-layers');
    bar.insertBefore(layer._btn, bar.firstChild);
    layer._btn.addEventListener('click', paintLayer); // 在既有 handler 之後執行
    document.querySelectorAll('.view-btn').forEach(function (b) { b.addEventListener('click', paintLayer); });
  }

  function buildLegend() {
    var lg = document.createElement('div');
    lg.className = 'hs-legend hidden'; lg.id = 'hs-legend';
    lg.innerHTML = '<div class="hs-legend-title">🚬 吸菸熱點・菸蒂估算數量</div>' + STEPS.map(function (s) {
      return '<div class="hs-legend-row"><span class="hs-legend-dot" style="background:' + s.color +
             ';width:11px;height:11px"></span>' + s.label + '</div>';
    }).join('') + '<div class="hs-legend-note">日期／行政區篩選於 📊 成效報表設定</div>';
    document.getElementById('map').appendChild(lg);
  }

  // ── 報表面板：分頁切換 ──────────────────────────────────
  var panel, paneA, paneB, emptyA, tabs = {};

  function legacyReportAvailable() {
    var active = (window.sheetLayers || []).filter(function (l) { return l.visible; });
    return active.length > 0 && active.every(function (l) { return l.loaded && l.canReport; });
  }

  function buildTabs() {
    panel = document.getElementById('report-panel');
    paneA = panel.querySelector('.report-body');
    paneA.classList.add('hs-pane');

    emptyA = document.createElement('div');
    emptyA.className = 'hs-empty';
    emptyA.innerHTML = '尚未開啟具時間資料的圖層<br>請先點選上方圖層按鈕，即可檢視原成效報表';
    paneA.insertBefore(emptyA, paneA.firstChild);

    var bar = document.createElement('div');
    bar.className = 'hs-tabs';
    [['legacy', '📈 圖層成效'], ['hotspot', '🚬 吸菸熱點分析']].forEach(function (t) {
      var b = document.createElement('button');
      b.className = 'hs-tab'; b.textContent = t[1];
      b.addEventListener('click', function () { switchTab(t[0]); });
      tabs[t[0]] = b; bar.appendChild(b);
    });
    panel.insertBefore(bar, paneA);

    paneB = document.createElement('div');
    paneB.className = 'report-body hs-pane hidden';
    paneB.innerHTML = paneBTemplate();
    panel.appendChild(paneB);
    bindFilters();
  }

  function switchTab(name) {
    var hot = name === 'hotspot';
    tabs.legacy.classList.toggle('active', !hot);
    tabs.hotspot.classList.toggle('active', hot);
    paneA.classList.toggle('hidden', hot);
    paneB.classList.toggle('hidden', !hot);
    panel.classList.toggle('hs-wide', hot);
    if (hot) renderReport();
    else {
      var ok = legacyReportAvailable();
      emptyA.style.display = ok ? 'none' : '';
      if (ok && getSelectedSheetFeatures().length) renderReportCharts(); // 篩選可能已改變熱點資料
    }
  }

  function section(title, body) {
    return '<div class="report-section"><div class="report-section-title">' + title + '</div>' + body + '</div>';
  }

  function paneBTemplate() {
    return '<div class="hs-filter">' +
        '<div class="hs-filter-row"><span class="hs-filter-label">日期</span>' +
          '<input type="date" class="hs-date" id="hs-from"><span class="hs-sep">～</span>' +
          '<input type="date" class="hs-date" id="hs-to"></div>' +
        '<div class="hs-filter-row"><span class="hs-filter-label">快選</span><div class="hs-quick" id="hs-quick">' +
          '<button class="hs-chip" data-days="7">近 7 天</button><button class="hs-chip" data-days="14">近 14 天</button>' +
          '<button class="hs-chip" data-days="30">近 30 天</button><button class="hs-chip" data-days="0">全部</button></div></div>' +
        '<div class="hs-filter-row" style="align-items:flex-start"><span class="hs-filter-label" style="padding-top:4px">行政區</span>' +
          '<div class="hs-districts" id="hs-districts"></div></div>' +
        '<div class="hs-filter-foot"><span id="hs-summary"></span><button class="hs-reset" id="hs-reset">↺ 重設篩選</button></div>' +
      '</div>' +
      section('整體指標', '<div class="hs-kpis" id="hs-kpis"></div>') +
      section('每日通報筆數', '<div class="chart-wrap"><div class="hs-chart"><canvas id="hs-chart-daily"></canvas></div></div>') +
      section('行政區菸蒂估算數量', '<div class="chart-wrap"><div class="hs-chart tall"><canvas id="hs-chart-district"></canvas></div></div>') +
      section('通報時段分布（小時）', '<div class="chart-wrap"><div class="hs-chart"><canvas id="hs-chart-hour"></canvas></div></div>') +
      section('熱點地點 Top 10（點選可定位）', '<div class="chart-wrap" style="padding:6px 8px"><table class="hs-table">' +
        '<thead><tr><th>#</th><th>地點</th><th class="num">次數</th><th class="num">菸蒂</th></tr></thead>' +
        '<tbody id="hs-top"></tbody></table></div>');
  }

  function setRange(days) {
    state.to = state.maxDate;
    if (!days) state.from = state.minDate;
    else {
      var d = new Date(state.maxDate + 'T00:00:00'); d.setDate(d.getDate() - days + 1);
      state.from = ymd(d) < state.minDate ? state.minDate : ymd(d);
    }
  }

  function bindFilters() {
    var from = document.getElementById('hs-from'), to = document.getElementById('hs-to');
    from.addEventListener('change', function () { state.from = from.value || state.minDate; apply(); });
    to.addEventListener('change', function () { state.to = to.value || state.maxDate; apply(); });
    document.getElementById('hs-quick').addEventListener('click', function (e) {
      var b = e.target.closest('.hs-chip'); if (!b) return;
      setRange(+b.dataset.days); apply();
    });
    document.getElementById('hs-reset').addEventListener('click', function () {
      setRange(0); state.districts = {}; apply();
    });
    document.getElementById('hs-districts').addEventListener('click', function (e) {
      var b = e.target.closest('.hs-chip'); if (!b) return;
      var d = b.dataset.d;
      if (d === '*') state.districts = {};
      else if (state.districts[d]) delete state.districts[d];
      else state.districts[d] = true;
      apply();
    });
  }

  function apply() { refreshMap(); renderReport(); }

  function syncFilterUi(rows) {
    var from = document.getElementById('hs-from'), to = document.getElementById('hs-to');
    [from, to].forEach(function (el) { el.min = state.minDate; el.max = state.maxDate; });
    from.value = state.from; to.value = state.to;
    // 依日期範圍統計各行政區筆數，顯示在晶片上
    var cnt = {};
    state.rows.forEach(function (r) {
      if ((!state.from || r.day >= state.from) && (!state.to || r.day <= state.to)) cnt[r.district] = (cnt[r.district] || 0) + 1;
    });
    var none = !Object.keys(state.districts).length;
    document.getElementById('hs-districts').innerHTML =
      '<button class="hs-chip' + (none ? ' active' : '') + '" data-d="*">全部</button>' +
      DISTRICTS.map(function (d) {
        return '<button class="hs-chip' + (state.districts[d] ? ' active' : '') + '" data-d="' + d + '">' +
               d.replace('區', '') + ' <span style="opacity:.6">' + (cnt[d] || 0) + '</span></button>';
      }).join('');
    var ds = Object.keys(state.districts);
    document.getElementById('hs-summary').textContent =
      state.from + ' ～ ' + state.to + '｜' + (ds.length ? ds.length + ' 個行政區' : '全市') + '｜' + rows.length + ' 筆（地圖同步）';
    var days = Math.round((new Date(state.to) - new Date(state.from)) / 864e5) + 1;
    document.querySelectorAll('#hs-quick .hs-chip').forEach(function (b) {
      var n = +b.dataset.days;
      b.classList.toggle('active', state.to === state.maxDate &&
        (n ? days === n : state.from === state.minDate));
    });
  }

  function kpi(value, unit, desc) {
    return '<div class="hs-kpi"><div class="hs-kpi-value">' + value + '<span class="hs-kpi-unit">' + unit +
           '</span></div><div class="hs-kpi-desc">' + desc + '</div></div>';
  }

  var AXIS = { ticks: { color: '#6e7681', font: { size: 10 } }, grid: { color: '#21262d' } };
  var TOOLTIP = { backgroundColor: 'rgba(22,27,34,.96)', borderColor: '#30363d', borderWidth: 1, padding: 8 };

  function drawChart(id, cfg) {
    if (charts[id]) charts[id].destroy();
    cfg.options = Object.assign({ responsive: true, maintainAspectRatio: false, animation: { duration: 300 } }, cfg.options);
    charts[id] = new Chart(document.getElementById(id), cfg);
  }

  function renderReport() {
    if (!paneB || paneB.classList.contains('hidden') || !api.ready) return;
    var rows = filtered();
    syncFilterUi(rows);

    var butts = rows.reduce(function (s, r) { return s + r.butts; }, 0);
    var dCnt = {}, dButts = {}, dayCnt = {}, hour = new Array(24).fill(0), loc = {};
    rows.forEach(function (r) {
      dCnt[r.district] = (dCnt[r.district] || 0) + 1;
      dButts[r.district] = (dButts[r.district] || 0) + r.butts;
      dayCnt[r.day] = (dayCnt[r.day] || 0) + 1;
      hour[r.hour]++;
      var key = r.place || r.note || (r.lat.toFixed(4) + ',' + r.lng.toFixed(4));
      var k = r.district + '|' + key;
      if (!loc[k]) loc[k] = { name: key, district: r.district, n: 0, butts: 0, lng: r.lng, lat: r.lat };
      loc[k].n++; loc[k].butts += r.butts;
    });
    var days = Math.max(1, Math.round((new Date(state.to) - new Date(state.from)) / 864e5) + 1);
    var topD = Object.keys(dButts).sort(function (a, b) { return dButts[b] - dButts[a]; })[0];

    document.getElementById('hs-kpis').innerHTML =
      kpi(rows.length.toLocaleString(), '筆', '通報筆數') +
      kpi(butts.toLocaleString(), '支', '菸蒂估算總數') +
      kpi(rows.length ? (butts / rows.length).toFixed(1) : '—', '支/筆', '平均每筆菸蒂數') +
      kpi((rows.length / days).toFixed(1), '筆/日', '日均通報量') +
      kpi(topD ? topD : '—', '', '菸蒂最多行政區') +
      kpi(Object.keys(dCnt).length, '區', '涵蓋行政區');

    // 每日趨勢（補齊無資料的日期為 0）
    var labels = [], vals = [];
    for (var d = new Date(state.from + 'T00:00:00'); ymd(d) <= state.to; d.setDate(d.getDate() + 1)) {
      labels.push(ymd(d).slice(5).replace('-', '/')); vals.push(dayCnt[ymd(d)] || 0);
    }
    drawChart('hs-chart-daily', {
      type: 'line',
      data: { labels: labels, datasets: [{ data: vals, borderColor: LAYER_COLOR, backgroundColor: 'rgba(249,115,22,.12)',
        fill: true, tension: 0.3, borderWidth: 2, pointRadius: 3, pointHoverRadius: 6, pointBackgroundColor: LAYER_COLOR }] },
      options: { interaction: { mode: 'index', intersect: false },
        plugins: { legend: { display: false }, tooltip: Object.assign({ callbacks: { label: function (c) { return ' ' + c.parsed.y + ' 筆'; } } }, TOOLTIP) },
        scales: { x: AXIS, y: Object.assign({ beginAtZero: true }, AXIS) } }
    });

    var dl = Object.keys(dButts).sort(function (a, b) { return dButts[b] - dButts[a]; });
    drawChart('hs-chart-district', {
      type: 'bar',
      data: { labels: dl, datasets: [{ data: dl.map(function (k) { return dButts[k]; }),
        backgroundColor: dl.map(function (k, i) { return i < 3 ? '#e6550d' : '#fd8d3c99'; }), borderRadius: 4, barThickness: 14 }] },
      options: { indexAxis: 'y',
        plugins: { legend: { display: false }, tooltip: Object.assign({ callbacks: { label: function (c) {
          var k = c.label; return ' 菸蒂 ' + dButts[k] + ' 支｜通報 ' + dCnt[k] + ' 筆'; } } }, TOOLTIP) },
        scales: { x: Object.assign({ beginAtZero: true }, AXIS), y: { ticks: { color: '#c9d1d9', font: { size: 11 } }, grid: { display: false } } } }
    });

    drawChart('hs-chart-hour', {
      type: 'bar',
      data: { labels: hour.map(function (_, h) { return pad(h); }), datasets: [{ data: hour, backgroundColor: '#fd8d3ccc', borderRadius: 3 }] },
      options: { plugins: { legend: { display: false }, tooltip: Object.assign({ callbacks: {
          title: function (c) { return c[0].label + ':00–' + c[0].label + ':59'; }, label: function (c) { return ' ' + c.parsed.y + ' 筆'; } } }, TOOLTIP) },
        scales: { x: AXIS, y: Object.assign({ beginAtZero: true }, AXIS) } }
    });

    var top = Object.keys(loc).map(function (k) { return loc[k]; })
      .sort(function (a, b) { return b.butts - a.butts || b.n - a.n; }).slice(0, 10);
    var tbody = document.getElementById('hs-top');
    tbody.innerHTML = top.length ? top.map(function (t, i) {
      return '<tr data-i="' + i + '"><td><span class="hs-rank' + (i < 3 ? ' top' : '') + '">' + (i + 1) + '</span></td>' +
        '<td>' + esc(t.name) + '<div class="hs-sub">' + esc(t.district) + '</div></td>' +
        '<td class="num">' + t.n + '</td><td class="num">' + t.butts.toLocaleString() + '</td></tr>';
    }).join('') : '<tr><td colspan="4" class="hs-sub" style="text-align:center;padding:16px">無符合條件的資料</td></tr>';
    tbody.onclick = function (e) {
      var tr = e.target.closest('tr[data-i]'); if (!tr) return;
      var t = top[+tr.dataset.i];
      if (!layer.visible) layer._btn.click();
      map.flyTo({ center: [t.lng, t.lat], zoom: 17, duration: 1000 });
    };
  }

  // ── 啟動 ──────────────────────────────────────────────
  buildLegend();
  buildTabs();

  document.getElementById('analytics-btn').addEventListener('click', function () {
    switchTab(legacyReportAvailable() ? 'legacy' : 'hotspot');
  });

  fetch(CSV_URL, { cache: 'no-cache' })
    .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.text(); })
    .then(function (text) {
      state.rows = parseCsv(text).map(toRecord).filter(Boolean);
      if (!state.rows.length) throw new Error('CSV 無有效資料');
      var days = state.rows.map(function (r) { return r.day; }).sort();
      state.minDate = days[0]; state.maxDate = days[days.length - 1];
      setRange(0);
      api.ready = true;
      registerLayer();
      refreshMap();
      if (!mapLoaded) map.once('load', refreshMap);
      updateReportButtonVisibility();
    })
    .catch(function (e) { console.warn('[hotspot] CSV 載入失敗', e); });
})();
