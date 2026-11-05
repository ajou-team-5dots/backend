# 코드 컨벤션

이 저장소는 [Airbnb JavaScript Style Guide](https://github.com/airbnb/javascript)를 기준으로 한다. 화면 repo(`front-demo`)와 같은 규칙에서 React/Next.js 부분만 뺐다. 사람이 외우지 않아도 되도록 대부분은 도구가 강제한다.

| 도구                                     | 역할                                     | 설정 파일                  |
| ---------------------------------------- | ---------------------------------------- | -------------------------- |
| ESLint + `eslint-config-airbnb-extended` | Airbnb 규칙 (JS, TypeScript, Node)       | `eslint.config.mjs`        |
| Prettier                                 | 포맷 (따옴표, 줄바꿈)                    | `.prettierrc.json`         |
| husky + lint-staged                      | 커밋 전 변경 파일 자동 lint/format       | `.husky/pre-commit`        |
| commitlint                               | 커밋 메시지 형식 검사                    | `commitlint.config.mjs`    |
| Vitest + supertest                       | 단위 테스트(`src/`), e2e 테스트(`test/`) | `vitest.config*.ts`        |
| GitHub Actions                           | PR마다 `pnpm check` + `pnpm build`       | `.github/workflows/ci.yml` |

PR 올리기 전에 `pnpm check` 하나만 통과시키면 된다 (lint, format:check, typecheck, test, test:e2e).

## 1. 포맷 (Prettier가 처리)

- 작은따옴표 `'`
- 세미콜론 사용, trailing comma `all`
- 들여쓰기 2칸, 한 줄 최대 100자
- 줄 끝은 LF. Windows에서도 `.gitattributes`(`* text=auto eol=lf`)와 `.editorconfig`가 LF로 맞춘다

## 2. Airbnb 핵심 규칙 (ESLint가 처리)

- `var` 금지, 기본은 `const`, 재할당할 때만 `let`
- 콜백은 화살표 함수
- 객체/배열은 리터럴과 구조 분해 사용
- `==` 금지, `===` 사용
- 사용하지 않는 변수, import 금지
- 파일 하나에 클래스 하나 (`max-classes-per-file`). DTO도 파일을 나눈다
- import 순서: 외부 패키지 → 상대 경로

## 3. 팀 예외 규칙

Airbnb 원칙과 NestJS 관례가 충돌하는 곳만 끈다. 새 예외를 추가하면 이 표에 이유를 적는다.

| 규칙                                                                      | 상태 | 이유                                                                                                    |
| ------------------------------------------------------------------------- | ---- | ------------------------------------------------------------------------------------------------------- |
| `import-x/prefer-default-export`                                          | off  | Nest 파일은 이름 있는 클래스 하나(`XxxModule` 등)를 내보내고 `@Module()`에서 그 이름으로 가져온다       |
| `class-methods-use-this`                                                  | off  | Nest가 controller·provider 메서드를 DI 인스턴스에서 호출한다. `this`를 안 써도 인스턴스 메서드여야 한다 |
| `import-x/no-extraneous-dependencies` (`test/**`, `*.spec.ts`, 설정 파일) | 완화 | 테스트와 도구 설정은 개발 때만 돌므로 devDependencies에서 가져와도 된다                                 |
| `@typescript-eslint/no-explicit-any`                                      | 강화 | `any`를 쓰면 그 지점부터 타입 검사가 꺼진다. `unknown`으로 받고 좁힌다                                  |
| `n/no-process-env` (`src/main.ts`, `src/config/**` 밖)                    | 강화 | 환경 변수는 진입점과 설정 모듈에서만 읽고 나머지는 DI로 받는다                                          |

DI 생성자(`constructor(private readonly service: XService) {}`)는 airbnb-extended의 TypeScript 설정이 이미 허용하므로 `no-useless-constructor`는 끄지 않았다. 데코레이터(`@Controller`, `@Body` 등)도 현재 규칙과 충돌하지 않는다.

## 4. 폴더 구조

```
src/
  main.ts              # 진입점. 앱 생성, 포트
  app.module.ts        # 기능 모듈을 모으기만 한다
  health/              # GET /health
  <feature>/           # 기능 하나 = 모듈 하나
    <feature>.module.ts
    <feature>.controller.ts
    <feature>.controller.spec.ts
    <feature>.service.ts
    dto/               # 외부 입력 DTO (필요할 때만)
  config/              # 환경 변수 읽기 (생기면)
test/                  # e2e 테스트 (*.e2e-spec.ts)
```

## 5. 네이밍

| 대상            | 규칙                        | 예시                                      |
| --------------- | --------------------------- | ----------------------------------------- |
| 파일            | kebab-case + Nest 접미사    | `encounters.service.ts`, `query-x.dto.ts` |
| 클래스          | PascalCase + 역할 접미사    | `EncountersService`, `QueryXDto`          |
| 함수/변수       | camelCase                   | `getEncounterSummary`                     |
| 상수            | UPPER_SNAKE_CASE            | `DEFAULT_PORT`                            |
| 타입/인터페이스 | PascalCase, `I` 접두사 금지 | `EncounterSummary`                        |
| 단위 테스트     | 대상 파일 옆 `*.spec.ts`    | `health.controller.spec.ts`               |
| e2e 테스트      | `test/` 안 `*.e2e-spec.ts`  | `test/health.e2e-spec.ts`                 |

## 6. NestJS

- 기능마다 모듈을 만들고 `AppModule.imports`에 추가한다
- controller는 HTTP 입출력만: 입력 받기 → service 호출 → 응답. 계산과 쿼리는 service에
- 의존성은 생성자 주입: `constructor(private readonly encountersService: EncountersService) {}`
- ESM이라 상대 import에 `.js`를 붙인다: `import { HealthModule } from './health/health.module.js';`
- **TS 파일을 `node file.ts`로 직접 실행하지 않는다.** Node 26의 기본 TS 실행은 타입만 지우는 방식이라 enum, 생성자 매개변수 속성, namespace가 동작하지 않는다. 실행은 `nest build` 결과(`dist/`)로, 테스트는 Vitest로 한다

## 7. TypeScript

1. **`any` 금지** (lint 에러). 모르는 값은 `unknown`으로 받고 `typeof`, `in` 등으로 좁힌다
2. **객체 모양은 `interface`** (lint가 강제). `type`은 유니온, 교차, 유틸리티 타입에만

```ts
interface EncounterSummary {
  // 객체 모양: interface
  monsterId: string;
  encounterCount: number;
}
type RiskLevel = 'low' | 'high'; // 유니온: type
type EncounterKey = Pick<EncounterSummary, 'monsterId'>; // 유틸리티: type
```

3. `as` 단언은 최소화. 쓰면 왜 안전한지 주석 한 줄
4. `// @ts-ignore` 금지. 꼭 필요하면 `// @ts-expect-error 이유`
5. **런타임 검증은 외부 입력에만 한다.** 요청 본문, 쿼리, 경로 매개변수가 그 입구다. 우리가 만든 미리 계산 JSON과 ClickHouse 응답은 타입만으로 충분하다
   - 검증이 필요한 첫 엔드포인트가 생기면 그때 검증 라이브러리를 추가하고 이 항목을 갱신한다

## 8. 데이터 접근

1. **ClickHouse와 파일 접근은 service에만 둔다.** controller는 service를 호출만 한다
2. service는 화면에 필요한 필드만 담은 객체를 돌려준다. DB 행을 통째로 넘기지 않는다 (지갑 주소, 채팅 원문이 응답으로 새는 것을 막는다)
3. 화면용 조회는 기초 표(`encounters`, `player_deaths`, `ability_events`)와 미리 계산 JSON만 쓴다. 원시 `game_events`는 화면용으로 조회하지 않는다
4. 접속 정보(호스트, 계정, 비밀번호)는 `.env`에만 둔다. `.env.example`에는 키 이름만 적는다
5. 계층은 controller → service 두 단계로 충분하다. service 하나가 300줄을 넘거나 여러 service가 같은 쿼리를 반복하면 그때 repository로 나눈다

## 9. 데이터 취급 (Akkadia 프로젝트 공통)

- 운영자 계정(`/su` 사용 계정)은 기본 제외
- 채팅 원문, 지갑 주소(`playerId`, `actorId`, `sourceActor`, `targetAddress`)는 응답, 코드, 커밋, 로그 어디에도 노출 금지
- 이탈률/리텐션 지표는 사용하지 않는다
