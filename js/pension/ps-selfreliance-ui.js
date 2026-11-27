/**
 * ps-selfreliance-ui.js — 자립률 카드 렌더링 (SELFREL-001 / SELFREL-009)
 * 의존: ps-config.js (PS_SELF_RELIANCE), ps-selfreliance.js (PensionSelfReliance), ps-state.js (PensionState)
 * DOM 읽기/쓰기: #pension-selfreliance 내부만 허용. 계산은 ps-selfreliance.js 결과만 사용(재계산 금지).
 *
 * 나이 슬라이더는 카드 껍데기(shell)에 한 번만 만들고, 본문(#ps-sr-body)만 다시 그린다
 * (슬라이더를 끌고 있는 동안 DOM이 교체되어 드래그가 끊기는 것을 막기 위함).
 */

'use strict';

const PensionSelfRelianceUI = (() => {

  const SIGNAL = {
    green:  { icon: '🟢', label: '여유 있음',   cls: 'ps-sr-green'  },
    yellow: { icon: '🟡', label: '경계(여유 없음)', cls: 'ps-sr-yellow' },
    red:    { icon: '🔴', label: '최소선 미달', cls: 'ps-sr-red'    }
  };

  // 사용자가 고른 나이 (null = 인출 시작 나이 기본값)
  let _selectedAge = null;
  let _bound = false;

  // ─── 포맷 ───────────────────────────────────────────────────────────────────

  function _pct(r) {
    return (r == null || isNaN(r)) ? '—' : (r * 100).toFixed(1) + '%';
  }

  /** 원 → 만원(소수 1자리) */
  function _man(n) {
    if (n == null || isNaN(n)) return '—';
    return (Math.round(n / 1000) / 10).toLocaleString('ko-KR', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + '만원';
  }

  function _sig(signal) { return SIGNAL[signal] || { icon: '', label: '', cls: '' }; }

  /** 소진 정보 → 표시 문자열 */
  function _dep(d, endYM) {
    if (!d) return `소진 없음 (${endYM ? endYM.slice(0, 4) : ''}년까지)`;
    return `${d.ym} (${d.age}세)`;
  }

  // ─── 본문 ───────────────────────────────────────────────────────────────────

  function _buildHero(sel, base) {
    const cfg = PS_SELF_RELIANCE;
    if (sel.beforeStart) {
      return `<div class="ps-sr-hero">
        <div class="ps-sr-hero-icon">⏳</div>
        <div class="ps-sr-hero-body">
          <div class="ps-sr-hero-label">${sel.age}세(${sel.ym})는 인출 시작 전입니다</div>
          <div class="ps-sr-hero-sub">인출 시작 ${sel.startAge}세(${sel.startYM}) 이전은 자산 적립 기간이라 자립률을 계산하지 않습니다.</div>
        </div>
      </div>`;
    }
    const s = _sig(sel.signal);
    const isRep = base.representative && sel.age === base.representative.age;
    const tag = (isRep && base.gap.hasGap) ? ' · 공백기 대표값' : (sel.inGap ? ' · 공백기' : '');
    return `<div class="ps-sr-hero ${s.cls}">
        <div class="ps-sr-hero-icon">${s.icon}</div>
        <div class="ps-sr-hero-body">
          <div class="ps-sr-hero-rate">${_pct(sel.rateFloor)}</div>
          <div class="ps-sr-hero-label">${s.label} · 바닥선 ${_man(cfg.floorMonthly)} 기준</div>
          <div class="ps-sr-hero-sub">${sel.ym} (${sel.age}세) 스냅샷${tag}</div>
        </div>
      </div>`;
  }

  function _buildKv(sel, csel, base) {
    const cfg = PS_SELF_RELIANCE;
    if (sel.beforeStart) return '';
    const cs = csel && !csel.beforeStart ? _sig(csel.signal) : null;
    let oRow = '';
    if (sel.oEngine > 0) {
      oRow = `<div class="ps-sr-kv-row ps-sr-kv-sub"><span>└ 이 중 O 배당 현금(엔진 반영)</span><span>${_man(sel.oEngine)}</span></div>`;
    } else if (sel.oApplied) {
      oRow = `<div class="ps-sr-kv-row ps-sr-kv-sub"><span>└ O 배당 현금 추정(세후)</span><span>${_man(sel.oEst)}</span></div>`;
    }
    return `
      <div class="ps-sr-kv">
        <div class="ps-sr-kv-row"><span>월 세후 금융소득(명목)</span><b>${_man(sel.income)}</b></div>
        <div class="ps-sr-kv-row ps-sr-kv-sub"><span>└ 엔진 인출 순소득</span><span>${_man(sel.netEngine)}</span></div>
        ${oRow}
        <div class="ps-sr-kv-row"><span>바닥선 필요액(물가 반영)</span><b>${_man(sel.floor)}</b></div>
        <div class="ps-sr-kv-row"><span>목표선 ${_man(cfg.targetMonthly)} 기준 자립률</span><b>${_pct(sel.rateTarget)}</b></div>
        <div class="ps-sr-kv-row"><span>보수 시나리오 <span class="ps-sr-dim">(수익률 ${(cfg.conservative.rateDeltaPP * 100).toFixed(0)}%p · 물가 ${(cfg.conservative.inflationRate * 100).toFixed(1)}%)</span></span>
          <b>${cs ? cs.icon + ' ' + _pct(csel.rateFloor) : '—'}</b></div>
      </div>`;
  }

  function _buildBody(out) {
    const base = out.base;
    const cons = out.conservative;
    const sel  = base.selected;
    const csel = cons ? cons.selected : null;
    if (!sel) return '<div class="ps-sr-empty">계산할 인출 구간이 없습니다.</div>';

    const cfg = PS_SELF_RELIANCE;

    // 안내 문구
    const notes = [];
    const nShares = base.oShares.shares != null ? Math.round(base.oShares.shares).toLocaleString() : null;
    if (sel.oEngine > 0) {
      notes.push('이 나이의 O 배당은 엔진이 현금 사용으로 반영한 값입니다(설정 "배당 현금 사용 시작 나이" 또는 IRP 소진 후 전환).');
    } else if (!sel.beforeStart && sel.oApplied) {
      notes.push(`O 배당은 인출 시작 이후 모든 나이에 현금 사용으로 추정했습니다(보유 ${Math.round(sel.oShares).toLocaleString()}주 고정, 원천징수 후, 종합과세 미반영).`);
    }
    if (base.oShares.source === 'engine' && nShares) {
      notes.push(`O 보유 주수는 엔진 값(${nShares}주, 재투자만 반영)입니다. 엔진은 O 신규 매수를 모델링하지 않으므로 설정 패널 "O(리얼티인컴) 배당"에서 공백기 시작 보유 주수를 입력해 보정하세요.`);
    } else if (base.oShares.source === 'manual') {
      notes.push(`보정 입력한 보유 ${Math.round(base.oShares.shares).toLocaleString()}주 기준입니다.`);
    }
    if (!base.gap.hasGap) {
      notes.push('공백기(1단계) 목표 월 인출액이 설정되지 않아 인출 시작 시점의 단일 목표 기준으로 계산했습니다.');
    }
    if (!cfg.includeNationalPension) notes.push('국민연금은 분자에서 제외되었습니다.');
    if (out.error) notes.push('⚠️ ' + out.error);

    // 공백기 연령 칩 (클릭하면 해당 나이로 이동)
    let chipsHtml = '';
    if (base.gap.hasGap) {
      const chips = base.rows.map((r, i) => {
        const c = cons && cons.rows[i];
        const rs = _sig(r.signal);
        const cs2 = c && !c.beforeStart ? _sig(c.signal) : null;
        const active = sel.age === r.age ? ' ps-sr-chip-active' : '';
        return `<button type="button" class="ps-sr-chip${active}" data-age="${r.age}">
          <div class="ps-sr-chip-age">${r.age}세 <span class="ps-sr-chip-ym">${r.ym}</span></div>
          <div class="ps-sr-chip-val ${rs.cls}">${rs.icon} ${_pct(r.rateFloor)}</div>
          <div class="ps-sr-chip-sub">보수 ${cs2 ? cs2.icon + ' ' + _pct(c.rateFloor) : '—'}</div>
        </button>`;
      }).join('');
      chipsHtml = `<div class="ps-sr-section-title">공백기 연령별 자립률 (바닥선 기준, 눌러서 선택)</div>
        <div class="ps-sr-chips">${chips}</div>`;
    }

    const endYM = base.depletion.endYM;
    const depRows = [
      ['연금저축', base.depletion.pensionSaving, cons && cons.depletion.pensionSaving],
      ['IRP 1',    base.depletion.irp1,          cons && cons.depletion.irp1],
      ['IRP 2',    base.depletion.irp2,          cons && cons.depletion.irp2]
    ].map(([name, b, c]) => `<tr>
        <td>${name}</td>
        <td>${_dep(b, endYM)}</td>
        <td>${cons ? _dep(c, endYM) : '—'}</td>
      </tr>`).join('');

    const extra = sel.beforeStart ? '' : `
    <div class="ps-sr-section-title">별도 항목 (생활비에 포함하지 않음, ${sel.ym} 기준)</div>
    <div class="ps-sr-kv">
      <div class="ps-sr-kv-row"><span>월 세금</span><span>${_man(sel.tax)}</span></div>
      <div class="ps-sr-kv-row"><span>월 건보료</span><span>${_man(sel.healthInsurance)}</span></div>
      <div class="ps-sr-kv-row"><span>대출 상환</span><span class="ps-sr-dim">미반영</span></div>
    </div>`;

    return `
    <div class="ps-sr-main">
      ${_buildHero(sel, base)}
      ${_buildKv(sel, csel, base)}
    </div>

    ${chipsHtml}

    <div class="ps-sr-section-title">연금계좌 소진 시점 (기본 / 보수)</div>
    <table class="ps-sr-table">
      <thead><tr><th>계좌</th><th>기본</th><th>보수</th></tr></thead>
      <tbody>${depRows}</tbody>
    </table>
    ${extra}
    <ul class="ps-sr-notes">${notes.map(n => `<li>${n}</li>`).join('')}</ul>`;
  }

  // ─── 껍데기 / 갱신 ──────────────────────────────────────────────────────────

  function _ensureShell(el) {
    if (el.querySelector('#ps-sr-body')) return;
    el.innerHTML = `<div class="ps-card ps-sr-card">
      <div class="ps-card-title">자립률 · 퇴직 가능 최소선 75%</div>
      <div class="ps-sr-age-row">
        <label class="ps-sr-age-label-text" for="ps-sr-age">나이</label>
        <input type="range" id="ps-sr-age" class="ps-slider ps-sr-age-slider"
               min="${PensionSelfReliance.AGE_MIN}" max="${PensionSelfReliance.AGE_MAX}" step="1" value="61">
        <span id="ps-sr-age-label" class="ps-sr-age-label">61세</span>
        <button type="button" id="ps-sr-age-reset" class="ps-sr-age-reset" title="인출 시작 나이로 되돌리기">↺ 시작 나이</button>
      </div>
      <div id="ps-sr-body"></div>
    </div>`;
    _bindOnce(el);
  }

  function _bindOnce(el) {
    if (_bound) return;
    _bound = true;
    el.addEventListener('input', (e) => {
      if (e.target && e.target.id === 'ps-sr-age') {
        _selectedAge = parseInt(e.target.value, 10);
        render();
      }
    });
    // 칩/초기화 버튼은 click 대신 pointerup으로 처리한다. 설정 입력란에서 값을 바꾼 직후 칩을 누르면
    // 입력란 blur → change → 카드 재렌더가 mousedown과 mouseup 사이에 일어나 칩 요소가 교체되고
    // click 이벤트가 사라지기 때문이다(첫 클릭이 씹힘). pointerup은 교체된 새 요소에서도 발생한다.
    // 키보드(Enter/Space)는 click(detail===0)으로 받는다.
    const activate = (target) => {
      const chip = target && target.closest ? target.closest('.ps-sr-chip') : null;
      if (chip && chip.dataset.age) {
        _selectedAge = parseInt(chip.dataset.age, 10);
        render();
        return;
      }
      if (target && target.id === 'ps-sr-age-reset') {
        _selectedAge = null;
        render();
      }
    };
    el.addEventListener('pointerup', (e) => {
      if (e.button !== undefined && e.button !== 0) return;
      activate(e.target);
    });
    el.addEventListener('click', (e) => {
      if (e.detail === 0) activate(e.target);   // 키보드 활성화
    });
  }

  function render() {
    const el = document.getElementById('pension-selfreliance');
    if (!el) return;
    if (typeof PensionSelfReliance === 'undefined' || typeof PensionState === 'undefined') return;

    _ensureShell(el);
    const bodyEl = document.getElementById('ps-sr-body');
    if (!bodyEl) return;

    try {
      const out = PensionSelfReliance.compute(PensionState.params, PensionState.actual, PensionState.result, _selectedAge);
      if (!out.base) {
        bodyEl.innerHTML = `<div class="ps-sr-empty">${out.error || '계산 결과가 없습니다.'}</div>`;
        return;
      }
      bodyEl.innerHTML = _buildBody(out);

      // 슬라이더·라벨을 실제 사용된 나이에 맞춤 (기본값 = 인출 시작 나이, 55~100 보정 반영)
      const age = out.base.selected.age;
      const slider = document.getElementById('ps-sr-age');
      const label  = document.getElementById('ps-sr-age-label');
      if (slider && String(slider.value) !== String(age)) slider.value = age;
      if (label) label.textContent = `${age}세 (${out.base.selected.ym.slice(0, 4)}년)`;
    } catch (e) {
      console.warn('[PensionSelfRelianceUI] 렌더 실패:', e);
      bodyEl.innerHTML = '<div class="ps-sr-empty">자립률을 계산하지 못했습니다.</div>';
    }
  }

  function init() {
    if (typeof PensionState !== 'undefined') {
      PensionState.subscribe(() => render());   // 설정 변경·실적 갱신 시 자동 갱신 (_bindListeners 미사용)
    }
    render();
  }

  return { init, render };

})();
