
/* ================================================================
   연금저축/IRP1 월별 납입 실적 레거시 마이그레이션 (2026-01~06)
   생성일: 2026-07-03

   배경:
   pensionSimulation/contributions는 2026-07-02 신규 생성된 빈 구조라
   연금저축/IRP1/IRP2 필드가 비어있음(riaExternalPurchase만 백필됨).
   레거시 Pension-tracer가 같은 기간 asset-data/pension-tracker/records/{ym}에
   연금저축·IRP 납입액을 이미 자동 기록해뒀음(c_pension = 키움 잔액 델타,
   c_irp = IRP1 델타). 재입력 없이 새 스키마로 옮긴다.

   필드 매핑:
   - pension-tracker/records/{ym}.c_pension → pensionSimulation/contributions/{ym}.연금저축
   - pension-tracker/records/{ym}.c_irp     → pensionSimulation/contributions/{ym}.IRP1
   - IRP2는 매핑 없음(레거시에도 납입 없는 계좌) — 건드리지 않음

   사용법:
   1. MyAssetDashBD 대시보드(또는 pension-simulation.html)에 로그인한
      상태에서 실행 (fb_id_token/fb_refresh_token이 localStorage에 있어야 함)
   2. 브라우저 콘솔에 이 파일 내용 전체를 붙여넣기
   3. 자동 실행됨:
      a) 먼저 레거시 pension-tracker/records/{ym} 6개월분을 조회해
         c_pension/c_irp 존재 여부를 콘솔에 표로 보고(누락 달은 건너뜀)
      b) 값이 있는 필드만 pensionSimulation/contributions/{ym}에 병합 저장
         (riaExternalPurchase 등 기존 필드는 GET→merge→PUT으로 보존)
   ================================================================ */

(async function () {

  const YM_LIST = ['2026-01', '2026-02', '2026-03', '2026-04', '2026-05', '2026-06'];

  // ── Firebase 토큰 획득 (ria-external-purchase-backfill-console.js와 동일 로직) ──
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

  async function fbGet(path) {
    const token = await getToken();
    const res = await fetch(`${FB_ROOT}${path}.json?auth=${encodeURIComponent(token)}`);
    if (!res.ok) throw new Error(`GET ${path} 실패: ${res.status}`);
    return res.json();
  }

  async function fbPut(path, body) {
    const token = await getToken();
    const res = await fetch(`${FB_ROOT}${path}.json?auth=${encodeURIComponent(token)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const errTxt = await res.text();
      throw new Error(`PUT ${path} 실패: ${res.status} ${errTxt}`);
    }
  }

  // ── 1단계: 레거시 데이터 존재 여부 확인 ─────────────────────────
  console.log('📡 레거시 pension-tracker/records 조회 시작 —', YM_LIST.length, '개월');

  const legacyByYm = {};
  const checkReport = [];

  for (const ym of YM_LIST) {
    const legacy = await fbGet(`/asset-data/pension-tracker/records/${ym}`);
    const hasPension = legacy && typeof legacy.c_pension === 'number';
    const hasIrp = legacy && typeof legacy.c_irp === 'number';
    legacyByYm[ym] = legacy || null;
    checkReport.push({
      ym,
      존재: legacy ? 'O' : '레코드 없음',
      c_pension: hasPension ? legacy.c_pension : '(없음)',
      c_irp: hasIrp ? legacy.c_irp : '(없음)',
      마이그레이션: (hasPension || hasIrp) ? '진행' : '건너뜀(수동확인 필요)',
    });
  }

  console.log('🔍 레거시 데이터 확인 결과:');
  console.table(checkReport);

  const missingYms = checkReport.filter(r => r.마이그레이션.startsWith('건너뜀')).map(r => r.ym);
  if (missingYms.length) {
    console.warn('⚠️ 레거시에 값이 없어 건너뛴 달(수동 확인 필요):', missingYms.join(', '));
  }

  // ── 2단계: 값이 있는 달만 pensionSimulation/contributions에 병합 저장 ──
  const results = [];

  for (const ym of YM_LIST) {
    const legacy = legacyByYm[ym];
    if (!legacy) continue;

    const patch = {};
    if (typeof legacy.c_pension === 'number') patch['연금저축'] = legacy.c_pension;
    if (typeof legacy.c_irp === 'number') patch['IRP1'] = legacy.c_irp;
    if (!Object.keys(patch).length) continue;

    // 기존 값 조회 (riaExternalPurchase 등 다른 필드 보존)
    const existing = (await fbGet(`/asset-data/pensionSimulation/contributions/${ym}`)) || {};
    const merged = { ...existing, ...patch };

    await fbPut(`/asset-data/pensionSimulation/contributions/${ym}`, merged);

    results.push({ ym, ...patch, existingFields: Object.keys(existing) });
    console.log(`✅ ${ym} 저장 완료 —`, patch, `(기존 필드: ${Object.keys(existing).join(', ') || '없음'})`);
  }

  // ── localStorage 캐시 동기화 (ps-firebase.js의 _writeContributions와 동일 키) ──
  try {
    const localContrib = JSON.parse(localStorage.getItem(CONTRIB_STORAGE_KEY) || '{}');
    results.forEach(r => {
      const patch = {};
      if ('연금저축' in r) patch['연금저축'] = r['연금저축'];
      if ('IRP1' in r) patch['IRP1'] = r['IRP1'];
      localContrib[r.ym] = { ...(localContrib[r.ym] || {}), ...patch };
    });
    localStorage.setItem(CONTRIB_STORAGE_KEY, JSON.stringify(localContrib));
    console.log('✅ localStorage 캐시(pension-simulation-contributions) 동기화 완료');
  } catch (e) {
    console.warn('localStorage 캐시 동기화 실패 (Firebase 저장은 완료됨):', e);
  }

  console.log('📋 최종 마이그레이션 요약:');
  console.table(results.map(r => ({ ym: r.ym, 연금저축: r['연금저축'] ?? '(변경없음)', IRP1: r['IRP1'] ?? '(변경없음)' })));
  console.log('🔄 pension-simulation.html을 새로고침하면 반영됩니다.');

})().catch(err => console.error('❌ 마이그레이션 오류:', err.message, err));
