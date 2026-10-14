#!/bin/bash
# PLAN.md 자동 커밋
# Stop 훅에서 호출: PLAN.md에 미커밋 변경이 있으면 현재 세션 브랜치에만 커밋·push
# main으로의 push/checkout/merge/rebase는 하지 않는다. main 반영은 PR 머지로만 이루어진다.

REPO=$(git rev-parse --show-toplevel 2>/dev/null) || exit 0
cd "$REPO" || exit 0

[ -f PLAN.md ] || exit 0

BRANCH=$(git rev-parse --abbrev-ref HEAD 2>/dev/null)
[ -z "$BRANCH" ] || [ "$BRANCH" = "HEAD" ] && exit 0

# PLAN.md 미수정 시 조기 종료
git diff --quiet PLAN.md 2>/dev/null && git diff --cached --quiet PLAN.md 2>/dev/null && exit 0

# main 브랜치에서는 아무 것도 하지 않고 경고만 출력
if [ "$BRANCH" = "main" ]; then
  echo "⚠️ main 브랜치: PLAN.md 자동 커밋 생략 (세션 브랜치에서 작업 후 PR로 머지)" >&2
  exit 0
fi

# 현재 세션 브랜치에 PLAN.md만 커밋 (다른 staged 파일은 포함하지 않음)
git add PLAN.md
git commit -q -m "docs: PLAN.md 업데이트" -- PLAN.md || exit 0

# 현재 브랜치에만 push
git push -u origin "$BRANCH" 2>/dev/null || echo "⚠️ $BRANCH push 실패 (PLAN.md는 로컬 커밋됨)" >&2
