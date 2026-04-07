/**
 * ps-state.js — pension-simulation 앱 상태 관리
 *
 * 의존: ps-config.js (PS_DEFAULT_PARAMS), ps-engine.js (PensionEngine)
 * 전역 state / kiData 접근 금지 — 순수 pension 모듈 내부 상태만 관리
 */

'use strict';

const PensionState = (() => {

  // ─── 내부 상태 ────────────────────────────────────────────────────────────

  // DEFAULT_PARAMS 깊은 복사 (원본 불변 유지)
  let _params = JSON.parse(JSON.stringify(PS_DEFAULT_PARAMS));
  let _actual  = {};
  let _result  = null;
  let _listeners = [];

  // ─── 내부: 계산 실행 ──────────────────────────────────────────────────────

  function _run() {
    try {
      _result = PensionEngine.run(_params, _actual);
    } catch (e) {
      console.error('[PensionState] 계산 오류:', e);
      _result = null;
    }
  }

  // ─── 내부: 리스너 알림 ───────────────────────────────────────────────────

  function _notify() {
    for (const fn of _listeners) {
      try { fn(_result, _params); } catch (e) { console.error('[PensionState] listener 오류:', e); }
    }
  }

  // ─── 공개 API ────────────────────────────────────────────────────────────

  /**
   * 파라미터 일부 갱신 → 재계산 → 리스너 알림
   * @param {object} patch  PS_DEFAULT_PARAMS 일부 (깊은 병합)
   */
  function update(patch) {
    _deepMerge(_params, patch);
    _run();
    _notify();
  }

  /**
   * Firebase 실데이터 주입 → 재계산 → 리스너 알림
   * @param {object} data  PensionFirebase.load() 반환값
   */
  function setActual(data) {
    _actual = data || {};
    _run();
    _notify();
  }

  /**
   * 렌더 함수 등록 (차트·설정 패널에서 호출)
   * @param {function} fn  fn(result, params) 형태
   * @returns {function}   구독 취소 함수
   */
  function subscribe(fn) {
    _listeners.push(fn);
    return () => { _listeners = _listeners.filter(l => l !== fn); };
  }

  /**
   * 현재 params를 UI에 동기화할 때 사용 (읽기 전용 복사본 반환)
   */
  function getParams() {
    return JSON.parse(JSON.stringify(_params));
  }

  // ─── 내부: 깊은 병합 ─────────────────────────────────────────────────────

  function _deepMerge(target, source) {
    if (!source || typeof source !== 'object') return;
    for (const key of Object.keys(source)) {
      if (source[key] !== null && typeof source[key] === 'object' && !Array.isArray(source[key])) {
        if (!target[key] || typeof target[key] !== 'object') target[key] = {};
        _deepMerge(target[key], source[key]);
      } else {
        target[key] = source[key];
      }
    }
  }

  // ─── 공개 프로퍼티 (읽기 전용 접근) ─────────────────────────────────────

  return {
    get params() { return _params; },
    get actual()  { return _actual; },
    get result()  { return _result; },
    update,
    setActual,
    subscribe,
    getParams
  };

})();
