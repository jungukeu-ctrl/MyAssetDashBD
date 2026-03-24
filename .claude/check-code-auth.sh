#!/bin/bash
# PreToolUse 훅: Edit/Write 계열 도구 실행 전 코드작성 권한 확인
FLAG="/home/user/MyAssetDashBD/.claude/code-authorized"

input=$(cat)
tool=$(echo "$input" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('tool_name',''))" 2>/dev/null)

WRITE_TOOLS="Edit Write MultiEdit NotebookEdit"

if echo "$WRITE_TOOLS" | grep -qw "$tool"; then
  if [ ! -f "$FLAG" ]; then
    echo '{"decision":"block","reason":"⛔ 코드 수정 차단: 현재 메시지에 \"코드작성\" 키워드가 없습니다. 코드 수정을 원하면 메시지에 \"코드작성\"을 포함해 주세요."}'
    exit 0
  fi
fi
