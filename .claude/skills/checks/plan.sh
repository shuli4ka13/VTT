#!/usr/bin/env bash
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"
base="${1:-HEAD}"
files=$( { git diff --name-only "$base"; git ls-files --others --exclude-standard; } | sort -u)
[ -z "$files" ] && { echo "нет изменённых файлов"; exit 0; }

has() { grep -qE "$1" <<<"$files"; }
systems=()
for f in $(grep -E '^samples/.+\.world\.json$' <<<"$files" || true); do
  [ -f "$f" ] && systems+=("$(node -e "console.log(JSON.parse(require('fs').readFileSync(process.argv[1])).system.name)" "$f")")
done
shared='^apps/web/src/(screens/constructor/(slots\.tsx|keys\.ts|effects/cards/)|ui/formula-field\.tsx)'

echo "Изменено: $(wc -l <<<"$files" | tr -d ' ') файл(ов)"
echo
echo "## Перед «готово» — в фоне"
has '^packages/schema/' && echo "(cd packages/schema && npx vitest run --reporter=dot)"
if has '^packages/engine/' || has '^samples/'; then
  echo "(cd packages/engine && npx vitest run --reporter=dot)"
  echo "(cd packages/engine && GOLDEN=fast npx vitest run tests/golden --reporter=dot)"
fi
has '^apps/server/' && echo "(cd apps/server && npx vitest run --reporter=dot)"
has '^apps/web/' && echo "(cd apps/web && npx vitest run --reporter=dot)"
if has "$shared"; then
  echo "(cd apps/web && ROUND_TRIP=full npx vitest run round-trip --maxWorkers=8 --reporter=dot)   # общий UI конструктора, 15–30 мин"
else
  for s in "${systems[@]+"${systems[@]}"}"; do echo "(cd apps/web && ROUND_TRIP='$s' npx vitest run round-trip --reporter=dot)"; done
fi
if has '^(packages|apps)/'; then echo "make ts-check"; fi
