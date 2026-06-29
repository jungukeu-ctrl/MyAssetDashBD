/**
 * ps-withdrawal-ui.js — 연금 인출 시뮬레이터 UI 렌더링
 * 의존: ps-config.js, ps-withdrawal.js, ps-state.js
 * DOM 읽기/쓰기: #pension-withdrawal 내부 요소만 허용
 * 전역 state / kiData 쓰기 금지
 */

'use strict';

const PensionWithdrawalUI = (() => {

  // ─── DOM 헬퍼 ───────────────────────────────────────────────────────────────

  function _el(id) { return document.getElementById(id); }

  // ─── 숫자 포맷 (UI 전용) ────────────────────────────────────────────────────

  /** 원 단위 → 만원 단위 표시 */
  function _fmtM(n) {
    if (n == null || isNaN(n)) return '—';
    const m = Math.round(n / 10000);
    return m.toLocaleString() + '만원';
  }

  /** 원 단위 → 억/만원 자동 */
  function _fmtAmt(n) {
    if (n == null || isNaN(n) || n === 0) return '0원';
    const abs = Math.abs(n);
    if (abs >= 100000000) return (Math.round(n / 1000000) / 100).toFixed(1) + '억원';
    if (abs >= 10000)     return Math.round(n / 10000).toLocaleString() + '만원';
    return n.toLocaleString() + '원';
  }

  /** 생년월 + 나이 → 연도 */
  function _ageToYear(age) { return 1974 + age; }

  // ─── 결과 HTML 빌더 ─────────────────────────────────────────────────────────

  function _buildBalanceCard(result) {
    const { targetAge, balances } = result;

    const rows = [
      { label: '연금저축',           key: '연금저축' },
      { label: 'IRP 1',              key: 'IRP1'     },
      { label: 'IRP 2 (퇴직금 포함)', key: 'IRP2'    },
      { label: '해외주식 (O 포함)',    key: '해외주식' },
      { label: 'RIA',                key: 'RIA'      },
      { label: 'ISA',                key: 'ISA'      }
    ];

    let totalBal = 0;
    let bodyRows = '';
    for (const { label, key } of rows) {
      const v = balances[key] || 0;
      if (v <= 0) continue;
      totalBal += v;
      bodyRows += `<tr>
        <td class="ps-wd-acct-label">${label}</td>
        <td class="ps-wd-right ps-wd-amount">${_fmtAmt(v)}</td>
      </tr>`;
    }
    totalBal = rows.reduce((s, r) => s + (balances[r.key] || 0), 0);

    return `
<div class="ps-wd-card">
  <div class="ps-wd-card-title">📊 ${targetAge}세 예상 연금자산 잔액</div>
  <table class="ps-wd-table">
    <thead>
      <tr><th>계좌</th><th class="ps-wd-right">예상 잔액</th></tr>
    </thead>
    <tbody>
      ${bodyRows || '<tr><td colspan="2" class="ps-wd-empty">데이터 없음</td></tr>'}
    </tbody>
    <tfoot>
      <tr class="ps-wd-total-row">
        <td>합계</td>
        <td class="ps-wd-right ps-wd-amount">${_fmtAmt(totalBal)}</td>
      </tr>
    </tfoot>
  </table>
</div>`;
  }

  function _buildIncomeCard(result) {
    const { targetAge, targetYM, sources, totalGross, totalTax, totalNet, healthInsurance, netAfterHI } = result;

    if (targetAge < 61) {
      return `
<div class="ps-wd-card ps-wd-pre-note">
  <p class="ps-wd-notice">⏳ ${targetAge}세는 연금 인출 시작(61세) 전입니다. 자산 적립 기간입니다.</p>
</div>`;
    }

    // 소득원 테이블
    let srcRows = '';
    for (const src of sources) {
      srcRows += `<tr>
        <td>
          <span class="ps-wd-src-name">${src.name}</span>
          <span class="ps-wd-src-note">${src.note || ''}</span>
        </td>
        <td class="ps-wd-right">${_fmtM(src.monthly)}</td>
        <td class="ps-wd-right ps-wd-tax-col">${src.tax > 0 ? _fmtM(src.tax) : '—'}</td>
        <td class="ps-wd-right ps-wd-net-col">${_fmtM(src.net)}</td>
      </tr>`;
    }

    if (sources.length === 0) {
      srcRows = `<tr><td colspan="4" class="ps-wd-empty">이 시점에는 수령 예정 연금이 없습니다.</td></tr>`;
    }

    // 건보료 행
    let hiHtml = '';
    if (healthInsurance.type === '피부양자') {
      hiHtml = `<div class="ps-wd-hi-row">
        <span class="ps-wd-badge ps-wd-badge-ok">피부양자</span>
        <span class="ps-wd-hi-detail">건보료 0원 (배우자 직장가입자 유지 전제)</span>
      </div>`;
    } else {
      const bd = healthInsurance.breakdown || {};
      hiHtml = `<div class="ps-wd-hi-row">
        <span class="ps-wd-badge ps-wd-badge-region">지역가입자</span>
        <span class="ps-wd-hi-amt">건보료 약 <strong>${_fmtM(healthInsurance.monthly)}/월</strong></span>
        ${bd.incomeMonthly != null ? `<span class="ps-wd-hi-detail">소득분 ${_fmtM(bd.incomeMonthly)} + 재산분 ${_fmtM(bd.propertyMonthly)} + 장기요양 ${_fmtM(bd.ltcMonthly)}</span>` : ''}
      </div>`;
    }

    // 최종 실수령 색상 (30만 이상이면 정상)
    const finalClass = netAfterHI >= 3000000 ? 'ps-wd-final-good' : netAfterHI >= 1000000 ? 'ps-wd-final-warn' : 'ps-wd-final-low';

    return `
<div class="ps-wd-card">
  <div class="ps-wd-card-title">💰 ${targetAge}세 월 예상 수령액
    <span class="ps-wd-card-sub">${targetYM} 기준</span>
  </div>
  <table class="ps-wd-table ps-wd-income-table">
    <thead>
      <tr>
        <th>소득원</th>
        <th class="ps-wd-right">세전</th>
        <th class="ps-wd-right ps-wd-tax-col">세금</th>
        <th class="ps-wd-right ps-wd-net-col">실수령</th>
      </tr>
    </thead>
    <tbody>${srcRows}</tbody>
    <tfoot>
      <tr class="ps-wd-total-row">
        <td>합계</td>
        <td class="ps-wd-right">${_fmtM(totalGross)}</td>
        <td class="ps-wd-right ps-wd-tax-col">${_fmtM(totalTax)}</td>
        <td class="ps-wd-right ps-wd-net-col">${_fmtM(totalNet)}</td>
      </tr>
    </tfoot>
  </table>

  ${hiHtml}

  <div class="ps-wd-final ${finalClass}">
    <span class="ps-wd-final-label">건보료 차감 후 실수령</span>
    <span class="ps-wd-final-amt">${_fmtM(netAfterHI)}<span class="ps-wd-final-unit">/월</span></span>
  </div>
</div>`;
  }

  function _buildWarnings(warnings) {
    if (!warnings || warnings.length === 0) return '';
    const items = warnings.map(w => `<li>${w}</li>`).join('');
    return `
<div class="ps-wd-card ps-wd-warnings-card">
  <div class="ps-wd-card-title">⚠️ 주의사항</div>
  <ul class="ps-wd-warnings-list">${items}</ul>
</div>`;
  }

  // ─── 메인 렌더 ──────────────────────────────────────────────────────────────

  function _render(age) {
    const resultEl = _el('wd-result');
    if (!resultEl) return;

    const psResult = (typeof PensionState !== 'undefined') ? PensionState.result  : null;
    const params   = (typeof PensionState !== 'undefined') ? PensionState.params  : PS_DEFAULT_PARAMS;

    let result;
    try {
      result = PensionWithdrawal.calc(age, psResult, params);
    } catch (e) {
      resultEl.innerHTML = `<div class="ps-wd-card"><p class="ps-wd-error">계산 중 오류가 발생했습니다: ${e.message}</p></div>`;
      return;
    }

    resultEl.innerHTML =
      _buildBalanceCard(result) +
      _buildIncomeCard(result) +
      _buildWarnings(result.warnings);
  }

  // ─── 슬라이더 연동 ──────────────────────────────────────────────────────────

  function _syncSliderDisplay(age) {
    const display = _el('wd-age-display');
    const year    = _el('wd-year-display');
    if (display) display.textContent = age + '세';
    if (year)    year.textContent    = '(' + _ageToYear(age) + '년)';
  }

  // ─── 초기화 (공개) ──────────────────────────────────────────────────────────

  function init() {
    const slider = _el('wd-age-slider');
    if (!slider) return;

    // 슬라이더 이벤트
    slider.addEventListener('input', () => {
      const age = parseInt(slider.value, 10);
      _syncSliderDisplay(age);
      _render(age);
    });

    // PensionState 구독 — 적립 계산 완료 시 인출 결과도 자동 갱신
    if (typeof PensionState !== 'undefined') {
      PensionState.subscribe(() => {
        const age = parseInt(_el('wd-age-slider')?.value || 65, 10);
        _render(age);
      });
    }

    // 초기 표시
    const initAge = parseInt(slider.value, 10);
    _syncSliderDisplay(initAge);
    _render(initAge);
  }

  return { init };

})();
