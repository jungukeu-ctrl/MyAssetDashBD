
/* ================================================================
   연금저축/IRP1 월별 납입 실적 실측값 재백필 (2026-01~06)
   생성일: 2026-07-03

   배경:
   직전 레거시 마이그레이션(pension-legacy-contribution-migration-console.js)이
   pension-tracker/records의 자동계산 값(c_pension/c_irp)을 참조했으나,
   전략 세션에서 사용자 삼성증권 실제 거래내역("이체입금")과 직접 대조한 결과
   해당 자동계산 값이 부정확함이 확인됨(레거시 자동계산 로직이 실제 입금을
   일부 놓치고 있었던 것으로 추정, 원인 불명 — 이번엔 실측값으로 덮어씀).

   확정값 근거:
   - 삼성증권 연금저축 CMA(7074390889-15) 이체입금
     01-09(12만)+01-16(12만)+01-23(50만) = 1월 74만
     02-20(4만)+02-27(12만) = 2월 16만
     03-06(12만)+03-13(36만)+03-20(30만)+03-27(25만) = 3월 103만
     4~6월 이체입금 없음
   - 삼성증권 IRP1(다이렉트IRP, 7131546334-29)
     03-20 "mPop입금" 57,000원 1건뿐 (나머지는 전부 현금배당 — 납입 아님, 제외)
   - IRP2는 변경 없음(기존 값 유지, 이 스크립트가 건드리지 않음)

   사용법:
   1. MyAssetDashBD 대시보드(또는 pension-simulation.html)에 로그인한
      상태에서 실행 (fb_id_token/fb_refresh_token이 localStorage에 있어야 함)
   2. 브라우저 콘솔에 이 파일 내용 전체를 붙여넣기
   3. 자동 실행됨 — 각 월의 기존 contributions[ym]을 먼저 조회한 뒤
      연금저축/IRP1 필드만 병합 저장 (riaExternalPurchase 등 다른 필드는 보존)
   ================================================================ */

(async function () {

  // ── 확정값 (원 단위) ──────────────────────────────────────────
  const ACTUAL_CONTRIBUTIONS = {
    '2026-01': { 연금저축: 740000,   IRP1: 0 },
    '2026-02': { 연금저축: 160000,   IRP1: 0 },
    '2026-03': { 연금저축: 1030000,  IRP1: 57000 },
    '2026-04': { 연금저축: 0,        IRP1: 0 },
    '2026-05': { 연금저축: 0,        IRP1: 0 },
    '2026-06': { 연금저축: 0,        IRP1: 0 },
  };

  // ── Firebase 토큰 획득 (기존 백필 스크립트와 동일 로직) ─────────
  async function getToken() {
    const token = localStorage.getItem('fb_id_token');
    const expiry = Number(localStorage.getItem('fb_token_expiry') || '0');
    if (token && Date.now() < expiry) return token;
    const rt = localStorage.getItem('fb_refresh_token');
    if (!rt) throw new Error('로그인 토큰 없음. 대시보드에서 먼저 로그인하세요.');
    const res = await fetch('https://securetoken.googleapis.com/v1/token?key=AIzaSyDovmoYvhoeci4HNAcuAopU1f_kGzWj1eg', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ grant_type: 'refresh_token', refresh_token: rt }),
    });
    if (!res.ok) throw new Error('토큰 갱신 실패');
    const d = await res.json();
    localStorage.setItem('fb_id_token', d.id_token);
    localStorage.setItem('fb_refresh_token', d.refresh_token);
    localStorage.setItem('fb_token_expiry', String(Date.now() + (Number(d.expires_in) - 60) * 1000));
    return d.id_token;
  }

  const FB_ROOT = 'https://my-asset-dashboard-9e6f9-default-rtdb.asia-southeast1.firebasedatabase.app';
  const CONTRIB_STORAGE_KEY = 'pension-simulation-contributions';

  console.log('📡 연금저축/IRP1 실측값 재백필 시작 —', Object.keys(ACTUAL_CONTRIBUTIONS).length, '개월');

  const results = [];

  for (const ym of Object.keys(ACTUAL_CONTRIBUTIONS)) {
    const patch = ACTUAL_CONTRIBUTIONS[ym];
    const url = `${FB_ROOT}/asset-data/pensionSimulation/contributions/${ym}.json`;

    // 1. 기존 값 조회 (riaExternalPurchase/IRP2 등 다른 필드 보존)
    const getToken1 = await getToken();
    const getRes = await fetch(`${url}?auth=${encodeURIComponent(getToken1)}`);
    if (!getRes.ok) throw new Error(`${ym} 조회 실패: ${getRes.status}`);
    const existing = (await getRes.json()) || {};

    // 2. 연금저축/IRP1만 병합
    const merged = { ...existing, ...patch };

    // 3. PUT 저장
    const patchToken = await getToken();
    const patchRes = await fetch(`${url}?auth=${encodeURIComponent(patchToken)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(merged),
    });
    if (!patchRes.ok) {
      const errTxt = await patchRes.text();
      throw new Error(`${ym} 저장 실패: ${patchRes.status} ${errTxt}`);
    }

    results.push({ ym, 연금저축: patch.연금저축, IRP1: patch.IRP1, existingFields: Object.keys(existing) });
    console.log(`✅ ${ym} 저장 완료 — 연금저축=${patch.연금저축.toLocaleString()}원, IRP1=${patch.IRP1.toLocaleString()}원 (기존 필드: ${Object.keys(existing).join(', ') || '없음'})`);
  }

  // ── localStorage 캐시 동기화 (ps-firebase.js의 _writeContributions와 동일 키) ──
  try {
    const localContrib = JSON.parse(localStorage.getItem(CONTRIB_STORAGE_KEY) || '{}');
    Object.keys(ACTUAL_CONTRIBUTIONS).forEach(ym => {
      localContrib[ym] = { ...(localContrib[ym] || {}), ...ACTUAL_CONTRIBUTIONS[ym] };
    });
    localStorage.setItem(CONTRIB_STORAGE_KEY, JSON.stringify(localContrib));
    console.log('✅ localStorage 캐시(pension-simulation-contributions) 동기화 완료');
  } catch (e) {
    console.warn('localStorage 캐시 동기화 실패 (Firebase 저장은 완료됨):', e);
  }

  const totalPension = results.reduce((s, r) => s + r.연금저축, 0);
  const totalIrp1 = results.reduce((s, r) => s + r.IRP1, 0);

  console.table(results.map(r => ({ ym: r.ym, 연금저축: r.연금저축, IRP1: r.IRP1 })));
  console.log(`📋 연간 누적: 연금저축 ${totalPension.toLocaleString()}원 + IRP1 ${totalIrp1.toLocaleString()}원 = ${(totalPension + totalIrp1).toLocaleString()}원`);
  console.log('🔄 pension-simulation.html을 새로고침하면 반영됩니다 (미입력 월 경고 사라짐, 연간 누적 확인).');

})().catch(err => console.error('❌ 백필 오류:', err.message, err));
