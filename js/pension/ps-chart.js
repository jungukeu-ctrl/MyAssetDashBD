/**
 * ps-chart.js — pension-simulation 차트 렌더링
 *
 * 의존: Chart.js 4.x (CDN), ps-config.js, ps-state.js
 * 전역 충돌 방지: 인스턴스 변수명 psLineChart / psStackChart / psDiffChart 사용
 * CSS: ps- 접두어, 기존 style.css --변수 재사용
 */

'use strict';

const PensionChart = (() => {

  // ─── 차트 인스턴스 (전역 lineChart 등과 분리) ────────────────────────────
  let psLineChart  = null;
  let psStackChart = null;
  let psDiffChart  = null;

  // ─── 계좌별 색상 (PENSION_SIM.md 명세) ──────────────────────────────────
  const ACCT_COLOR = {
    연금저축: '#1D9E75',
    IRP1:     '#378ADD',
    IRP2:     '#7F77DD',
    VOO:      '#EF9F27',
    해외주식: '#D85A30',
    RIA:      '#D4537E',
    ISA:      '#D4537E'
  };

  // 현재 스택 모드 ('actual' | 'plan')
  let _stackMode = 'actual';

  // ─── 내부: 기간 필터 ─────────────────────────────────────────────────────

  /**
   * result 에서 마지막 years*12 개월 슬라이싱
   * years=0 → 전체
   */
  function _slice(result, years) {
    const total = result.months.length;
    const n = years > 0 ? Math.min(years * 12, total) : total;
    // 2026-01 시작점 고정 — 앞에서 n개월 취득 (끝에서 자르지 않음)
    const start = 0;

    function sliceArr(arr) {
      return arr ? arr.slice(start, n) : [];
    }
    function sliceByAcct(byAccount) {
      const out = {};
      for (const k of Object.keys(byAccount)) out[k] = sliceArr(byAccount[k]);
      return out;
    }

    return {
      months:   result.months.slice(start, n),
      plan:     { total: sliceArr(result.plan.total),     byAccount: sliceByAcct(result.plan.byAccount) },
      forecast: { total: sliceArr(result.forecast.total), byAccount: sliceByAcct(result.forecast.byAccount) },
      actual:   { total: sliceArr(result.actual.total),   byAccount: sliceByAcct(result.actual.byAccount) },
      events:   result.events
    };
  }

  /** null 포함 배열에서 null 이전까지만 반환 (실적선 끊김 방지) */
  function _trimNull(arr) {
    const last = arr.reduce((acc, v, i) => v !== null ? i : acc, -1);
    return last < 0 ? [] : arr.slice(0, last + 1);
  }

  // ─── 내부: destroy 헬퍼 ──────────────────────────────────────────────────

  function _destroy(chart) {
    if (chart) { try { chart.destroy(); } catch (_) {} }
    return null;
  }

  // ─── 내부: 이벤트 수직선 플러그인 ───────────────────────────────────────

  function _eventAnnotations(events, months) {
    if (!events || !months) return {};
    const annotations = {};
    events.forEach((ev, i) => {
      const idx = months.indexOf(ev.ym);
      if (idx < 0) return;
      const colors = { retire: '#ff6b6b', voo: '#EF9F27', transfer: '#4ecdc4', pension: '#b089f0' };
      annotations[`ev${i}`] = {
        type: 'line',
        xMin: idx, xMax: idx,
        borderColor: colors[ev.type] || '#adb2cc',
        borderWidth: 1,
        borderDash: [4, 4],
        label: { content: ev.label, display: true, position: 'start', color: '#eceef5', font: { size: 10 } }
      };
    });
    return annotations;
  }

  // ─── 내부: 공통 Chart.js 옵션 ────────────────────────────────────────────

  function _baseOptions(annotations) {
    return {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { labels: { color: '#adb2cc', boxWidth: 12, font: { size: 11 } } },
        tooltip: {
          backgroundColor: '#12141f',
          titleColor: '#eceef5',
          bodyColor: '#adb2cc',
          borderColor: '#262a3e',
          borderWidth: 1,
          callbacks: {
            label: ctx => {
              const v = ctx.parsed.y;
              if (v === null || v === undefined) return null;
              return ` ${ctx.dataset.label}: ${_fmtWon(v)}`;
            }
          }
        },
        annotation: annotations ? { annotations } : undefined
      },
      scales: {
        x: {
          ticks: { color: '#7880a0', maxTicksLimit: 12, font: { size: 10 } },
          grid:  { color: '#1a1d2c' }
        },
        y: {
          ticks: {
            color: '#7880a0',
            font: { size: 10 },
            callback: v => _fmtWon(v)
          },
          grid: { color: '#1a1d2c' }
        }
      }
    };
  }

  /** 원/만/억 단위 포맷 (config.js fmtWon 미로드 시 자체 구현) */
  function _fmtWon(n) {
    if (typeof fmtWon === 'function') return fmtWon(n);
    if (!n && n !== 0) return '-';
    const abs = Math.abs(n);
    if (abs >= 1e8) return (n / 1e8).toFixed(1) + '억';
    if (abs >= 1e4) return (n / 1e4).toFixed(0) + '만';
    return n.toFixed(0) + '원';
  }

  // ─── 1. 기간 슬라이더 ────────────────────────────────────────────────────

  const PERIOD_STEPS = [1, 2, 3, 5, 8, 10, 15, 20, 30, 48];

  /**
   * @param {function} onChange  onChange(years) — years: number
   */
  function initPeriodSlider(onChange) {
    const slider = document.getElementById('pension-period-slider');
    const label  = document.getElementById('pension-period-label');
    if (!slider) return;

    slider.min   = 0;
    slider.max   = PERIOD_STEPS.length - 1;
    slider.value = 2;  // 기본값: 3년 (index 2)
    if (label) label.textContent = '3년';

    slider.addEventListener('input', () => {
      const years = PERIOD_STEPS[parseInt(slider.value)] ?? 3;
      if (label) label.textContent = years + '년';
      if (onChange) onChange(years);
    });
  }

  // ─── 2. 전체 연금자산 선그래프 ───────────────────────────────────────────

  function renderTotalLine(result, years) {
    const canvas = document.getElementById('pension-line-chart');
    if (!canvas || !result) return;

    psLineChart = _destroy(psLineChart);

    const d = _slice(result, years);
    const labels = d.months;
    const annotations = _eventAnnotations(d.events, labels);

    const datasets = [
      // 실제 실적 (진한 실선, null 구간 제외)
      {
        label: '실적',
        data: _trimNull(d.actual.total).concat(new Array(Math.max(0, labels.length - _trimNull(d.actual.total).length)).fill(null)),
        borderColor: '#eceef5',
        backgroundColor: 'transparent',
        borderWidth: 2.5,
        pointRadius: 0,
        tension: 0.3,
        spanGaps: false
      },
      // 실적 기반 예측 (점선)
      {
        label: '예측',
        data: d.forecast.total,
        borderColor: '#c9a84c',
        backgroundColor: 'transparent',
        borderWidth: 2,
        borderDash: [6, 4],
        pointRadius: 0,
        tension: 0.3,
        spanGaps: true
      },
      // 최초 계획 (흐린 점선)
      {
        label: '계획',
        data: d.plan.total,
        borderColor: 'rgba(173,178,204,0.35)',
        backgroundColor: 'transparent',
        borderWidth: 1.5,
        borderDash: [3, 5],
        pointRadius: 0,
        tension: 0.3,
        spanGaps: true
      }
    ];

    const opts = _baseOptions(annotations);
    opts.plugins.legend.display = true;

    psLineChart = new Chart(canvas, { type: 'line', data: { labels, datasets }, options: opts });
  }

  // ─── 3. 계좌별 누적 스택 영역 차트 ──────────────────────────────────────

  /**
   * @param {string} mode  'actual' | 'plan'
   */
  function renderStackedArea(result, years, mode) {
    const canvas = document.getElementById('pension-stack-chart');
    if (!canvas || !result) return;

    psStackChart = _destroy(psStackChart);
    _stackMode = mode || _stackMode;

    const d = _slice(result, years);
    const labels = d.months;
    const src = _stackMode === 'plan' ? d.plan.byAccount : d.forecast.byAccount;

    const acctOrder = ['연금저축', 'IRP1', 'IRP2', 'VOO', '해외주식', 'RIA', 'ISA'];

    const datasets = acctOrder.map(acct => {
      const isActual = _stackMode === 'actual';
      const color = ACCT_COLOR[acct] || '#adb2cc';
      const data = src[acct] || new Array(labels.length).fill(0);

      return {
        label: acct,
        data,
        backgroundColor: isActual
          ? _hexAlpha(color, 0.8)
          : _hexAlpha(color, 0.35),
        borderColor: isActual ? color : _hexAlpha(color, 0.6),
        borderWidth: isActual ? 0 : 1,
        borderDash: isActual ? [] : [3, 3],
        fill: true,
        tension: 0.3,
        pointRadius: 0,
        spanGaps: true
      };
    });

    const opts = _baseOptions(null);
    opts.scales.y.stacked = true;
    opts.scales.x.stacked = true;

    psStackChart = new Chart(canvas, { type: 'line', data: { labels, datasets }, options: opts });

    // 토글 버튼 상태 업데이트
    _updateStackToggle();
  }

  /** 스택 모드 토글 버튼 active 상태 */
  function _updateStackToggle() {
    const btnActual = document.getElementById('pension-stack-actual');
    const btnPlan   = document.getElementById('pension-stack-plan');
    if (btnActual) btnActual.classList.toggle('ps-tab-active', _stackMode === 'actual');
    if (btnPlan)   btnPlan.classList.toggle('ps-tab-active',   _stackMode === 'plan');
  }

  // ─── 4. 계획 대비 차이 바 차트 ───────────────────────────────────────────

  function renderDiffBar(result, years) {
    const canvas = document.getElementById('pension-diff-chart');
    if (!canvas || !result) return;

    psDiffChart = _destroy(psDiffChart);

    const d = _slice(result, years);
    const labels = d.months;

    // forecast - plan (실적 없는 구간은 null)
    const diffData = d.forecast.total.map((fc, i) => {
      if (fc === null || d.plan.total[i] === null) return null;
      return fc - (d.plan.total[i] || 0);
    });

    const datasets = [{
      label: '계획 대비 차이',
      data: diffData,
      backgroundColor: diffData.map(v => v === null ? 'transparent' : v >= 0 ? '#1D9E75' : '#D85A30'),
      borderRadius: 2,
      barPercentage: 0.8
    }];

    const opts = _baseOptions(null);
    opts.plugins.legend.display = false;
    // y축: 0 기준선 강조
    opts.scales.y.grid = { color: ctx => ctx.tick.value === 0 ? '#adb2cc' : '#1a1d2c' };

    psDiffChart = new Chart(canvas, { type: 'bar', data: { labels, datasets }, options: opts });
  }

  // ─── 5. 전체 업데이트 ────────────────────────────────────────────────────

  function updateAll(result, years) {
    if (!result) return;
    const y = years ?? 3;
    renderTotalLine(result, y);
    renderStackedArea(result, y, _stackMode);
    renderDiffBar(result, y);
  }

  // ─── 내부: 색상 헬퍼 ─────────────────────────────────────────────────────

  /** hex 색상 + 알파 → rgba 문자열 */
  function _hexAlpha(hex, alpha) {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `rgba(${r},${g},${b},${alpha})`;
  }

  // ─── 스택 토글 이벤트 바인딩 (pension-simulation.html 에서 호출) ─────────

  function bindStackToggle(result, getYears) {
    const btnActual = document.getElementById('pension-stack-actual');
    const btnPlan   = document.getElementById('pension-stack-plan');
    if (btnActual) {
      btnActual.addEventListener('click', () => {
        renderStackedArea(result || PensionState.result, getYears ? getYears() : 3, 'actual');
      });
    }
    if (btnPlan) {
      btnPlan.addEventListener('click', () => {
        renderStackedArea(result || PensionState.result, getYears ? getYears() : 3, 'plan');
      });
    }
  }

  // ─── 공개 API ────────────────────────────────────────────────────────────

  return {
    initPeriodSlider,
    renderTotalLine,
    renderStackedArea,
    renderDiffBar,
    updateAll,
    bindStackToggle,
    PERIOD_STEPS
  };

})();
