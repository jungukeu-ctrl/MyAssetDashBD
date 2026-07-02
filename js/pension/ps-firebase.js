/**
 * ps-firebase.js — pension-simulation Firebase 데이터 로드 어댑터
 *
 * 의존: js/config.js (FIREBASE_URL, AI_IDX)
 * kiData, state 절대 수정 금지. pension-simulation 전용 납입 실적만 별도 저장.
 *
 * 로드 전략:
 *   1. localStorage 'kiwoom-data' + 'asset-dashboard-v3' 즉시 파싱 (동기)
 *   2. Firebase 토큰('fb_id_token')이 있으면 최신 데이터 병렬 fetch
 *   3. 두 소스 중 combined 배열 더 긴 쪽 우선 사용
 */

'use strict';

const PensionFirebase = (() => {

  const CONTRIBUTION_STORAGE_KEY = 'pension-simulation-contributions';

  // ─── 내부: localStorage 파싱 ─────────────────────────────────────────────

  function _readLocal() {
    try {
      const raw = localStorage.getItem('kiwoom-data');
      return raw ? JSON.parse(raw) : null;
    } catch (e) {
      return null;
    }
  }

  function _readContributions() {
    try {
      const raw = localStorage.getItem(CONTRIBUTION_STORAGE_KEY);
      return raw ? JSON.parse(raw) : {};
    } catch (e) {
      return {};
    }
  }

  function _writeContributions(contributions) {
    localStorage.setItem(CONTRIBUTION_STORAGE_KEY, JSON.stringify(contributions || {}));
  }

  // ─── 내부: Firebase fetch ─────────────────────────────────────────────────

  async function _fetchFirebase() {
    try {
      const token = localStorage.getItem('fb_id_token');
      if (!token) return null;

      const url = `${FIREBASE_URL}/asset-data.json?auth=${token}`;
      const res = await fetch(url);
      if (!res.ok) return null;

      const data = await res.json();
      return data;
    } catch (e) {
      return null;
    }
  }

  // ─── 내부: combined 배열 → actualData 변환 ───────────────────────────────
  //
  // eval[] 인덱스는 PS_EVAL_IDX (ps-config.js) 를 단일 진실 공급원으로 사용.
  // config.js AI_IDX 는 한국어 키('개인연금저축','퇴직연금001' 등)를 사용하므로
  // pension 모듈에서 직접 접근하지 않는다.
  //

  /**
   * @param {Array} combined  kiData.combined 배열
   * @returns {{ initialBalances, monthlyActual }}
   */
  function _buildActualData(combined, contributions) {
    const empty = {
      initialBalances: { 연금저축: 0, IRP1: 0, IRP2: 0, 해외주식: 0, VOO: 0, RIA: 0, ISA: 0 },
      monthlyActual: {},
      contributions: contributions || {}
    };
    if (!combined || !combined.length) return empty;

    const ix = PS_EVAL_IDX;  // { 연금저축:3, IRP1:7, IRP2:8, 해외주식:0, RIA:10, ISA:9 }
    const monthlyActual = {};

    for (const row of combined) {
      const ym = row.month;
      if (!ym) continue;
      const ev = row.eval || [];
      monthlyActual[ym] = {
        연금저축: ev[ix.연금저축] ?? 0,
        IRP1:     ev[ix.IRP1]    ?? 0,
        IRP2:     ev[ix.IRP2]    ?? 0,
        해외주식: ev[ix.해외주식] ?? 0,
        // VOO: Firebase에서 해외주식 계좌 내 VOO 분리 불가 — 엔진이 plan 추적값 사용
        RIA:      ev[ix.RIA]     ?? 0,
        ISA:      ev[ix.ISA]     ?? 0
      };
    }

    // 초기 잔액 = 최신 항목
    const latest = combined[combined.length - 1];
    const ev = latest.eval || [];
    const initialBalances = {
      연금저축: ev[ix.연금저축] ?? 0,
      IRP1:     ev[ix.IRP1]    ?? 0,
      IRP2:     ev[ix.IRP2]    ?? 0,
      해외주식: ev[ix.해외주식] ?? 0,
      VOO:      0,              // Firebase에서 해외주식 계좌 내 VOO 분리 불가 → 엔진이 params에서 계산
      RIA:      ev[ix.RIA]     ?? 0,
      ISA:      ev[ix.ISA]     ?? 0
    };

    return { initialBalances, monthlyActual, contributions: contributions || {} };
  }

  // ─── 공개: load() ────────────────────────────────────────────────────────

  /**
   * Firebase 및 localStorage에서 실데이터 로드
   * @returns {Promise<{initialBalances, monthlyActual}>}
   */
  async function load() {
    // 1. localStorage 즉시 파싱
    const localKiData = _readLocal();
    const localCombined = localKiData?.combined || [];
    const localContributions = _readContributions();

    // 2. Firebase fetch 병렬 시도 (실패해도 무시)
    const firebaseData = await _fetchFirebase();
    const remoteCombined = firebaseData?.kiwoom?.combined || [];
    const remoteContributions = firebaseData?.pensionSimulation?.contributions || {};

    // 3. 더 최신/많은 데이터 선택 (combined 배열 길이 기준)
    const combined = remoteCombined.length >= localCombined.length
      ? remoteCombined
      : localCombined;

    // 4. 변환 및 반환 (PS_EVAL_IDX 사용)
    const contributions = { ...localContributions, ...remoteContributions };
    if (Object.keys(remoteContributions).length) _writeContributions(contributions);
    return _buildActualData(combined, contributions);
  }

  // ─── 공개: loadLocal() ───────────────────────────────────────────────────

  /**
   * localStorage 전용 동기 버전 (Firebase 미요청)
   * ps-init.js 에서 빠른 초기 렌더에 사용 가능
   * @returns {{initialBalances, monthlyActual}}
   */
  function loadLocal() {
    const kiData = _readLocal();
    return _buildActualData(kiData?.combined || [], _readContributions());
  }

  async function saveContribution(ym, contribution) {
    const current = _readContributions();
    const next = {
      ...current,
      [ym]: { ...(current[ym] || {}), ...(contribution || {}) }
    };
    _writeContributions(next);

    try {
      const token = localStorage.getItem('fb_id_token');
      if (token) {
        const url = `${FIREBASE_URL}/asset-data/pensionSimulation/contributions/${ym}.json?auth=${token}`;
        await fetch(url, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(next[ym])
        });
      }
    } catch (e) {
      console.warn('[PensionFirebase] Firebase contribution 저장 실패 — localStorage만 유지:', e);
    }

    return next;
  }

  return { load, loadLocal, saveContribution };

})();
