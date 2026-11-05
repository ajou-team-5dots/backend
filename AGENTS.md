# AGENTS.md

AI 코딩 에이전트(Codex 등)를 위한 작업 규칙. 사람용 상세 규칙은 `docs/CONVENTION.md`, `docs/GIT_WORKFLOW.md`에 있고, 이 파일은 그 요약이다. 둘이 다르면 docs가 기준이다.

## 프로젝트

- 팀 5dots의 정보디자인 프로젝트 백엔드
- 주제: 몬스터 밸런스 대시보드. 레벨 디자이너가 의도하지 않은 플레이가 생기는 조건과 전투 상황을 찾도록 돕는다. 판정은 화면이 아니라 사용자가 한다
- 구조(3-tier): Next.js 화면(Vercel) → **이 NestJS 서버(EC2 Docker, 로직)** → ClickHouse(EC2, 같은 VPC 사설망). ClickHouse 8123 포트는 공개하지 않는다
- 화면 repo: `ajou-team-5dots/front-demo`

## 스택

- NestJS 12, TypeScript strict, ESM (`"type": "module"`, 상대 import는 `.js` 확장자)
- Node 26.13.0 (`.nvmrc`), 테스트는 Vitest + supertest
- `@nestjs/config` + zod(환경 변수와 외부 입력 검증), `@clickhouse/client`
- 패키지 매니저: **pnpm만 사용** (npm, yarn 금지)
- **TS 파일을 `node file.ts`로 직접 실행하지 않는다.** Node 26의 기본 TS 실행은 타입만 지우는 방식이라 enum, 생성자 매개변수 속성(`constructor(private readonly x)`), namespace가 동작하지 않는다. 빌드·실행·테스트는 `nest build`(tsc)와 Vitest를 거친다

## 명령어

```bash
pnpm start:dev      # 개발 서버 (watch)
pnpm check          # lint + format:check + typecheck + test + test:e2e. 작업 끝나면 반드시 실행
pnpm build          # dist/ 로 빌드 (nest build)
pnpm start:prod     # 빌드 결과 실행. .env가 있으면 읽는다
pnpm test           # 단위 테스트 (src/**/*.spec.ts)
pnpm test:e2e       # e2e 테스트 (test/**/*.e2e-spec.ts). DB 없이 돈다
pnpm test:db        # 실제 ClickHouse 테스트 (test/db). .env 필요, check와 CI에서는 빠진다. 공유 DB라 가볍게
pnpm lint:fix       # ESLint 자동 수정
pnpm format         # Prettier 적용
```

package.json 스크립트는 Windows와 Mac에서 모두 돌아야 한다. `rm -rf`, `cp`, `export X=` 같은 셸 전용 명령을 쓰지 않는다.

## 코드 규칙 (Airbnb 기반)

1. ESLint(`eslint-config-airbnb-extended`)와 Prettier 설정을 따른다. 규칙을 끄는 `eslint-disable` 주석은 이유 없이 쓰지 않는다
2. 작은따옴표, 세미콜론, trailing comma, 2칸 들여쓰기, 100자
3. `const` 우선, `var` 금지, `===` 사용, 콜백은 화살표 함수
4. named export만 사용. 파일 하나에 클래스 하나
5. 파일명 kebab-case + Nest 접미사(`encounters.controller.ts`, `encounters.service.ts`, `create-x.dto.ts`), 클래스 PascalCase, 상수 UPPER_SNAKE_CASE
6. **`any` 금지** (`unknown` + 좁히기), **객체 타입은 `interface`**, `type`은 유니온/유틸리티에만. `@ts-ignore` 금지
7. `process.env`는 `src/config/`에서만 읽는다(lint 에러). 나머지는 `ConfigService`로 받는다. 새 키는 `src/config/env.schema.ts`, `.env.example`, `docs/ENV.md`에 함께 추가한다

## Nest 모듈 구조 (상세: `docs/CONVENTION.md` 4장, 8장)

