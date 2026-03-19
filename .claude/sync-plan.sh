#!/bin/bash
# PLAN.md 자동 동기화
# Stop 훅에서 호출: PLAN.md 변경 시 현재 브랜치 커밋 → main 동기화

REPO=$(git rev-parse --show-toplevel 2>/dev/null) || exit 0
cd "$REPO" || exit 0

[ -f PLAN.md ] || exit 0

BRANCH=$(git rev-parse --abbrev-ref HEAD 2>/dev/null)
[ -z "$BRANCH" ] || [ "$BRANCH" = "HEAD" ] && exit 0

# PLAN.md 미수정 시 조기 종료
git diff --quiet PLAN.md 2>/dev/null && git diff --cached --quiet PLAN.md 2>/dev/null && exit 0

# 현재 브랜치에 PLAN.md 커밋
git add PLAN.md
git commit -m "docs: PLAN.md 업데이트" || exit 0

# 현재 브랜치 push
git push -u origin "$BRANCH" 2>/dev/null || true

# main 브랜치 PLAN.md 동기화 (feature 브랜치인 경우)
if [ "$BRANCH" != "main" ]; then
  git stash -q 2>/dev/null || true
  git fetch origin main -q 2>/dev/null || true

  if git checkout main -q 2>/dev/null; then
    git pull origin main -q 2>/dev/null || true
    # feature 브랜치의 PLAN.md를 main에 적용
    git checkout "$BRANCH" -- PLAN.md 2>/dev/null

    if ! git diff --cached --quiet PLAN.md 2>/dev/null; then
      git commit -m "docs: main PLAN.md 동기화 (from $BRANCH)" || true
      git push origin main 2>/dev/null || true
    fi

    git checkout "$BRANCH" -q 2>/dev/null
  fi

  git stash pop -q 2>/dev/null || true
fi
