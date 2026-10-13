@AGENTS.md

## Claude Code 전용
- 이 셸의 `NODE_OPTIONS`에는 없는 파일을 가리키는 `--require`가 들어 있어서 npm과 node가 바로 실패한다. `env -u NODE_OPTIONS npm …`, `env -u NODE_OPTIONS node …`로 실행한다.
- 라이브러리 코드를 쓰기 전에 `node_modules/<pkg>/**/*.d.ts`를 Read로 확인한다(AGENTS.md 스택 규칙).
