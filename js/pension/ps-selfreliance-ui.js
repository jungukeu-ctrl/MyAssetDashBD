/**
 * ps-selfreliance-ui.js — 자립률 카드 렌더링 (SELFREL-001)
 * 의존: ps-config.js (PS_SELF_RELIANCE), ps-selfreliance.js (PensionSelfReliance), ps-state.js (PensionState)
 * DOM 읽기/쓰기: #pension-selfreliance 내부만 허용. 계산은 ps-selfreliance.js 결과만 사용(재계산 금지).
 */

'use strict';

const PensionSelfRelianceUI = (() => {

  const SIGNAL = {
    green:  { icon: '🟢', label: '여유 있음',   cls: 'ps-sr-green'  },
    yellow: { icon: '🟡', label: '경계(여유 없음)', cls: 'ps-sr-yellow' },
    red:    { icon: '🔴', label: '최소선 미달', cls: 'ps-sr-red'    }
  };

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

  // ─── 렌더 ───────────────────────────────────────────────────────────────────

  function _buildBody(out) {
    const base = out.base;
    const rep  = base.representative;
    if (!rep) return '<div class="ps-sr-empty">계산할 인출 구간이 없습니다.</div>';

    const cons    = out.conservative;
    const consRep = cons ? cons.representative : null;
    const s  = _sig(rep.signal);
    const cs = consRep ? _sig(consRep.signal) : null;
    const cfg = PS_SELF_RELIANCE;

    // 공백기 안내 / O 보정 안내
    const notes = [];
    if (!base.gap.hasGap) {
      notes.push('공백기(1단계) 목표 월 인출액이 설정되지 않아 인출 시작 시점의 단일 목표 기준으로 계산했습니다. O 배당 현금 추정은 적용하지 않았습니다.');
    } else {
      notes.push('공백기 이후 O 배당은 엔진 값 그대로이며 별도 추정에 포함하지 않았습니다.');
      if (base.oShares.source === 'engine') {
        const n = base.oShares.shares != null ? Math.round(base.oShares.shares).toLocaleString() : '?';
        notes.push(`O 배당은 엔진 보유 주수(${n}주, 재투자만 반영) 기준 추정입니다. 엔진은 O 신규 매수를 모델링하지 않으므로 설정 패널 "O(리얼티인컴) 배당"에서 공백기 시작 보유 주수를 입력해 보정하세요.`);
      } else if (base.oShares.source === 'manual') {
        notes.push(`O 배당은 입력한 보유 ${Math.round(base.oShares.shares).toLocaleString()}주 기준 추정입니다(원천징수 후, 보유 주수 고정).`);
      }
    }
    if (!cfg.includeNationalPension) notes.push('국민연금은 분자에서 제외되었습니다.');
    if (out.error) notes.push('⚠️ ' + out.error);

    // 연령별 스냅샷 (기본 / 보수)
    const ageChips = base.rows.map((r, i) => {
      const c = cons && cons.rows[i];
      const rs = _sig(r.signal);
      const cs2 = c ? _sig(c.signal) : null;
      return `<div class="ps-sr-chip">
        <div class="ps-sr-chip-age">${r.age}세 <span class="ps-sr-chip-ym">${r.ym}</span></div>
        <div class="ps-sr-chip-val ${rs.cls}">${rs.icon} ${_pct(r.rateFloor)}</div>
        <div class="ps-sr-chip-sub">보수 ${c ? cs2.icon + ' ' + _pct(c.rateFloor) : '—'}</div>
      </div>`;
    }).join('');

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

    return `
    <div class="ps-sr-main">
      <div class="ps-sr-hero ${s.cls}">
        <div class="ps-sr-hero-icon">${s.icon}</div>
        <div class="ps-sr-hero-body">
          <div class="ps-sr-hero-rate">${_pct(rep.rateFloor)}</div>
          <div class="ps-sr-hero-label">${s.label} · 바닥선 ${_man(cfg.floorMonthly)} 기준</div>
          <div class="ps-sr-hero-sub">${rep.ym} (${rep.age}세) 스냅샷${base.gap.hasGap ? ' · 공백기 대표값' : ''}</div>
        </div>
      </div>

      <div class="ps-sr-kv">
        <div class="ps-sr-kv-row"><span>월 세후 금융소득(명목)</span><b>${_man(rep.income)}</b></div>
        <div class="ps-sr-kv-row ps-sr-kv-sub"><span>└ 엔진 인출 순소득</span><span>${_man(rep.netEngine)}</span></div>
        ${rep.oApplied ? `<div class="ps-sr-kv-row ps-sr-kv-sub"><span>└ O 배당 현금 추정(세후)</span><span>${_man(rep.oEst)}</span></div>` : ''}
        <div class="ps-sr-kv-row"><span>바닥선 필요액(물가 반영)</span><b>${_man(rep.floor)}</b></div>
        <div class="ps-sr-kv-row"><span>목표선 ${_man(cfg.targetMonthly)} 기준 자립률</span><b>${_pct(rep.rateTarget)}</b></div>
        <div class="ps-sr-kv-row"><span>보수 시나리오 <span class="ps-sr-dim">(수익률 ${(cfg.conservative.rateDeltaPP * 100).toFixed(0)}%p · 물가 ${(cfg.conservative.inflationRate * 100).toFixed(1)}%)</span></span>
          <b>${consRep ? cs.icon + ' ' + _pct(consRep.rateFloor) : '—'}</b></div>
      </div>
    </div>

    <div class="ps-sr-section-title">${base.gap.hasGap ? '공백기 연령별 자립률 (바닥선 기준)' : '인출 시작 시점 자립률'}</div>
    <div class="ps-sr-chips">${ageChips}</div>

    <div class="ps-sr-section-title">연금계좌 소진 시점 (기본 / 보수)</div>
    <table class="ps-sr-table">
      <thead><tr><th>계좌</th><th>기본</th><th>보수</th></tr></thead>
      <tbody>${depRows}</tbody>
    </table>

    <div class="ps-sr-section-title">별도 항목 (생활비에 포함하지 않음, ${rep.ym} 기준)</div>
    <div class="ps-sr-kv">
      <div class="ps-sr-kv-row"><span>월 세금</span><span>${_man(rep.tax)}</span></div>
      <div class="ps-sr-kv-row"><span>월 건보료</span><span>${_man(rep.healthInsurance)}</span></div>
      <div class="ps-sr-kv-row"><span>대출 상환</span><span class="ps-sr-dim">미반영</span></div>
    </div>

    <ul class="ps-sr-notes">${notes.map(n => `<li>${n}</li>`).join('')}</ul>`;
  }

  function render() {
    const el = document.getElementById('pension-selfreliance');
    if (!el) return;
    if (typeof PensionSelfReliance === 'undefined' || typeof PensionState === 'undefined') return;

    let inner;
    try {
      const out = PensionSelfReliance.compute(PensionState.params, PensionState.actual, PensionState.result);
      inner = out.base
        ? _buildBody(out)
        : `<div class="ps-sr-empty">${out.error || '계산 결과가 없습니다.'}</div>`;
    } catch (e) {
      console.warn('[PensionSelfRelianceUI] 렌더 실패:', e);
      inner = '<div class="ps-sr-empty">자립률을 계산하지 못했습니다.</div>';
    }

    el.innerHTML = `<div class="ps-card ps-sr-card">
      <div class="ps-card-title">자립률 · 퇴직 가능 최소선 75%</div>
      ${inner}
    </div>`;
  }

  function init() {
    if (typeof PensionState !== 'undefined') {
      PensionState.subscribe(() => render());   // 설정 변경·실적 갱신 시 자동 갱신 (_bindListeners 미사용)
    }
    render();
  }

  return { init, render };

})();
