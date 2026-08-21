
/* ================================================================
   RIA 외 계좌 순매수액(riaExternalPurchase) 2026년 1~6월 소급 입력
   생성일: 2026-07-03

   배경:
   P0-2(RIA 세제혜택 가중치 로직)는 main에 병합됐지만, 실제 화면에 숫자가
   뜨려면 pensionSimulation/contributions[ym].riaExternalPurchase 값이
   채워져야 한다. 전략 세션에서 사용자 엑셀 거래내역을 직접 집계해 아래
   확정값을 도출했다 (해외주식매수현황26년1분기_260327.xlsx 기준,
   MMF 등 현금성 자산 매수/매도 제외).

   사용법:
   1. MyAssetDashBD 대시보드(또는 pension-simulation.html)에 로그인한
      상태에서 실행 (fb_id_token/fb_refresh_token이 localStorage에 있어야 함)
   2. 브라우저 콘솔에 이 파일 내용 전체를 붙여넣기
   3. 자동 실행됨 — 각 월의 기존 contributions[ym]을 먼저 조회한 뒤
      riaExternalPurchase 필드만 병합 저장 (다른 필드는 보존)
   ================================================================ */

(async function () {

  // ── 확정값 (원 단위, 0 = 확정 무매수) ────────────────────────────
  const RIA_EXTERNAL_PURCHASE = {
    '2026-01': 1520831, // 미국주식 622928 + 연금저축 897903 + ISA 0 + IRP1 0
    '2026-02': 664144,  // 미국주식 496832 + 연금저축 167312 + ISA 0 + IRP1 0
    '2026-03': 1113072, // 미국주식 122285 + 연금저축 941576 + ISA 49211 + IRP1 0
    '2026-04': 0,       // 사용자 확인: 매수 진행 안 함, 확정 무매수
    '2026-05': 0,       // 사용자 확인: 매수 진행 안 함, 확정 무매수
    '2026-06': 0,       // 사용자 확인: 매수 진행 안 함, 확정 무매수
  };

  // ── Firebase 토큰 획득 (paste-in-console.js와 동일 로직) ─────────
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

  console.log('📡 RIA 외 계좌 순매수액 백필 시작 —', Object.keys(RIA_EXTERNAL_PURCHASE).length, '개월');

  const results = [];

  for (const ym of Object.keys(RIA_EXTERNAL_PURCHASE)) {
    const value = RIA_EXTERNAL_PURCHASE[ym];
    const url = `${FB_ROOT}/asset-data/pensionSimulation/contributions/${ym}.json`;

    // 1. 기존 값 조회 (연금저축/IRP 등 다른 필드 보존)
    const getToken1 = await getToken();
    const getRes = await fetch(`${url}?auth=${encodeURIComponent(getToken1)}`);
    if (!getRes.ok) throw new Error(`${ym} 조회 실패: ${getRes.status}`);
    const existing = (await getRes.json()) || {};

    // 2. riaExternalPurchase만 병합
    const merged = { ...existing, riaExternalPurchase: value };

    // 3. PUT 저장 (해당 ym 노드 전체를 병합된 객체로 교체 — 다른 ym에는 영향 없음)
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

    results.push({ ym, riaExternalPurchase: value, existingFields: Object.keys(existing) });
    console.log(`✅ ${ym} 저장 완료 — riaExternalPurchase=${value.toLocaleString()}원 (기존 필드: ${Object.keys(existing).join(', ') || '없음'})`);
  }

  // ── localStorage 캐시 동기화 (ps-firebase.js의 _writeContributions와 동일 키) ──
  try {
    const localContrib = JSON.parse(localStorage.getItem(CONTRIB_STORAGE_KEY) || '{}');
    Object.keys(RIA_EXTERNAL_PURCHASE).forEach(ym => {
      localContrib[ym] = { ...(localContrib[ym] || {}), riaExternalPurchase: RIA_EXTERNAL_PURCHASE[ym] };
    });
    localStorage.setItem(CONTRIB_STORAGE_KEY, JSON.stringify(localContrib));
    console.log('✅ localStorage 캐시(pension-simulation-contributions) 동기화 완료');
  } catch (e) {
    console.warn('localStorage 캐시 동기화 실패 (Firebase 저장은 완료됨):', e);
  }

  console.table(results.map(r => ({ ym: r.ym, riaExternalPurchase: r.riaExternalPurchase })));
  console.log('🔄 pension-simulation.html을 새로고침하면 RIA 카드/미입력 경고에 반영됩니다.');

})().catch(err => console.error('❌ 백필 오류:', err.message, err));
