/**
 * ps-init.js — pension-simulation 초기화 & 조립
 *
 * 의존 (로드 순서):
 *   js/config.js, js/firebase.js (기존)
 *   ps-config.js → ps-engine.js → ps-firebase.js → ps-state.js
 *   → ps-chart.js → ps-settings.js → ps-init.js  (마지막)
 *
 * 전략: loadLocal()로 즉시 렌더 → load()로 Firebase 갱신
 */

'use strict';

(function () {

  // ─── DOM 헬퍼 ────────────────────────────────────────────────────────────

  function _show(id)  { const el = document.getElementById(id); if (el) el.style.display = ''; }
  function _hide(id)  { const el = document.getElementById(id); if (el) el.style.display = 'none'; }
  function _text(id, msg) { const el = document.getElementById(id); if (el) el.textContent = msg; }

  // ─── 리스너 등록 (차트·설정 패널) ────────────────────────────────────────

  function _bindListeners() {
    PensionState.subscribe((result, params) => {
      if (typeof PensionChart !== 'undefined' && result) {
        const years = _getCurrentYears();
        PensionChart.updateAll(result, years);
      }
      if (typeof PensionSettings !== 'undefined') {
        PensionSettings.syncFromState();
      }
    });
  }

  // ─── 현재 슬라이더 연도 읽기 ─────────────────────────────────────────────

  function _getCurrentYears() {
    const slider = document.getElementById('pension-period-slider');
    if (!slider) return 3;
    const steps = [1, 2, 3, 5, 8, 10, 15, 20];
    return steps[parseInt(slider.value)] ?? 3;
  }

  // ─── 설정 패널 초기화 ─────────────────────────────────────────────────────

  function _initSettings() {
    if (typeof PensionSettings === 'undefined') return;
    try {
      PensionSettings.render();
      PensionSettings.bind();
    } catch (e) {
      console.warn('[ps-init] PensionSettings 초기화 실패:', e);
    }
  }

  // ─── 차트 초기 렌더 ──────────────────────────────────────────────────────

  function _renderCharts(result) {
    if (typeof PensionChart === 'undefined' || !result) return;
    try {
      PensionChart.initPeriodSlider((years) => {
        PensionChart.updateAll(PensionState.result, years);
      });
      PensionChart.updateAll(result, 3);
    } catch (e) {
      console.warn('[ps-init] PensionChart 초기화 실패:', e);
    }
  }

  // ─── 에러 표시 ───────────────────────────────────────────────────────────

  function _showError(msg) {
    _hide('pension-loading');
    _show('pension-error');
    _text('pension-error-msg', msg || '데이터를 불러오는 중 오류가 발생했습니다.');
  }

  // ─── 메인 초기화 ─────────────────────────────────────────────────────────

  async function _init() {
    try {
      _show('pension-loading');
      _hide('pension-error');

      // 1. 설정 패널 렌더 (데이터 독립적으로 먼저 표시)
      _initSettings();

      // 2. localStorage 즉시 로드 → 빠른 초기 렌더
      const localData = PensionFirebase.loadLocal();
      PensionState.setActual(localData);   // → _run() → _notify() (차트는 아직 없음)

      // 3. 차트 초기화 (state.result 준비된 후)
      _renderCharts(PensionState.result);

      _hide('pension-loading');

      // 4. Firebase 비동기 갱신 (백그라운드)
      PensionFirebase.load().then((freshData) => {
        // combined 월 수가 local보다 많으면 갱신
        const localMonths  = Object.keys(localData.monthlyActual  || {}).length;
        const freshMonths  = Object.keys(freshData.monthlyActual  || {}).length;
        if (freshMonths > localMonths) {
          PensionState.setActual(freshData);  // → 리스너로 차트 자동 갱신
        }
      }).catch(() => { /* Firebase 실패는 무시 — local 데이터로 유지 */ });

    } catch (e) {
      console.error('[ps-init] 초기화 오류:', e);
      _showError('초기화 중 오류가 발생했습니다: ' + e.message);
    }
  }

  // ─── 진입점 ──────────────────────────────────────────────────────────────

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', _init);
  } else {
    _init();
  }

})();
