#!/bin/bash
# UserPromptSubmit 훅: 사용자 메시지에 "코드작성" 포함 시 플래그 생성, 아니면 삭제
FLAG="/home/user/MyAssetDashBD/.claude/code-authorized"

input=$(cat)
message=$(echo "$input" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('prompt',''))" 2>/dev/null)

if echo "$message" | grep -q "코드작성"; then
  touch "$FLAG"
else
  rm -f "$FLAG"
fi
