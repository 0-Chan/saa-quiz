# saa-cli

AWS SAA 시험 대비용 로컬 문제 풀이 CLI입니다. 직접 등록하거나 번들로 불러온 객관식 문제를 풀고, 답과 함께 **확신도**를 고르면 확신도 기반 채점(CBM) 규칙으로 XP를 받습니다. LLM은 쓰지 않고, 모든 기록은 로컬 md 파일로 남습니다.

## 설치
```bash
npm install
npm run build
npm link        # 이후 어디서든 `saa` 명령 사용
```
Node.js 20 이상이 필요합니다.

## 사용법
| 명령 | 설명 |
|---|---|
| `saa add` | 에디터(`$VISUAL` 또는 `$EDITOR`, 없으면 vim)가 열립니다. 템플릿을 채우고 저장한 뒤 닫으면 문제가 등록됩니다. 입력이 잘못되면 이유를 보여주고 같은 내용으로 에디터를 다시 엽니다. 아무것도 쓰지 않고 닫으면 취소됩니다. |
| `saa quiz` | 문제를 풉니다. 순서는 안 푼 문제 → 마지막에 틀린 문제 → 오래전에 푼 문제입니다. 답을 고르고 확신도를 선택하면 결과와 XP가 표시됩니다. Ctrl+C를 누르면 그때까지 저장된 기록만 남기고 종료합니다. |
| `saa xp` | 누적 XP, 오늘 얻은 XP, 문제 수, 총 시도 수, 데이터 폴더를 보여줍니다. |

add 템플릿 예시:
```
## 문제
Which AWS service provides shared NFS storage for many EC2 instances?

## 선택지
A. Amazon S3
B. Amazon EFS
C. Amazon EBS
D. Instance store

## 정답
B            ← 복수 정답은 "A, B" 또는 "A B"

## 해설 (선택)
EFS is a regional NFS file system.
```
선택지는 `A.` 또는 `A)`로 시작합니다. 괄호로 된 안내문 줄과 비워 둔 선택지 줄은 무시됩니다.

## 기본 문제 (선택)
이 저장소에는 문제 데이터가 들어 있지 않습니다. `saa add`로 직접 등록하거나, 가진 문제 번들이 있으면 처음 실행할 때 자동으로 불러올 수 있습니다.

```bash
export SAA_SEED_FILE=/path/to/seed.json   # 로컬 파일
export SAA_SEED_URL='https://…'           # 또는 URL (예: 비공개 S3 객체의 presigned URL)
saa quiz                                   # 문제 폴더가 비어 있으면 번들을 불러온 뒤 시작
```
- 번들 형식: `{"questions": [{"id", "stem", "options": {"A": …}}], "answers": [{"id", "answer": ["B"], "confidence": "high|medium|low", "rationale_ko"}]}`. 확신도 `low`는 건너뛰고, 해설에는 `rationale_ko`가 들어갑니다.
- 문제가 하나라도 있으면 다시 불러오지 않습니다. 받지 못하면(URL 만료 등) 경고만 보여주고 계속합니다.
- 비공개 S3에 번들을 두었다면 `SAA_SEED_BUCKET=<버킷> scripts/seed-url.sh`로 presigned URL(기본 7일)을 새로 만듭니다. URL은 커밋하거나 공개하지 마세요.

## XP 규칙 (CBM)
| 확신도 | 정답 | 오답 |
|---|---|---|
| 확실 (80% 이상) | +3 | −6 |
| 애매 (67~80%) | +2 | −2 |
| 자신 없음 (67% 미만) | +1 | 0 |

- 복수 정답 문제는 정답을 모두 정확히 골라야 정답입니다.
- 같은 문제는 하루(로컬 날짜)에 첫 시도만 XP에 반영됩니다. 그 뒤의 시도도 기록은 됩니다.
- 누적 XP가 10, 30, 60, 100, 150, … (5n(n+1))에 도달하면 터미널에 콘페티가 1초쯤 터집니다.
- 누적 XP가 −10, −30, −60, …까지 떨어지면 0점으로 리셋할지 묻습니다. 점수마다 처음 한 번만 묻습니다.
- XP는 따로 저장하지 않고, 매번 문제 파일의 시도 기록에서 다시 계산합니다. 누적 XP는 음수가 될 수 있습니다.

## 데이터
- 위치는 `$SAA_DATA_DIR`이고, 없으면 `~/saa-cli`를 씁니다. 문제는 `questions/<id>.md`에 하나씩 저장됩니다.
- frontmatter에 `id`, `createdAt`, `choices`, `answer`, `attempts`가 있고, 본문에 `## 문제`와 `## 해설`이 있습니다. 직접 편집해도 됩니다. 형식이 깨진 파일은 경고 한 줄을 보여주고 건너뜁니다.
- XP 리셋 기록은 데이터 폴더의 `xp-resets.md`에 남습니다(물어본 점수, 리셋 때 더한 XP).
- `id`는 지문, 선택지, 정답의 해시(sha256 앞 8자리)입니다. 같은 내용을 다시 등록하면 "이미 등록된 문제"로 막힙니다.

## 개발
```bash
npm run dev -- quiz                               # tsx로 바로 실행
npm run typecheck && npm test                     # 작업을 끝내기 전 게이트
SAA_DATA_DIR=$(mktemp -d) npm run dev -- add      # 실제 데이터와 격리해서 테스트
```
규칙과 명세는 `AGENTS.md`, v0.1 구현 계획은 `docs/plans/saa-cli-v0.1.md`에 있습니다.
