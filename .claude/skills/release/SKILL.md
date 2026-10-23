---
name: release
description: saa-quiz 새 버전을 릴리스한다(버전 올리기, CHANGELOG, 커밋·태그·push, GitHub release). npm publish는 사용자가 별도 터미널에서 한다.
argument-hint: <X.Y.Z>
disable-model-invocation: true
---

# saa-quiz 릴리스

인자: 새 버전 `$ARGUMENTS` (예: `0.4.3`). 아래에서 `X.Y.Z`는 새 버전, `PREV`는 직전 태그의 버전이다.

이 셸에서 npm·node가 `MODULE_NOT_FOUND`(`restore-node-options.cjs`)로 실패하면 명령 앞에 `env -u NODE_OPTIONS`를 붙인다(CLAUDE.md).

## 0. 사전 확인 — 하나라도 어긋나면 멈추고 사용자에게 보고한다
- 인자가 `X.Y.Z` 형식인가. 비어 있으면 `npm view saa-quiz version`과 CHANGELOG의 `## [Unreleased]`를 보고 버전을 제안한 뒤 묻는다. 버그 수정·문서 → 패치(0.4.2 → 0.4.3), 기능 추가·채점 규칙 변경 → 마이너(0.4.x → 0.5.0).
- `git branch --show-current`가 `main`이고 `git status --short`가 비어 있는가.
- `npm view saa-quiz version --prefer-online`보다 `X.Y.Z`가 큰가. `git tag -l vX.Y.Z`가 비어 있는가.
- `CHANGELOG.md`에 `## [Unreleased]`가 있는가. 없으면 `git log vPREV..HEAD --oneline`으로 항목 초안(`### 추가` / `### 변경`, 사용자 관점 한국어 한 줄씩)을 만들어 보여주고 확인받은 뒤 `## [Unreleased]`로 넣는다.

## 1. 버전 올리기 (두 곳)
```bash
npm version X.Y.Z --no-git-tag-version   # package.json, package-lock.json
```
`src/meta.ts`의 `export const VERSION = "PREV";`를 `"X.Y.Z"`로 바꾼다. `saa --version`과 새 버전 알림이 이 값을 쓴다.

## 2. CHANGELOG
- `## [Unreleased]` → `## [X.Y.Z] - YYYY-MM-DD`(오늘 날짜).
- 맨 아래 링크 목록의 맨 위에 추가: `[X.Y.Z]: https://github.com/0-Chan/saa-quiz/compare/vPREV...vX.Y.Z`

## 3. 검사 → 커밋 → 태그 → push
```bash
npm run typecheck && npm test
git add -A && git commit -m "Release X.Y.Z"
git tag -a vX.Y.Z -m "vX.Y.Z"
git push origin main --follow-tags
```
push가 `403 … denied to 0Chan-smc`면 gh 활성 계정 문제다. 계정을 직접 바꾸지 말고 사용자에게 `! gh auth switch -u 0-Chan`을 부탁한 뒤 다시 push한다.

## 4. GitHub release
노트는 CHANGELOG의 `## [X.Y.Z]` 항목 본문(제목 줄 제외)을 그대로 쓴다.
```bash
notes=$(awk '/^## \[X.Y.Z\]/{f=1;next} /^## \[/{f=0} f' CHANGELOG.md)
gh release create vX.Y.Z --title "vX.Y.Z" --notes "$notes"
```

## 5. npm publish 안내 — 여기서 멈춘다
사용자에게 **별도 터미널에서** 실행하라고 안내한다.
```bash
cd ~/workspace/saa-quiz && npm publish
```
- Claude Code의 `!`로 실행하면 패스키 승인을 기다리지 못해 `EOTP`로 실패한다.
- `404 Not Found - PUT`이면 npm 로그인이 만료된 것이다(`npm login` 후 다시).
- 성공하면 마지막 줄이 `+ saa-quiz@X.Y.Z`다. `prepublishOnly`가 test와 build를 다시 돌린다.

## 6. publish 후 확인 (사용자가 했다고 하면)
- 레지스트리 반영에 30초~2분이 걸린다. `npm view saa-quiz@X.Y.Z version --prefer-online`이 나올 때까지 몇 초 간격으로 확인한다(최대 2분).
- `npm i -g saa-quiz@X.Y.Z --prefer-online` 후 `saa --version`이 `X.Y.Z`인지 확인하고 보고한다.
