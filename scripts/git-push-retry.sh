#!/usr/bin/env bash
# 并发推 main 时非快进被拒：pull --rebase 后重试，最多 5 次。
# 默认冲突 abort；GIT_PUSH_RETRY_STRATEGY=theirs 时用 -X theirs（rebase 中 theirs=正在重放的本地提交）。
# 不 --force。
set -euo pipefail

MAX_ATTEMPTS="${GIT_PUSH_RETRY_MAX:-5}"
BRANCH="$(git rev-parse --abbrev-ref HEAD)"
REMOTE="${GIT_PUSH_RETRY_REMOTE:-origin}"
STRATEGY="${GIT_PUSH_RETRY_STRATEGY:-}"

# 第 1..N-1 次失败后的等待基数（秒）；可用 GIT_PUSH_RETRY_DELAYS="0 0 0 0" 缩短测试
if [[ -n "${GIT_PUSH_RETRY_DELAYS:-}" ]]; then
  # shellcheck disable=SC2206
  DELAYS=(${GIT_PUSH_RETRY_DELAYS})
else
  DELAYS=(5 10 20 30)
fi

jitter_sleep() {
  local base="$1"
  local jitter=0
  if [[ "$base" -gt 0 ]]; then
    # 0..floor(base/4) 随机抖动
    jitter=$((RANDOM % (base / 4 + 1)))
  fi
  local total=$((base + jitter))
  if [[ "$total" -gt 0 ]]; then
    echo "git-push-retry: sleeping ${total}s before rebase/retry" >&2
    sleep "$total"
  fi
}

abort_rebase_if_needed() {
  if [[ -d "$(git rev-parse --git-path rebase-merge)" ]] || [[ -d "$(git rev-parse --git-path rebase-apply)" ]]; then
    git rebase --abort
  fi
}

pull_rebase() {
  # rebase 时 -X theirs = 正在重放的本地提交（本次新数据），与旧工作流 git rebase -X theirs origin/main 一致
  if [[ "$STRATEGY" == "theirs" ]]; then
    echo "git-push-retry: git pull --rebase -X theirs --no-edit ${REMOTE} ${BRANCH}" >&2
    git pull --rebase -X theirs --no-edit "$REMOTE" "$BRANCH"
  else
    echo "git-push-retry: git pull --rebase --no-edit ${REMOTE} ${BRANCH}" >&2
    git pull --rebase --no-edit "$REMOTE" "$BRANCH"
  fi
}

attempt=1
while [[ "$attempt" -le "$MAX_ATTEMPTS" ]]; do
  echo "git-push-retry: attempt ${attempt}/${MAX_ATTEMPTS} (branch=${BRANCH} strategy=${STRATEGY:-abort})" >&2
  if git push "$@"; then
    echo "git-push-retry: push succeeded on attempt ${attempt}" >&2
    exit 0
  fi

  if [[ "$attempt" -ge "$MAX_ATTEMPTS" ]]; then
    echo "git-push-retry: ERROR push failed after ${MAX_ATTEMPTS} attempts" >&2
    exit 1
  fi

  delay_idx=$((attempt - 1))
  if [[ "$delay_idx" -lt "${#DELAYS[@]}" ]]; then
    jitter_sleep "${DELAYS[$delay_idx]}"
  else
    jitter_sleep "${DELAYS[-1]}"
  fi

  if ! pull_rebase; then
    echo "git-push-retry: ERROR rebase failed (likely conflict on shared files); aborting without force" >&2
    abort_rebase_if_needed
    exit 1
  fi

  attempt=$((attempt + 1))
done

echo "git-push-retry: ERROR exhausted retries" >&2
exit 1
