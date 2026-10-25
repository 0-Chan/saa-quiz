---
name: release
description: saa-quiz 새 버전을 릴리스한다(버전·CHANGELOG, 커밋·annotated 태그·push, CI, GitHub Release, npm Trusted Publishing 확인).
argument-hint: <X.Y.Z>
disable-model-invocation: true
---

# saa-quiz 릴리스

인자: 새 버전 `$ARGUMENTS` (예: `0.4.5`). 아래에서 `X.Y.Z`는 새 버전, `PREV`는 직전 태그의 버전이다.

이 셸에서 npm·node가 `MODULE_NOT_FOUND`(`restore-node-options.cjs`)로 실패하면 명령 앞에 `env -u NODE_OPTIONS`를 붙인다(CLAUDE.md).

## 최초 전환

- **0.4.4는 수동 게시, 0.4.5는 첫 자동 게시**다. 0.4.4를 아직 게시하지 않았다면 사용자가 기존 0.4.4 폴더의 별도 터미널에서 `npm publish`를 실행한다. 패스키 승인이 필요하므로 에이전트 셸에서 대신 실행하지 않는다. 전환 작업은 별도 작업트리에서 진행하고, 0.4.4 게시 전에는 기존 폴더를 변경하지 않는다.
- workflow를 main에 반영하고 CI를 통과시킨 뒤, 첫 자동 게시 직전에 npm 패키지 Settings의 Trusted Publisher에 다음을 등록한다. Provider: GitHub Actions, Organization or user: `0-Chan`, Repository: `saa-quiz`, Workflow filename: `publish.yml`(경로 제외), Environment: 비움. **직접 `npm publish`를 허용**하도록 설정한다. 기본 staging 설정만으로는 이 워크플로가 게시할 수 없다.
- 새 Trusted Publisher는 등록 후 2일 이내에 첫 게시를 성공시켜야 한다. 실제 게시할 준비가 됐을 때 등록하고 만료되었다면 다시 등록한다. `NPM_TOKEN`은 추가하지 않는다. 패키지 설정은 [npm 공식 문서](https://docs.npmjs.com/trusted-publishers/)를 따른다.
- npm 계정 설정 완료와 0.4.4 게시 확인 후 0.4.5 Release를 게시한다. `npm whoami`나 dry-run 성공은 OIDC 게시 성공의 증거가 아니다.

## 0. 사전 확인

- 인자가 안정 버전 `X.Y.Z` 형식인가. 비어 있으면 `npm view saa-quiz version`과 CHANGELOG의 `## [Unreleased]`를 보고 버전을 제안한다. 버그 수정·문서·릴리스 자동화는 패치, 기능 추가·채점 규칙 변경은 마이너다.
- 릴리스할 때는 main이 최신이고 작업트리가 깨끗해야 한다. 별도 구현 브랜치는 검토와 CI를 마친 뒤 main에 합친다.
- `npm view saa-quiz version --prefer-online`보다 새 버전이 큰지, 로컬과 원격에 `vX.Y.Z`가 없는지 확인한다.
- CHANGELOG에 `## [Unreleased]`가 없으면 `git log vPREV..HEAD --oneline`을 보고 사용자 관점의 변경 항목을 작성한다. 이미 승인된 변경 범위와 버전이면 재확인을 요구하지 않는다. 범위가 불명확할 때만 질문한다.

## 1. 버전과 CHANGELOG

```bash
npm version X.Y.Z --no-git-tag-version
```

`package.json`, `package-lock.json`과 함께 `src/meta.ts`의 `VERSION`도 바꾼다. `## [Unreleased]`는 `## [X.Y.Z] - YYYY-MM-DD`로 바꾸고 아래 비교 링크를 추가한다.

```markdown
[X.Y.Z]: https://github.com/0-Chan/saa-quiz/compare/vPREV...vX.Y.Z
```

## 2. 검사와 push

```bash
npm run typecheck
npm test
npm run build
npm run check:release
```

`check:release`는 package·lockfile·meta·CLI 버전, 실행 권한, 실제 tarball의 파일 목록과 설치된 CLI를 검사한다. 빌드 JS와 `package.json`, `README.md`, `LICENSE`, `CHANGELOG.md`만 허용한다. 테스트용 임시 데이터로 단일·복수 선택, 돌아가기, 오답 선택지 보기, EOF, 저장을 확인한다. 실제 문제 데이터는 사용하지 않는다.

변경 파일을 검토해 필요한 파일만 stage하고 다음을 실행한다.

```bash
git commit -m "Release X.Y.Z"
git tag -a vX.Y.Z -m "vX.Y.Z"
git push origin main --follow-tags
```

push가 `403 … denied to 0Chan-smc`면 gh 활성 계정 문제다. 계정을 직접 바꾸지 말고 사용자에게 `gh auth switch -u 0-Chan`을 부탁한 뒤 다시 push한다.

## 3. main CI 확인

`gh run list --workflow ci.yml --branch main --commit <릴리스 커밋 SHA>`로 실행을 찾고 `gh run watch <run-id> --exit-status`로 성공을 기다린다. 다른 커밋의 성공을 대신 사용하지 않는다. CI는 Node 22.12.0과 24에서 설치·타입 검사·테스트·빌드·tarball 설치 검사를 실행한다.

## 4. GitHub Release 게시

해당 커밋의 CI가 성공하면 CHANGELOG의 버전 항목 본문을 임시 파일에 저장하고 아래처럼 전달한다. 인용문과 줄바꿈이 셸에서 해석되지 않도록 `--notes-file`을 쓴다.

```bash
gh release create vX.Y.Z --verify-tag --title "vX.Y.Z" --notes-file <노트 파일>
```

정식 Release의 `published` 이벤트가 자동 게시 트리거다. draft·prerelease는 게시하지 않으며, 워크플로가 추가되기 전에 만들어진 기존 Release가 소급 실행되지는 않는다. 버전은 태그와 일치하고 태그는 annotated여야 하며 해당 커밋이 main 이력에 포함되어야 한다.

## 5. 자동 게시와 완료 확인

- 같은 태그·커밋의 `Publish to npm` 실행을 찾고 성공할 때까지 확인한다. Node 22.12.0/24 검증 이후 게시 job만 `id-token: write` 권한을 갖는다. GitHub 호스팅 runner의 Node 24와 npm 11을 사용하며 npm 캐시와 장기 토큰은 사용하지 않는다.
- 게시 job에서 새로 빌드한 tarball을 실제 설치해 검사하고 **그 파일 그대로** 게시한다. tarball 게시에는 `prepublishOnly`가 실행되지 않으므로 워크플로가 테스트·빌드·검사를 명시적으로 담당한다. `prepublishOnly` 자체는 수동 게시 보호용으로 유지한다.
- 이미 같은 버전이 있으면 tarball integrity를 비교한다. 같은 파일이면 업로드를 생략하고 후속 검증만 다시 실행하며, 다른 파일이면 실패한다. 기존 버전이나 태그를 덮어쓰지 않는다.
- 게시 후 최대 2분 동안 레지스트리 반영을 확인한다. 버전과 integrity, provenance에 기록된 tarball·저장소·워크플로·태그·커밋을 비교하고 레지스트리에서 정확한 버전을 임시 설치해 CLI를 다시 검사한다. 신규 게시라면 `latest`도 확인한다.
- 실패하면 로그를 보고 같은 실행을 재실행할 수 있다. 태그를 이동하거나 npm 토큰·수동 게시로 자동 우회하지 않는다. 이미 게시된 경우 새 버전이 필요한 변경인지 판단한다.
- 최종 보고에 GitHub Release, CI와 게시 실행, npm 버전 링크와 검사 결과를 넣는다. dry-run만 성공했다면 게시 완료라고 쓰지 않는다.
