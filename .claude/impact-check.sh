#!/bin/bash
# PreToolUse hook: JS/HTML 파일 수정 전 웹 영향도 체크리스트 주입
INPUT=$(cat)
FILE=$(echo "$INPUT" | jq -r '.tool_input.file_path // ""')

# .js / .html 파일이 아니면 무시
if [[ "$FILE" != *.js && "$FILE" != *.html ]]; then
  exit 0
fi

BASENAME=$(basename "$FILE")

cat <<EOF
{
  "hookSpecificOutput": {
    "hookEventName": "PreToolUse",
    "additionalContext": "⚠️ [${BASENAME} 수정 전 — 웹 영향도 체크리스트 필수 확인]\n\n【eval[] 체인 영향】\n  eval[0,1,3,5] 변경 시 → _hasToss 플래그 확인\n  _evalWithToss() 변경 시 → _hasToss=true 조기반환 경로 확인\n  _investWithToss() 변경 시 → 투자금 합산 로직 확인\n\n【렌더 함수 직접 참조 확인】\n  renderKiwoom()     : latest.eval[i] 직접 참조 (toss 미포함 raw값)\n  updateTotals()     : kiHasToss 분기 + ev[] 합산 → 총자산 영향\n  renderAll()        : eval[3] 개인연금 toss 합산 → 카드 표시 영향\n  updateBarChart()   : evalData = latest.eval[] 직접 참조\n  updateLineChart()  : _evalWithToss() 경유\n  updateReturnChart(): _evalWithToss() + _investWithToss() 경유\n\n【엑셀 내보내기 확인】\n  exportMonthlyXlsx(): evalRows(toss미포함) vs evalTossRows(toss포함) 분리 로직\n\n→ 위 함수 중 영향받는 항목을 명시한 후 수정 진행할 것"
  }
}
EOF
