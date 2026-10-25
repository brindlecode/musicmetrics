#!/usr/bin/env bash
# Called by the "report" job of .github/workflows/fetch-data.yml.
# If a step failed or a data store file is getting too big, opens one GitHub
# issue (or comments on the open one) and, for failures, marks the run failed.
#
# Also used by .github/workflows/site-watch.yml (with its own TITLE).
#
# Env: TITLE (optional issue title), OUTCOMES ("Step name=outcome" lines), BIG (files over 80 MB),
#      JOB_STATUS (result of the update job), RUN_URL, GH_TOKEN.
set -uo pipefail

TITLE="${TITLE:-Nightly update needs attention}"
failed=$(printf '%s\n' "${OUTCOMES:-}" | sed -n 's/^\(.*\)=failure$/\1/p')
if [ "${JOB_STATUS:-success}" != "success" ] && [ -z "$failed" ]; then
  failed="The update job ended as \"${JOB_STATUS}\" (cancelled, or over its 120-minute limit)"
fi

if [ -z "$failed" ] && [ -z "${BIG:-}" ]; then
  echo "No problems."
  exit 0
fi

body="Run: ${RUN_URL:-?}  ($(date -u +'%Y-%m-%d %H:%M') UTC)"
if [ -n "$failed" ]; then
  body+=$'\n\n**Failed steps**\n'"$(printf '%s\n' "$failed" | sed 's/^/- /')"
  if printf '%s\n' "$failed" | grep -qx 'Save data store'; then
    body+=$'\n\nThe data store was not saved, so today is missing from the history. The site was still deployed if "Deploy to Netlify" is not listed above.'
  fi
  if printf '%s\n' "$failed" | grep -qx 'Check live site'; then
    body+=$'\n\nmusicmetrics.net was not (or not only) serving our deploy. The errors in the run log say what was wrong and what was restored.'
  fi
fi
if [ -n "${BIG:-}" ]; then
  body+=$'\n\n**Data store files over 80 MB** (GitHub rejects files over 100 MB; split or trim them before they get there)\n```\n'"$BIG"$'\n```'
fi
printf '%s\n' "$body"

if [ -n "${GH_TOKEN:-}" ]; then
  num=$(gh issue list --state open --search "in:title \"$TITLE\"" --json number,title \
        --jq "map(select(.title == \"$TITLE\")) | .[0].number // empty") || num=""
  if [ -n "$num" ]; then
    gh issue comment "$num" --body "$body" || echo "::warning::Could not comment on issue #$num"
  else
    gh issue create --title "$TITLE" --body "$body" || echo "::warning::Could not open an issue"
  fi
fi

if [ -n "$failed" ]; then
  echo "::error::Failed: $(printf '%s\n' "$failed" | paste -sd ', ')"
  exit 1
fi
