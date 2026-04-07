/**
 * ps-settings.js — pension-simulation 설정 패널 UI
 *
 * 의존: ps-config.js (PS_DEFAULT_PARAMS), ps-engine.js (PensionEngine.calcISATransfer),
 *       ps-state.js (PensionState)
 * CSS: ps- 접두어만 사용, 기존 style.css --변수 재사용
 */

'use strict';

const PensionSettings = (() => {

  // ─── 내부: 숫자 입력 헬퍼 ────────────────────────────────────────────────

  function _pct(val) { return ((val || 0) * 100).toFixed(1); }
  function _won(val) { return Math.round(val || 0); }

  // ─── 내부: ISA 이체 금액 자동 계산 표시 ─────────────────────────────────

  function _updateISAAmounts() {
    const p = PensionState.params;
    const transfers = p.isa?.transfers || [];

    // 각 이체 시점까지의 VOO→ISA 누적 납입액은 시뮬레이션 결과에서 가져오는 것이 정확하나,
    // 설정 패널 실시간 표시 용도로 RIA 초기 잔액 기반 근사값 사용
    const riaBalance = PensionState.actual?.initialBalances?.RIA || 0;
    let prevTransfers = 0;

    transfers.forEach((tx, idx) => {
      const el = document.getElementById(`pension-isa-amount-${idx}`);
      if (!el) return;
      // paidToISA 근사: 이전 이체 합계만 사용 (정밀 계산은 엔진 담당)
      const amt = PensionEngine.calcISATransfer(p, 0, prevTransfers, tx.ym || '2099-01', riaBalance - prevTransfers);
      el.textContent = amt > 0 ? _fmtWon(amt) : '—';
      prevTransfers += amt;
    });
  }

  /** 원/만/억 포맷 */
  function _fmtWon(n) {
    if (typeof fmtWon === 'function') return fmtWon(n);
    if (!n && n !== 0) return '-';
    const abs = Math.abs(n);
    if (abs >= 1e8) return (n / 1e8).toFixed(1) + '억';
    if (abs >= 1e4) return Math.round(n / 1e4) + '만';
    return n + '원';
  }

  // ─── 내부: 고급 설정 토글 ────────────────────────────────────────────────

  function _bindToggle(btnId, contentId) {
    const btn  = document.getElementById(btnId);
    const body = document.getElementById(contentId);
    if (!btn || !body) return;
    btn.addEventListener('click', () => {
      const open = body.classList.toggle('ps-advanced-open');
      btn.querySelector('.ps-toggle-arrow').textContent = open ? '▲' : '▼';
    });
  }

  // ─── 내부: 개별 입력 생성 헬퍼 ───────────────────────────────────────────

  function _row(label, inputHtml, note) {
    return `<div class="ps-setting-row">
      <label class="ps-setting-label">${label}</label>
      <div class="ps-setting-input">${inputHtml}</div>
      ${note ? `<span class="ps-setting-note">${note}</span>` : ''}
    </div>`;
  }

  function _numInput(id, value, step, min, max) {
    return `<input class="ps-input" type="number" id="${id}"
      value="${value}" step="${step || 'any'}"
      ${min !== undefined ? `min="${min}"` : ''}
      ${max !== undefined ? `max="${max}"` : ''}>`;
  }

  function _textInput(id, value, placeholder) {
    return `<input class="ps-input" type="text" id="${id}"
      value="${value || ''}" placeholder="${placeholder || ''}">`;
  }

  function _readOnly(id, value) {
    return `<input class="ps-input ps-input-readonly" type="text" id="${id}"
      value="${value || ''}" disabled>`;
  }

  // ─── render() ────────────────────────────────────────────────────────────

  function render() {
    const container = document.getElementById('pension-settings');
    if (!container) return;

    const p = PS_DEFAULT_PARAMS;
    const ib = PensionState.actual?.initialBalances || {};

    container.innerHTML = `
    <div class="ps-settings-wrap">

      <!-- 카드1: 수익률 설정 -->
      <div class="ps-card">
        <div class="ps-card-title">수익률 설정</div>
        ${_row('개인연금저축', _numInput('ps-rate-pension', _pct(p.rates.연금저축), 0.1, 0, 30), '%/년')}
        ${_row('IRP 1',       _numInput('ps-rate-irp1',    _pct(p.rates.IRP1),    0.1, 0, 30), '%/년')}
        ${_row('IRP 2',       _numInput('ps-rate-irp2',    _pct(p.rates.IRP2),    0.1, 0, 30), '%/년')}
        ${_row('해외주식',    _numInput('ps-rate-overseas', _pct(p.rates.해외주식), 0.1, 0, 30), '%/년')}
        ${_row('RIA / ISA',   _numInput('ps-rate-ria',     _pct(p.rates.RIA),     0.1, 0, 30), '%/년')}
        ${_row('VOO',         _numInput('ps-rate-voo',     _pct(p.rates.VOO),     0.1, 0, 30), '%/년')}
      </div>

      <!-- 카드2: VOO 매도 설정 -->
      <div class="ps-card">
        <div class="ps-card-title">VOO 매도 설정</div>
        ${_row('매도 시작',       _textInput('ps-voo-start',    p.voo.startYM,       'YYYY-MM'))}
        ${_row('매도 주기',       _numInput('ps-voo-interval',  p.voo.intervalWeeks, 1, 1, 52), '주마다 1주')}
        ${_row('1주당 가격',      _numInput('ps-voo-price',     p.voo.priceKRW,      1000),     '원')}
        ${_row('연금저축 기본납입', _numInput('ps-pension-base', p.pension.baseMonthly, 10000),  '원/월')}
      </div>

      <!-- 카드3: ISA 이체 스케줄 -->
      <div class="ps-card">
        <div class="ps-card-title">ISA 이체 스케줄</div>
        ${_row('ISA 가입일', _textInput('ps-isa-join', p.isa.joinYM, 'YYYY-MM'))}
        ${p.isa.transfers.map((tx, i) => `
        <div class="ps-isa-transfer-row">
          <div class="ps-setting-row">
            <label class="ps-setting-label">${i + 1}차 이체 시점</label>
            <div class="ps-setting-input">${_textInput(`ps-isa-tx-${i}`, tx.ym, 'YYYY-MM')}</div>
          </div>
          <div class="ps-setting-row ps-isa-amount-row">
            <label class="ps-setting-label ps-text3">└ 이체 금액</label>
            <div class="ps-setting-input">
              <span class="ps-isa-amount" id="pension-isa-amount-${i}">—</span>
            </div>
          </div>
        </div>`).join('')}
        ${_row('분리과세 기준선', _numInput('ps-tax-sep', p.tax.separateTaxThreshold, 100000), '원/년')}
      </div>

      <!-- 고급 설정: 세율 & 건강보험료 -->
      <div class="ps-card ps-advanced-card">
        <button class="ps-advanced-toggle" id="ps-toggle-tax">
          <span>세율 &amp; 건강보험료</span>
          <span class="ps-toggle-arrow">▼</span>
        </button>
        <div class="ps-advanced-body" id="ps-body-tax">
          ${_row('세액공제율',         _numInput('ps-tax-deduct',    _pct(p.tax.deductRate),    0.1, 0, 50),   '%')}
          ${_row('연금세율 (60~69세)', _numInput('ps-tax-rate6069',  _pct(p.tax.rate6069),      0.1, 0, 50),   '%')}
          ${_row('연금세율 (70세~)',   _numInput('ps-tax-rate70',    _pct(p.tax.rate70),        0.1, 0, 50),   '%')}
          ${_row('건보료율',           _numInput('ps-hi-rate',       _pct(p.healthInsurance.rate), 0.01, 0, 30), '%')}
          ${_row('건보료 연간상승률',  _numInput('ps-hi-raise',      _pct(p.healthInsurance.annualRaise), 0.1, 0, 20), '%/년')}
          ${_row('장기요양보험료율',   _numInput('ps-ltc-rate',      _pct(p.healthInsurance.ltcRate), 0.1, 0, 50), '% (건보료 대비)')}
          ${_row('피부양자 소득기준',  _numInput('ps-dep-income',    p.healthInsurance.dependentIncomeLimit, 100000), '원/년')}
          ${_row('사적연금 면제 하한', _numInput('ps-pension-exempt', p.healthInsurance.pensionExemptLimit, 100000), '원/년')}
        </div>
      </div>

      <!-- 고급 설정: 부동산 -->
      <div class="ps-card ps-advanced-card">
        <button class="ps-advanced-toggle" id="ps-toggle-property">
          <span>부동산</span>
          <span class="ps-toggle-arrow">▼</span>
        </button>
        <div class="ps-advanced-body" id="ps-body-property">
          ${_row('아파트 공시가격',  _numInput('ps-prop-price', p.property.publicPrice,  1000000), '원')}
          ${_row('연간 상승률',      _numInput('ps-prop-raise', _pct(p.property.annualRaise), 0.1, 0, 30), '%/년')}
          ${_row('소유 지분',        _numInput('ps-prop-ratio', (p.property.ownershipRatio * 100).toFixed(0), 1, 0, 100), '%')}
        </div>
      </div>

      <!-- 고급 설정: 초기값 / 고정값 -->
      <div class="ps-card ps-advanced-card">
        <button class="ps-advanced-toggle" id="ps-toggle-init">
          <span>초기값 / 고정값</span>
          <span class="ps-toggle-arrow">▼</span>
        </button>
        <div class="ps-advanced-body" id="ps-body-init">
          <p class="ps-setting-note ps-note-info">Firebase 자동 연동 — 수동 변경 불가</p>
          ${_row('개인연금저축 잔액', _readOnly('ps-init-pension', _fmtWon(ib.연금저축 || 0)))}
          ${_row('IRP 1 잔액',       _readOnly('ps-init-irp1',    _fmtWon(ib.IRP1     || 0)))}
          ${_row('IRP 2 잔액',       _readOnly('ps-init-irp2',    _fmtWon(ib.IRP2     || 0)))}
          ${_row('ISA 잔액',         _readOnly('ps-init-isa',     _fmtWon(ib.ISA      || 0)))}
          ${_row('RIA 잔액',         _readOnly('ps-init-ria',     _fmtWon(ib.RIA      || 0)))}
          ${_row('해외주식 잔액',    _readOnly('ps-init-overseas', _fmtWon(ib.해외주식 || 0)))}
          <div class="ps-divider"></div>
          ${_row('퇴직 시점',   _textInput('ps-retire-ym',     p.retire.ym,              'YYYY-MM'))}
          ${_row('퇴직금',      _numInput('ps-retire-pay',     p.retire.severancePay,    1000000), '원')}
          ${_row('국민연금 시작', _textInput('ps-natl-start',  p.nationalPension.startYM, 'YYYY-MM'))}
          ${_row('국민연금 월액', _numInput('ps-natl-monthly', p.nationalPension.monthly, 10000), '원/월')}
        </div>
      </div>

    </div>
    `;

    // 초기 ISA 금액 표시
    _updateISAAmounts();
  }

  // ─── bind() ──────────────────────────────────────────────────────────────

  function bind() {
    // ── 수익률 ──
    _bindNum('ps-rate-pension', v => ({ rates: { 연금저축: v / 100 } }));
    _bindNum('ps-rate-irp1',    v => ({ rates: { IRP1: v / 100 } }));
    _bindNum('ps-rate-irp2',    v => ({ rates: { IRP2: v / 100 } }));
    _bindNum('ps-rate-overseas',v => ({ rates: { 해외주식: v / 100 } }));
    _bindNum('ps-rate-ria',     v => ({ rates: { RIA: v / 100, ISA: v / 100 } }));
    _bindNum('ps-rate-voo',     v => ({ rates: { VOO: v / 100 } }));

    // ── VOO 매도 ──
    _bindText('ps-voo-start',    v => ({ voo: { startYM: v } }));
    _bindNum('ps-voo-interval',  v => ({ voo: { intervalWeeks: v } }));
    _bindNum('ps-voo-price',     v => ({ voo: { priceKRW: v } }));
    _bindNum('ps-pension-base',  v => ({ pension: { baseMonthly: v } }));

    // ── ISA 이체 ──
    _bindText('ps-isa-join', v => ({ isa: { joinYM: v } }));
    const transfers = PensionState.params.isa?.transfers || [];
    transfers.forEach((_, i) => {
      _bindText(`ps-isa-tx-${i}`, v => {
        const txs = PensionState.params.isa.transfers.map((t, j) =>
          j === i ? { ...t, ym: v } : { ...t }
        );
        setTimeout(_updateISAAmounts, 0);
        return { isa: { transfers: txs } };
      });
    });
    _bindNum('ps-tax-sep', v => ({ tax: { separateTaxThreshold: v } }));

    // ── 세율 & 건보료 ──
    _bindNum('ps-tax-deduct',    v => ({ tax: { deductRate: v / 100 } }));
    _bindNum('ps-tax-rate6069',  v => ({ tax: { rate6069: v / 100 } }));
    _bindNum('ps-tax-rate70',    v => ({ tax: { rate70: v / 100 } }));
    _bindNum('ps-hi-rate',       v => ({ healthInsurance: { rate: v / 100 } }));
    _bindNum('ps-hi-raise',      v => ({ healthInsurance: { annualRaise: v / 100 } }));
    _bindNum('ps-ltc-rate',      v => ({ healthInsurance: { ltcRate: v / 100 } }));
    _bindNum('ps-dep-income',    v => ({ healthInsurance: { dependentIncomeLimit: v } }));
    _bindNum('ps-pension-exempt',v => ({ healthInsurance: { pensionExemptLimit: v } }));

    // ── 부동산 ──
    _bindNum('ps-prop-price', v => ({ property: { publicPrice: v } }));
    _bindNum('ps-prop-raise', v => ({ property: { annualRaise: v / 100 } }));
    _bindNum('ps-prop-ratio', v => ({ property: { ownershipRatio: v / 100 } }));

    // ── 고정값 (퇴직/국민연금) ──
    _bindText('ps-retire-ym',    v => ({ retire: { ym: v } }));
    _bindNum('ps-retire-pay',    v => ({ retire: { severancePay: v } }));
    _bindText('ps-natl-start',   v => ({ nationalPension: { startYM: v } }));
    _bindNum('ps-natl-monthly',  v => ({ nationalPension: { monthly: v } }));

    // ── 고급 설정 토글 ──
    _bindToggle('ps-toggle-tax',      'ps-body-tax');
    _bindToggle('ps-toggle-property', 'ps-body-property');
    _bindToggle('ps-toggle-init',     'ps-body-init');
  }

  // ─── syncFromState() ─────────────────────────────────────────────────────

  function syncFromState() {
    const p  = PensionState.params;
    const ib = PensionState.actual?.initialBalances || {};

    _setVal('ps-rate-pension',   _pct(p.rates.연금저축));
    _setVal('ps-rate-irp1',      _pct(p.rates.IRP1));
    _setVal('ps-rate-irp2',      _pct(p.rates.IRP2));
    _setVal('ps-rate-overseas',  _pct(p.rates.해외주식));
    _setVal('ps-rate-ria',       _pct(p.rates.RIA));
    _setVal('ps-rate-voo',       _pct(p.rates.VOO));

    _setVal('ps-voo-start',      p.voo.startYM);
    _setVal('ps-voo-interval',   p.voo.intervalWeeks);
    _setVal('ps-voo-price',      p.voo.priceKRW);
    _setVal('ps-pension-base',   p.pension.baseMonthly);

    _setVal('ps-isa-join',       p.isa.joinYM);
    (p.isa.transfers || []).forEach((tx, i) => _setVal(`ps-isa-tx-${i}`, tx.ym));
    _setVal('ps-tax-sep',        p.tax.separateTaxThreshold);

    _setVal('ps-tax-deduct',     _pct(p.tax.deductRate));
    _setVal('ps-tax-rate6069',   _pct(p.tax.rate6069));
    _setVal('ps-tax-rate70',     _pct(p.tax.rate70));
    _setVal('ps-hi-rate',        _pct(p.healthInsurance.rate));
    _setVal('ps-hi-raise',       _pct(p.healthInsurance.annualRaise));
    _setVal('ps-ltc-rate',       _pct(p.healthInsurance.ltcRate));
    _setVal('ps-dep-income',     p.healthInsurance.dependentIncomeLimit);
    _setVal('ps-pension-exempt', p.healthInsurance.pensionExemptLimit);

    _setVal('ps-prop-price',     p.property.publicPrice);
    _setVal('ps-prop-raise',     _pct(p.property.annualRaise));
    _setVal('ps-prop-ratio',     (p.property.ownershipRatio * 100).toFixed(0));

    _setVal('ps-retire-ym',      p.retire.ym);
    _setVal('ps-retire-pay',     p.retire.severancePay);
    _setVal('ps-natl-start',     p.nationalPension.startYM);
    _setVal('ps-natl-monthly',   p.nationalPension.monthly);

    // 초기 잔액 (읽기전용)
    _setVal('ps-init-pension',  _fmtWon(ib.연금저축 || 0));
    _setVal('ps-init-irp1',     _fmtWon(ib.IRP1     || 0));
    _setVal('ps-init-irp2',     _fmtWon(ib.IRP2     || 0));
    _setVal('ps-init-isa',      _fmtWon(ib.ISA      || 0));
    _setVal('ps-init-ria',      _fmtWon(ib.RIA      || 0));
    _setVal('ps-init-overseas', _fmtWon(ib.해외주식  || 0));

    _updateISAAmounts();
  }

  // ─── 내부: 이벤트 바인딩 헬퍼 ────────────────────────────────────────────

  function _bindNum(id, toPatch) {
    const el = document.getElementById(id);
    if (!el) return;
    el.addEventListener('change', () => {
      const v = parseFloat(el.value);
      if (isNaN(v)) return;
      PensionState.update(toPatch(v));
    });
  }

  function _bindText(id, toPatch) {
    const el = document.getElementById(id);
    if (!el) return;
    el.addEventListener('change', () => {
      const v = el.value.trim();
      if (!v) return;
      PensionState.update(toPatch(v));
    });
  }

  function _setVal(id, val) {
    const el = document.getElementById(id);
    if (el) el.value = val ?? '';
  }

  // ─── 공개 API ────────────────────────────────────────────────────────────

  return { render, bind, syncFromState };

})();
