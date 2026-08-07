/**
 * ps-table.js — 월별 계획 vs 실적 테이블 및 납입 실적 입력
 *
 * 의존: ps-config.js, ps-state.js, ps-firebase.js
 * CSS: ps- 접두어만 사용.
 */

'use strict';

const PensionTable = (() => {
  const ACCOUNTS = ['연금저축', 'IRP1', 'IRP2', '해외주식', 'RIA', 'ISA'];
  const CONTRIBUTION_ACCOUNTS = ['연금저축', 'IRP1', 'IRP2'];

  function _fmtWon(n) {
    if (typeof fmtWon === 'function') return fmtWon(Math.round(n || 0));
    const v = Math.round(n || 0);
    const abs = Math.abs(v);
    if (abs >= 1e8) return (v / 1e8).toFixed(1) + '억';
    if (abs >= 1e4) return Math.round(v / 1e4) + '만';
    return v.toLocaleString() + '원';
  }

  function _fmtInput(n) {
    const v = Number(n || 0);
    return v ? String(Math.round(v)) : '';
  }

  // riaExternalPurchase 전용: 0(확정 무매수)과 undefined(미입력)를 구분 표시
  function _fmtRiaInput(v) {
    if (v === undefined || v === null) return '';
    return String(Math.round(Number(v) || 0));
  }

  function _parseWon(id) {
    const el = document.getElementById(id);
    if (!el) return 0;
    const raw = String(el.value || '').replace(/,/g, '').trim();
    if (!raw) return 0;
    const n = Number(raw);
    return Number.isFinite(n) ? Math.max(0, Math.round(n)) : NaN;
  }

  function _escape(s) {
    return String(s ?? '').replace(/[&<>'"]/g, ch => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
    }[ch]));
  }

  function _limits() {
    return PS_CONTRIBUTION_LIMITS || {
      combinedAnnual: 18000000,
      warningAt: 15000000
    };
  }

  function _contributions() {
    return PensionState.actual?.contributions || {};
  }

  function _yearOf(ym) { return String(ym || '').slice(0, 4); }

  function _monthContribution(row) {
    return CONTRIBUTION_ACCOUNTS.reduce((sum, k) => sum + Number(row?.[k] || 0), 0);
  }

  function _yearContributionTotal(contributions, targetYM) {
    const targetYear = _yearOf(targetYM);
    return Object.keys(contributions || {})
      .filter(ym => _yearOf(ym) === targetYear && ym <= targetYM)
      .reduce((sum, ym) => sum + _monthContribution(contributions[ym]), 0);
  }

  function validateContribution(ym, patch, existing) {
    const contributions = { ...(existing || _contributions()) };
    contributions[ym] = {
      ...(contributions[ym] || {}),
      ...patch
    };

    const total = _yearContributionTotal(contributions, ym);
    const limits = _limits();
    const remaining = limits.combinedAnnual - total;

    if (total > limits.combinedAnnual) {
      return {
        ok: false,
        level: 'error',
        total,
        remaining,
        message: '⛔ 연금저축+IRP 연간 합산 납입액이 1,800만원을 초과합니다'
      };
    }
    if (total >= limits.warningAt) {
      return {
        ok: true,
        level: 'warning',
        total,
        remaining,
        message: `⚠️ 연간 납입 한도 1,800만원까지 ${Math.max(0, Math.round(remaining / 10000)).toLocaleString()}만원 남음`
      };
    }
    return {
      ok: true,
      level: 'ok',
      total,
      remaining,
      message: `✅ 올해 누적 납입액 ${Math.round(total / 10000).toLocaleString()}만원 / 한도 1,800만원`
    };
  }

  // contributions에서 riaExternalPurchase가 확정 입력된 월만 { ym: amount } 맵으로 추출
  function _riaPurchaseMap(contributions) {
    const map = {};
    Object.keys(contributions || {}).forEach(ym => {
      const v = contributions[ym]?.riaExternalPurchase;
      if (v !== undefined && v !== null) map[ym] = v;
    });
    return map;
  }

  function _currentYM() {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  }

  // PS_START_YM ~ 현재월 이전(과거월)까지 riaExternalPurchase 미입력 월 목록
  function _missingRiaMonths(contributions) {
    const curYM = _currentYM();
    let y = parseInt(String(PS_START_YM).slice(0, 4), 10);
    let m = parseInt(String(PS_START_YM).slice(5, 7), 10);
    const missing = [];
    while (true) {
      const ym = `${y}-${String(m).padStart(2, '0')}`;
      if (ym >= curYM) break;
      const v = contributions[ym]?.riaExternalPurchase;
      if (v === undefined || v === null) missing.push(ym);
      m++;
      if (m > 12) { m = 1; y++; }
    }
    return missing;
  }

  // RIA 세액 계산 3단계(공제금액/과세표준/세액)를 "입력값 연산 = 결과값" 형태로 조립
  // — 초기 렌더(_renderRiaCard)와 실시간 미리보기(refreshRiaPreview)가 공유
  function _riaTaxLines(calc) {
    const basicDeduction = PS_RIA_TAX_BENEFIT.basicDeduction ?? 2500000;
    const taxRatePct = Math.round((PS_RIA_TAX_BENEFIT.capitalGainsTaxRate ?? 0.22) * 100);
    const pctStr = (calc.finalDeductionRate * 100).toFixed(1);
    const preFloor = calc.taxableBeforeBasicDeduction - basicDeduction;
    const floored = preFloor < 0;

    return {
      benefit: `RIA 최종 공제금액: ${_fmtWon(calc.gain)} × ${pctStr}% = <strong id="pension-ria-benefit">${_fmtWon(calc.adjustedBenefitAmount)}</strong>`,
      taxBase: `과세표준: ${_fmtWon(calc.gain)} − ${_fmtWon(calc.adjustedBenefitAmount)} − ${_fmtWon(basicDeduction)} = ${_fmtWon(preFloor)}`
        + (floored
          ? ` → <strong id="pension-ria-taxbase">0원</strong>(음수는 0원 처리)`
          : ` → <strong id="pension-ria-taxbase">${_fmtWon(calc.taxBase)}</strong>`),
      tax: `예상 양도소득세: ${_fmtWon(calc.taxBase)} × ${taxRatePct}% = <strong id="pension-ria-tax" class="ps-negative">${_fmtWon(calc.estimatedTax)}</strong>`
    };
  }

  function _renderRiaCard(contributions) {
    const purchases = _riaPurchaseMap(contributions);
    const calc = PensionEngine.calcRiaCapitalGainsTax(purchases);
    const missing = _missingRiaMonths(contributions);
    const pctStr = (calc.finalDeductionRate * 100).toFixed(1);
    const lines = _riaTaxLines(calc);

    return `
      <div class="ps-card ps-limit-card">
        <div class="ps-card-title">RIA 세제혜택 조정 공제율</div>
        <div id="pension-ria-rate" style="font-size:1.8em;font-weight:700;margin:4px 0;">${pctStr}%</div>
        <ul class="ps-limit-list">
          <li id="pension-ria-detail">가중 순매수액 <strong>${_fmtWon(calc.weightedTotal)}</strong> · 조정비율 <strong>${(calc.adjustRatio * 100).toFixed(1)}%</strong></li>
          <li>RIA 매도금액(분모): <strong>${_fmtWon(PS_RIA_TAX_BENEFIT.saleAmount)}</strong></li>
          <li>매도차익(양도소득): <strong id="pension-ria-gain">${_fmtWon(calc.gain)}</strong></li>
          <li id="pension-ria-benefit-line">${lines.benefit}</li>
          <li id="pension-ria-taxbase-line">${lines.taxBase}</li>
          <li id="pension-ria-tax-line">${lines.tax}</li>
          <li>RIA 미이용 시 예상세액: <strong id="pension-ria-notax">${_fmtWon(calc.estimatedTaxNoRia)}</strong></li>
          <li>절감액: <strong id="pension-ria-saved" class="ps-positive">${_fmtWon(calc.savedTax)}</strong></li>
        </ul>
        <div id="pension-ria-warning" class="ps-limit-msg ${missing.length ? 'ps-limit-warning' : 'ps-limit-ok'}">
          ${missing.length
            ? `⚠️ ${missing.length}개월 데이터 미입력 (${_escape(missing.join(', '))}) — 실제 공제율과 다를 수 있음`
            : '✅ 확인 대상 전월 입력 완료'}
        </div>
      </div>
    `;
  }

  function _latestEditableMonth(result) {
    const months = result?.months || [];
    const actual = result?.actual?.total || [];
    for (let i = actual.length - 1; i >= 0; i--) {
      if (actual[i] !== null && actual[i] !== undefined) return months[i];
    }
    return months[0] || '2026-01';
  }

  function render(result) {
    const container = document.getElementById('pension-table');
    if (!container) return;
    if (!result || !result.months) {
      container.innerHTML = '<div class="ps-card ps-table-card"><p class="ps-table-empty">시뮬레이션 결과를 불러오는 중입니다.</p></div>';
      return;
    }

    const selectedYM = document.getElementById('pension-contrib-ym')?.value || _latestEditableMonth(result);
    const contributions = _contributions();
    const current = contributions[selectedYM] || {};
    const validation = validateContribution(selectedYM, current, contributions);

    container.innerHTML = `
      <div class="ps-table-section-header">
        <div>
          <h2 class="ps-table-title">월별 계획 vs 실적</h2>
          <p class="ps-table-desc">Pension-tracer 정적 테이블을 대체하는 실적 입력·비교 영역입니다.</p>
        </div>
        <span class="ps-table-badge">Phase7</span>
      </div>

      <div class="ps-table-grid">
        <div class="ps-card ps-contrib-card">
          <div class="ps-card-title">납입 실적 입력</div>
          <div class="ps-contrib-form">
            <label class="ps-contrib-field">
              <span>대상 월</span>
              <input class="ps-input ps-contrib-input" id="pension-contrib-ym" type="month" value="${_escape(selectedYM)}">
            </label>
            ${CONTRIBUTION_ACCOUNTS.map(k => `
              <label class="ps-contrib-field">
                <span>${k}</span>
                <input class="ps-input ps-contrib-input" id="pension-contrib-${k}" type="number" min="0" step="10000" value="${_fmtInput(current[k])}" placeholder="0">
              </label>
            `).join('')}
            <label class="ps-contrib-field">
              <span>해외지수ETF 순매수액</span>
              <input class="ps-input ps-contrib-input" id="pension-contrib-ria" type="number" min="0" step="10000" value="${_fmtRiaInput(current.riaExternalPurchase)}" placeholder="미입력">
              <small style="display:block;font-size:0.8em;opacity:0.7;margin-top:2px;">연금저축/IRP/ISA 등에서 이번 달 매수한 S&amp;P500·나스닥100류 해외지수 추종 ETF 금액만 입력. TRF3070 등 혼합형 채권형은 제외. 확인 안 됐으면 비워두세요(0원 확정과 구분).</small>
            </label>
            <label class="ps-contrib-field ps-contrib-memo-field">
              <span>메모</span>
              <input class="ps-input ps-contrib-input ps-contrib-memo" id="pension-contrib-memo" type="text" value="${_escape(current.memo || '')}" placeholder="예: 7월 정기 납입">
            </label>
          </div>
          <div id="pension-contrib-status" class="ps-limit-msg ps-limit-${validation.level}">${_escape(validation.message)}</div>
          <div class="ps-contrib-actions">
            <button class="ps-primary-btn" id="pension-contrib-save">저장</button>
            <button class="ps-secondary-btn" id="pension-contrib-load">선택 월 불러오기</button>
          </div>
          <p class="ps-contrib-note">연금저축+IRP는 월 125만+25만 구조로 연간 1,800만원 납입 한도를 꽉 채우는 전략입니다. 1,500만원부터 경고, 1,800만원 초과는 저장 차단합니다.</p>
        </div>

        <div class="ps-card ps-limit-card">
          <div class="ps-card-title">연간 한도 점검</div>
          ${_renderYearSummary(contributions, selectedYM)}
        </div>

        ${_renderRiaCard(contributions)}
      </div>

      <div class="ps-card ps-table-card">
        <p class="ps-table-scope-note">포함 계좌: 연금저축 · IRP1 · IRP2 · 해외주식 · RIA · ISA (평가금 기준, 전체 8개 계좌 중 6개)</p>
        <div class="ps-table-wrap">
          <table class="ps-month-table">
            <thead>
              <tr>
                <th>월</th>
                <th>계획 총액</th>
                <th>실적 총액</th>
                <th>차이</th>
                <th>연금저축 납입</th>
                <th>IRP1 납입</th>
                <th>IRP2 납입</th>
                <th>연간 누적</th>
                <th>상태</th>
              </tr>
            </thead>
            <tbody>${_renderRows(result, contributions)}</tbody>
          </table>
        </div>
      </div>
    `;

    _bind(result);
  }

  function _renderYearSummary(contributions, selectedYM) {
    const y = _yearOf(selectedYM);
    const months = Object.keys(contributions || {}).filter(ym => _yearOf(ym) === y).sort();
    const yearTotal = months.reduce((sum, ym) => sum + _monthContribution(contributions[ym]), 0);
    const limits = _limits();
    const remain = limits.combinedAnnual - yearTotal;
    const pct = limits.combinedAnnual ? Math.min(100, Math.max(0, yearTotal / limits.combinedAnnual * 100)) : 0;
    const level = yearTotal > limits.combinedAnnual ? 'error' : yearTotal >= limits.warningAt ? 'warning' : 'ok';

    return `
      <div class="ps-limit-meter">
        <div class="ps-limit-meter-head">
          <span>${_escape(y)}년 누적</span>
          <strong>${_fmtWon(yearTotal)}</strong>
        </div>
        <div class="ps-limit-bar"><div class="ps-limit-fill ps-limit-fill-${level}" style="width:${pct}%"></div></div>
        <div class="ps-limit-meter-foot">
          <span>경고 ${_fmtWon(limits.warningAt)}</span>
          <span>상한 ${_fmtWon(limits.combinedAnnual)}</span>
        </div>
      </div>
      <ul class="ps-limit-list">
        <li>남은 한도: <strong>${_fmtWon(Math.max(0, remain))}</strong></li>
        <li>입력 월 수: <strong>${months.length}개월</strong></li>
        <li>초과 여부: <strong class="ps-limit-text-${level}">${yearTotal > limits.combinedAnnual ? '초과' : '정상'}</strong></li>
      </ul>
    `;
  }

  function _renderRows(result, contributions) {
    const months = result.months || [];
    const visibleMonths = months.slice(0, Math.min(months.length, 60));
    let lastYear = null;
    let yearRun = 0;

    return visibleMonths.map((ym, i) => {
      const y = _yearOf(ym);
      if (y !== lastYear) {
        lastYear = y;
        yearRun = 0;
      }
      const c = contributions[ym] || {};
      yearRun += _monthContribution(c);
      const plan = result.plan?.total?.[i] ?? null;
      const actual = result.actual?.total?.[i] ?? null;
      const diff = actual === null || actual === undefined || plan === null || plan === undefined ? null : actual - plan;
      const status = _rowStatus(yearRun);

      return `
        <tr data-ym="${_escape(ym)}">
          <td class="ps-month-cell"><button class="ps-link-btn" data-ps-edit-ym="${_escape(ym)}">${_escape(ym)}</button></td>
          <td>${_fmtWon(plan)}</td>
          <td>${actual === null || actual === undefined ? '—' : _fmtWon(actual)}</td>
          <td class="${diff === null ? '' : diff >= 0 ? 'ps-positive' : 'ps-negative'}">${diff === null ? '—' : _fmtWon(diff)}</td>
          <td>${c.연금저축 ? _fmtWon(c.연금저축) : '—'}</td>
          <td>${c.IRP1 ? _fmtWon(c.IRP1) : '—'}</td>
          <td>${c.IRP2 ? _fmtWon(c.IRP2) : '—'}</td>
          <td>${yearRun ? _fmtWon(yearRun) : '—'}</td>
          <td><span class="ps-status-pill ps-status-${status.level}">${status.label}</span></td>
        </tr>
      `;
    }).join('');
  }

  function _rowStatus(yearTotal) {
    const limits = _limits();
    if (yearTotal > limits.combinedAnnual) return { level: 'error', label: '초과' };
    if (yearTotal >= limits.warningAt) return { level: 'warning', label: '경고' };
    return { level: 'ok', label: '정상' };
  }

  function _bind(result) {
    const ymEl = document.getElementById('pension-contrib-ym');
    const saveBtn = document.getElementById('pension-contrib-save');
    const loadBtn = document.getElementById('pension-contrib-load');

    // 대상 월 변경 시 해당 월 저장값으로 폼 필드 자동 리로드
    const _fillFormFromYm = (ym) => {
      const row = _contributions()[ym] || {};
      CONTRIBUTION_ACCOUNTS.forEach(k => {
        const el = document.getElementById(`pension-contrib-${k}`);
        if (el) el.value = _fmtInput(row[k]);
      });
      const riaInput = document.getElementById('pension-contrib-ria');
      if (riaInput) riaInput.value = _fmtRiaInput(row.riaExternalPurchase);
      const memo = document.getElementById('pension-contrib-memo');
      if (memo) memo.value = row.memo || '';
    };
    if (ymEl) ymEl.addEventListener('input', () => _fillFormFromYm(ymEl.value));

    const refreshStatus = () => {
      const ym = ymEl?.value || _latestEditableMonth(result);
      const patch = _readFormPatch();
      const status = document.getElementById('pension-contrib-status');
      if (!status || !patch) return;
      const validation = validateContribution(ym, patch);
      status.className = `ps-limit-msg ps-limit-${validation.level}`;
      status.textContent = validation.message;
    };

    [ymEl, ...CONTRIBUTION_ACCOUNTS.map(k => document.getElementById(`pension-contrib-${k}`))]
      .filter(Boolean)
      .forEach(el => el.addEventListener('input', refreshStatus));

    const riaEl = document.getElementById('pension-contrib-ria');

    // RIA 조정 공제율 실시간 미리보기 — 아직 저장 안 된 현재 입력값을 반영해 계산
    const refreshRiaPreview = () => {
      const ym = ymEl?.value || _latestEditableMonth(result);
      const purchases = _riaPurchaseMap(_contributions());
      const raw = String(riaEl?.value || '').replace(/,/g, '').trim();
      if (raw !== '') {
        const n = Number(raw);
        if (Number.isFinite(n) && n >= 0) purchases[ym] = n;
      } else {
        delete purchases[ym];
      }
      const calc = PensionEngine.calcRiaCapitalGainsTax(purchases);
      const rateEl = document.getElementById('pension-ria-rate');
      if (rateEl) rateEl.textContent = `${(calc.finalDeductionRate * 100).toFixed(1)}%`;
      const detailEl = document.getElementById('pension-ria-detail');
      if (detailEl) {
        detailEl.innerHTML = `가중 순매수액 <strong>${_fmtWon(calc.weightedTotal)}</strong> · 조정비율 <strong>${(calc.adjustRatio * 100).toFixed(1)}%</strong>`;
      }
      const gainEl = document.getElementById('pension-ria-gain');
      if (gainEl) gainEl.textContent = _fmtWon(calc.gain);
      const lines = _riaTaxLines(calc);
      const benefitLineEl = document.getElementById('pension-ria-benefit-line');
      if (benefitLineEl) benefitLineEl.innerHTML = lines.benefit;
      const taxBaseLineEl = document.getElementById('pension-ria-taxbase-line');
      if (taxBaseLineEl) taxBaseLineEl.innerHTML = lines.taxBase;
      const taxLineEl = document.getElementById('pension-ria-tax-line');
      if (taxLineEl) taxLineEl.innerHTML = lines.tax;
      const noTaxEl = document.getElementById('pension-ria-notax');
      if (noTaxEl) noTaxEl.textContent = _fmtWon(calc.estimatedTaxNoRia);
      const savedEl = document.getElementById('pension-ria-saved');
      if (savedEl) savedEl.textContent = _fmtWon(calc.savedTax);
    };

    [ymEl, riaEl].filter(Boolean).forEach(el => el.addEventListener('input', refreshRiaPreview));

    if (loadBtn) {
      loadBtn.addEventListener('click', () => {
        render(PensionState.result);
      });
    }

    document.querySelectorAll('[data-ps-edit-ym]').forEach(btn => {
      btn.addEventListener('click', () => {
        const ym = btn.getAttribute('data-ps-edit-ym');
        if (ymEl) ymEl.value = ym;
        const row = _contributions()[ym] || {};
        CONTRIBUTION_ACCOUNTS.forEach(k => {
          const el = document.getElementById(`pension-contrib-${k}`);
          if (el) el.value = _fmtInput(row[k]);
        });
        if (riaEl) riaEl.value = _fmtRiaInput(row.riaExternalPurchase);
        const memo = document.getElementById('pension-contrib-memo');
        if (memo) memo.value = row.memo || '';
        refreshStatus();
        refreshRiaPreview();
        document.getElementById('pension-table')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
    });

    if (saveBtn) {
      saveBtn.addEventListener('click', async () => {
        const ym = ymEl?.value || '';
        if (!/^\d{4}-\d{2}$/.test(ym)) {
          _setStatus('error', '⛔ 대상 월을 YYYY-MM 형식으로 선택해 주세요');
          return;
        }
        const patch = _readFormPatch();
        if (!patch) {
          _setStatus('error', '⛔ 납입액은 0 이상의 숫자로 입력해 주세요');
          return;
        }
        const validation = validateContribution(ym, patch);
        if (!validation.ok) {
          _setStatus(validation.level, validation.message);
          return;
        }

        try {
          const updated = await PensionFirebase.saveContribution(ym, patch);
          const nextActual = { ...(PensionState.actual || {}), contributions: updated };
          PensionState.setActual(nextActual);
          _setStatus(validation.level, validation.message + ' · 저장 완료');
        } catch (e) {
          console.error('[PensionTable] 납입 실적 저장 실패:', e);
          _setStatus('error', '⛔ 저장 중 오류가 발생했습니다. localStorage/Firebase 상태를 확인해 주세요');
        }
      });
    }
  }

  function _readFormPatch() {
    const patch = {};
    for (const k of CONTRIBUTION_ACCOUNTS) {
      const v = _parseWon(`pension-contrib-${k}`);
      if (!Number.isFinite(v)) return null;
      patch[k] = v;
    }
    // 해외지수ETF 순매수액: 빈값 = 키 생략(미입력 유지), "0" = 확정 무매수
    const riaRaw = String(document.getElementById('pension-contrib-ria')?.value || '').replace(/,/g, '').trim();
    if (riaRaw !== '') {
      const riaVal = Number(riaRaw);
      if (!Number.isFinite(riaVal) || riaVal < 0) return null;
      patch.riaExternalPurchase = Math.round(riaVal);
    }
    const memo = document.getElementById('pension-contrib-memo')?.value?.trim() || '';
    if (memo) patch.memo = memo;
    patch.updatedAt = new Date().toISOString();
    return patch;
  }

  function _setStatus(level, msg) {
    const el = document.getElementById('pension-contrib-status');
    if (!el) return;
    el.className = `ps-limit-msg ps-limit-${level}`;
    el.textContent = msg;
  }

  return { render, validateContribution };
})();