```
src/main.ts                 진입점. 앱 생성, 포트
src/app.module.ts           ConfigModule과 기능 모듈을 모으기만 한다
src/config/                 환경 변수 검증 (zod). 키가 없거나 틀리면 시작 시 멈춘다
src/clickhouse/             공유 ClickHouse 클라이언트. ClickHouseService.query(sql, params)
src/common/                 ZodValidationPipe 등 공용 부품
src/<기능>/                 기능 하나 = 모듈 하나 (예: health/, encounters/)
  <기능>.module.ts
  <기능>.controller.ts      HTTP 입출력만. 계산하지 않는다
  <기능>.service.ts         계산과 데이터 접근
  dto/                      외부 입력 DTO (필요할 때만)
test/                       e2e 테스트 (DB 없음), test/db/ 실제 DB 테스트
```

1. 기능마다 모듈을 만들고 `AppModule.imports`에 추가한다
2. controller는 얇게: 입력 받기 → service 호출 → 응답. 계산과 쿼리는 service에
3. service는 화면에 필요한 필드만 담은 객체를 돌려준다. DB 행을 통째로 넘기지 않는다
4. repository 계층은 기본으로 만들지 않는다. service 하나가 300줄을 넘거나 여러 service가 같은 쿼리를 반복하면 그때 나눈다

## DTO와 검증

- **런타임 검증은 외부 입력과 환경 변수에만** 한다: 요청 본문, 쿼리, 경로 매개변수
- 도구는 zod. DTO는 `dto/*.dto.ts`에 스키마와 `z.infer` 타입으로 만들고 `new ZodValidationPipe(schema)`로 씌운다
- 우리 쪽 미리 계산 JSON이나 ClickHouse 응답은 타입(interface)으로 충분하다

## 데이터 규칙 (반드시 지킬 것)

- 운영자 계정(`/su` 사용 계정)은 기본 제외한다
- 채팅 원문, 지갑 주소(`playerId`, `actorId`, `sourceActor`, `targetAddress`)를 응답, 코드, 커밋, 로그 어디에도 노출하지 않는다
- 이탈률·리텐션 지표를 만들지 않는다
- 화면용 조회는 기초 표(`encounters`, `player_deaths`, `ability_events`)와 미리 계산 JSON만 쓴다. 원시 `game_events`는 화면용으로 조회하지 않는다
- ClickHouse 값은 `query_params`(`{name:Type}`)로만 바인딩한다. 문자열을 이어 붙이지 않는다. `readonly` 설정을 보내지 않는다(운영 `api` 계정은 readonly=2)
- DB 오류 원문은 응답에 넣지 않고, 로그에는 오류 종류와 코드만 남긴다
- 비밀번호, 토큰, 호스트, IP는 `.env`에만 둔다(커밋 금지). `.env.example`에는 키 이름만 적는다. 값을 출력하거나 로그에 남기지 않는다

## Git

- 커밋: Conventional Commits, `<type>(<scope>): <제목>`. type은 feat fix docs style refactor perf test build ci chore revert
- 브랜치: `dev`(기본, 통합)에서 `<type>/<이슈번호>-<설명>`을 만들고 PR은 `dev`로. `main`은 배포 브랜치이고 `dev` → `main` 릴리스 PR 또는 `hotfix/*`만 받는다
- `main`, `dev` 직접 push 금지
- 사람이 요청하지 않으면 커밋/푸시/이슈/PR 생성을 하지 않는다

## 이슈와 PR (상세: `docs/ISSUE_PR_GUIDE.md`)

1. **작업 시작 전에 이슈 담당자 지정**: `gh issue edit <번호> --add-assignee @me` (새 이슈는 `--assignee @me`로 생성)
2. 이슈 본문은 `.github/agent-templates/issue-{feature,bug,task}.md`, PR 본문은 `.github/PULL_REQUEST_TEMPLATE.md`를 복사해 채운다
3. 템플릿의 제목 구조는 유지, 안내 주석은 지우고, 모르는 것은 지어내지 말고 "확인 필요"
4. **PR은 `dev`로 연다**: `gh pr create --base dev --body-file <파일>`. 본문에 `Closes #번호` 필수
5. 체크리스트는 실제로 실행해 통과한 것만 체크
6. 위 규칙은 CI `pr-rules`가 검사한다 (제목 형식, 브랜치 방향, 이슈 연결, 이슈 담당자)
7. 릴리스(`dev` → `main`)는 사용자가 요청할 때만, `.github/agent-templates/release.md`로

## 작업 완료 기준

1. `pnpm check` 통과
2. `pnpm build` 통과
3. 새 의존성을 추가했다면 이유를 PR 본문에 적는다
