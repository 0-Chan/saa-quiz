# saa-cli v0.1 구현 계획

지속 규칙(범위, 형식, XP, 흐름, 구조, 품질)은 루트 `AGENTS.md`에 있다. 이 문서는 v0.1을 처음 구현할 때만 쓰는 지시와 완료 기준이다.

## 역할
Node.js/TypeScript CLI 개발자로서 `AGENTS.md`의 명세대로 saa-cli 첫 버전(v0.1)을 만든다.

## 구현 단계
각 단계가 끝날 때마다 `npm run typecheck`와 `npm test`를 통과시킨 뒤 다음 단계로 넘어간다.

1. **프로젝트 뼈대, paths, hash**
   - `package.json`(ESM, bin, scripts: dev/build/typecheck/test), `tsconfig.json`, 의존성 설치
   - 설치한 뒤 각 라이브러리의 `.d.ts`를 열어 실제 API 시그니처를 확인한다(AGENTS.md의 스택 규칙).
   - `src/paths.ts`, `src/util/hash.ts`와 그 테스트
2. **템플릿 파싱과 테스트:** `src/parse/template.ts`
3. **store와 테스트:** `src/store/questions.ts`. 임시 디렉터리에서 저장 → 읽기 → attempt 추가 왕복, 깨진 파일 건너뛰기.
4. **XP 계산과 테스트:** `src/xp.ts`
5. **add 흐름:** `src/flows/add.ts`
6. **quiz 흐름:** `src/flows/quiz.ts`
7. **xp 명령, README:** `src/flows/xp.ts`, `README.md`

## 완료 기준 (done_when)
- `npm run build` 후 `node dist/cli.js --help`를 실행하면 세 명령이 보인다.
- `saa add`로 단일 정답 문제와 복수 정답 문제를 등록하면 `questions/`에 md 파일이 생긴다. 잘못된 입력에는 이유와 함께 에디터가 다시 열린다.
- `saa quiz`에서 확신도별로 CBM 배점대로 XP가 계산되고, 같은 날 같은 문제를 다시 풀면 XP가 0이다.
- `saa xp`가 보여주는 누적 XP가 파일의 attempts로 다시 계산한 값과 같다.
- `questions/`의 파일을 손으로 망가뜨려도 quiz와 xp가 경고만 보여주고 계속 동작한다.

## 원 명세에서 확정한 결정 (2026-10-12)
| 항목 | 결정 | 이유 |
|---|---|---|
| 날짜 저장 | `createdAt`, `attempts[].at`을 **따옴표로 감싼** 로컬 ISO 문자열로 쓴다. 읽을 때 Date가 들어와도 문자열로 정규화한다. | gray-matter가 쓰는 YAML 파서는 따옴표 없는 ISO 시간을 `Date`로 읽는다. 그러면 다시 저장할 때 오프셋이 UTC로 바뀌고, 문자열만 받는 스키마는 검증에 실패한다. |
| id 범위 | 지문, 선택지, **정답**을 함께 해시한다. | 정답만 바꿔 다시 등록하는 것을 허용하기 위해서다(사용자 결정). |
| 템플릿 안내문 | `(예: …)`처럼 괄호로 된 안내문 줄과, 라벨만 있고 내용이 빈 선택지 줄은 무시한다. | 템플릿에 미리 채워진 줄 때문에 "모든 칸이 비면 취소" 판정이 깨지는 것을 막는다. |

## 실행 환경 메모
- 이 Mac의 셸에는 `NODE_OPTIONS`에 없는 파일을 가리키는 `--require`가 들어 있어서, `npm`이 바로 실패한다. `env -u NODE_OPTIONS npm …`으로 실행한다.
- `EDITOR`와 `VISUAL`이 설정돼 있지 않다. 수동으로 테스트할 때는 `EDITOR=vi` 등으로 지정한다.
- `saa add`와 `saa quiz`는 대화형이라 자동 테스트하기 어렵다. 자동 검증은 순수 함수와 store 테스트로 하고, 대화형 흐름은 `SAA_DATA_DIR=$(mktemp -d)`로 데이터를 격리해 수동으로 확인한다.
