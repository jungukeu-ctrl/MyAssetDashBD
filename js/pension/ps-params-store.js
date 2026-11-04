/**
 * ps-params-store.js — pension-simulation 설정값 영속화 (PS-PARAMS-PERSIST-001)
 *
 * 의존: ps-config.js (PS_DEFAULT_PARAMS), ps-state.js (PensionState), js/config.js (FIREBASE_URL)
 * 저장 형식: { v: 1, updatedAt: ISO, overrides: {PS_DEFAULT_PARAMS 구조의 부분 객체} }
 *   - overrides = 기본값과 달라진 키만 (기본값으로 되돌리면 그 키는 제거)
 *   - 위치: localStorage 'pension-simulation-params' + Firebase asset-data/pensionSimulation/params (PUT)
 *   - 초기화는 삭제가 아니라 tombstone(overrides:{}, 새 updatedAt) — last-write-wins로 기기 간 전파
 *   - Firebase 실패/토큰 없음 → localStorage만 유지, "이 기기에만 저장됨" 표시
 * PS_DEFAULT_PARAMS는 절대 수정하지 않는다.
 */

'use strict';

const PensionParamsStore = (() => {

  const STORAGE_KEY = 'pension-simulation-params';
  const VERSION     = 1;
  const STATUS_ID   = 'ps-params-status';

  let _localOnly = false;

  // ─── 내부: 깊은 비교로 overrides 산출 ────────────────────────────────────

  function _isObj(x) { return x !== null && typeof x === 'object' && !Array.isArray(x); }

  function _same(a, b) {
    if (typeof a === 'number' && typeof b === 'number') return Math.abs(a - b) < 1e-12;
    if (Array.isArray(a) || Array.isArray(b)) return JSON.stringify(a) === JSON.stringify(b);
    return a === b;
  }

  /** cur 중 def와 다른 값만 담은 부분 객체 (없으면 undefined) */
  function _diff(cur, def) {
    const out = {};
    for (const key of Object.keys(cur || {})) {
      const c = cur[key];
      const d = def ? def[key] : undefined;
      if (_isObj(c) && _isObj(d)) {
        const sub = _diff(c, d);
        if (sub) out[key] = sub;
      } else if (!_same(c, d)) {
        out[key] = c;
      }
    }
    return Object.keys(out).length ? out : undefined;
  }

  // ─── 내부: 레코드 검증/입출력 ────────────────────────────────────────────

  /** 유효한 레코드면 { updatedAt, overrides } 반환, 아니면 null (경고만) */
  function _validate(rec, where) {
    if (rec === null || rec === undefined) return null;
    if (!_isObj(rec) || rec.v !== VERSION) {
      console.warn(`[PensionParamsStore] ${where}: 형식/버전 불일치 — 무시`);
      return null;
    }
    const overrides = rec.overrides ?? {};
    if (!_isObj(overrides)) {
      console.warn(`[PensionParamsStore] ${where}: overrides 형식 오류 — 무시`);
      return null;
    }
    return { updatedAt: String(rec.updatedAt || ''), overrides };
  }

  function _readLocal() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      return _validate(JSON.parse(raw), 'localStorage');
    } catch (e) {
      console.warn('[PensionParamsStore] localStorage 파싱 실패 — 무시:', e);
      return null;
    }
  }

  function _writeLocal(rec) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ v: VERSION, updatedAt: rec.updatedAt, overrides: rec.overrides }));
    } catch (e) {
      console.warn('[PensionParamsStore] localStorage 저장 실패:', e);
    }
  }

  function _ts(iso) { const t = Date.parse(iso); return isNaN(t) ? 0 : t; }

  // ─── 내부: Firebase ─────────────────────────────────────────────────────

  function _url(token) {
    return `${FIREBASE_URL}/asset-data/pensionSimulation/params.json?auth=${token}`;
  }

  /** 성공 시 true, 토큰 없음/실패 시 false */
  async function _putRemote(rec) {
    try {
      const token = localStorage.getItem('fb_id_token');
      if (!token) return false;
      const res = await fetch(_url(token), {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ v: VERSION, updatedAt: rec.updatedAt, overrides: rec.overrides })
      });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      return true;
    } catch (e) {
      console.warn('[PensionParamsStore] Firebase 저장 실패 — localStorage만 유지:', e);
      return false;
    }
  }

  function _setLocalOnly(flag) {
    _localOnly = !!flag;
    syncStatus();
  }

  // ─── 공개 ────────────────────────────────────────────────────────────────

  /** "이 기기에만 저장됨" 문구를 현재 상태에 맞춰 표시/숨김 */
  function syncStatus() {
    const el = document.getElementById(STATUS_ID);
    if (el) el.style.display = _localOnly ? '' : 'none';
  }

  /** localStorage overrides를 PensionState에 적용 (동기, 첫 렌더 전) */
  function loadLocal() {
    const rec = _readLocal();
    if (!rec) return null;
    try {
      PensionState.applyOverrides(rec.overrides);
    } catch (e) {
      console.warn('[PensionParamsStore] overrides 적용 실패 — 기본값 유지:', e);
      return null;
    }
    return rec;
  }

  /**
   * Firebase overrides 로드 (last-write-wins)
   * @returns {Promise<boolean>} 원격 값을 적용했으면 true (호출 측이 재계산·재렌더)
   */
  async function loadRemote() {
    const token = localStorage.getItem('fb_id_token');
    if (!token) return false;
    let remote = null;
    try {
      const res = await fetch(_url(token));
      if (!res.ok) return false;
      remote = _validate(await res.json(), 'Firebase');
    } catch (e) {
      console.warn('[PensionParamsStore] Firebase 로드 실패 — 로컬 유지:', e);
      return false;
    }

    const local = _readLocal();
    const remoteT = remote ? _ts(remote.updatedAt) : -1;
    const localT  = local  ? _ts(local.updatedAt)  : -1;

    if (remote && remoteT > localT) {
      PensionState.applyOverrides(remote.overrides);
      _writeLocal(remote);
      return true;
    }
    if (local && localT > remoteT) {
      // 로컬이 더 최신(또는 원격 없음/무효) → 원격에 재PUT
      _setLocalOnly(!(await _putRemote(local)));
    }
    return false;
  }

  /**
   * 현재 PensionState 파라미터와 기본값을 비교해 overrides 재계산 후 저장
   * @param {object} [patch]  (참고용, 미사용 — 항상 전체 재계산)
   */
  async function record(patch) {
    const rec = {
      updatedAt: new Date().toISOString(),
      overrides: _diff(PensionState.getParams(), PS_DEFAULT_PARAMS) || {}
    };
    _writeLocal(rec);
    _setLocalOnly(!(await _putRemote(rec)));
    return rec;
  }

  /** 초기화: 메모리를 기본값으로, localStorage·Firebase는 tombstone 기록 */
  async function reset() {
    PensionState.applyOverrides({});
    const rec = { updatedAt: new Date().toISOString(), overrides: {} };
    _writeLocal(rec);
    _setLocalOnly(!(await _putRemote(rec)));
    return rec;
  }

  return { loadLocal, loadRemote, record, reset, syncStatus };

})();
