# 환경 변수

앱은 시작할 때 `src/config/env.schema.ts`(zod)로 모든 키를 검사한다. 키가 없거나 형식이 틀리면 바로 멈추고, 문제가 된 **키 이름만** 보여 준다(값은 출력하지 않는다).

```
환경 변수 설정 오류: CLICKHOUSE_URL(없음), PORT(형식 오류). .env.example과 docs/ENV.md를 확인하세요.
```

문제가 여러 개면 한 번에 모두 알려 준다. 공백만 있는 값은 "없음"으로 본다.

`process.env`는 `src/config/` 밖에서 읽지 않는다(lint 에러). 다른 코드는 `ConfigService`로 받는다.

## 1. 키 목록

| 키                              | 필수            | 비밀      | 개발                       | 운영                                 |
| ------------------------------- | --------------- | --------- | -------------------------- | ------------------------------------ |
| `NODE_ENV`                      | 아님            | 아님      | `development` (명시)       | `production`                         |
| `PORT`                          | 아님            | 아님      | `3000` (기본)              | `3000`                               |
| `CLICKHOUSE_URL`                | 필수            | 비밀 취급 | `http://<DB 공인 IP>:8123` | `http://<DB 사설 IP>:8123`           |
| `CLICKHOUSE_USER`               | 필수            | 비밀 취급 | 읽기 전용 `api` 계정       | 같음                                 |
| `CLICKHOUSE_PASSWORD`           | 필수            | **비밀**  | `api` 계정 비밀번호        | 같음                                 |
| `CLICKHOUSE_DB`                 | 필수            | 아님      | 같음                       | 같음                                 |
| `CLICKHOUSE_REQUEST_TIMEOUT_MS` | 아님            | 아님      | `10000` (기본)             | `10000` (기본)                       |
| `PRECOMPUTED_DIR`               | 아님            | 아님      | `data/precomputed` (기본)  | `data/precomputed` (이미지 안, 기본) |
| `CACHE_TTL_MS`                  | 아님            | 아님      | `3600000` (기본, 1시간)    | `3600000` (기본)                     |
| `API_KEYS`                      | production 필수 | **비밀**  | 비워 두면 검사 끔          | 키 1~2개                             |
| `REVALIDATE_TOKEN`              | production 필수 | **비밀**  | 비워 두면 캐시 비우기 거부 | 토큰 1개                             |

- `CLICKHOUSE_URL`은 `http://` 또는 `https://`만 받는다. 계정과 비밀번호를 URL에 넣으면 거부한다
- **개발과 운영은 `CLICKHOUSE_URL` 하나만 다르다.** 코드는 그대로 둔다
- `api` 계정은 readonly=2다. 클라이언트는 `readonly` 설정을 보내지 않는다(보내면 서버가 거부한다)
- 선택 키는 `.env.example`처럼 `KEY=`로 비워 두면 기본값을 쓴다
- `CLICKHOUSE_REQUEST_TIMEOUT_MS`: ClickHouse 요청 제한 시간. 이 시간이 지나면 조회는 실패로 끝나고(503), 실패한 결과는 캐시에 남지 않는다
- `PRECOMPUTED_DIR`: Python 배치가 쓴 `<이름>.json`(`meta`, `patches`, `expected-risk`, `pentagon`, `h2-same-condition`)이 있는 폴더. 비워 두면 기본값은 **프로젝트 루트의 `data/precomputed`** 다. 테스트, `pnpm start:prod`, Docker 이미지의 `/app` 등 어디서 실행하든 같은 폴더를 가리킨다. 값을 직접 적을 때 상대 경로는 실행 위치 기준이므로 절대 경로를 권한다
- `CACHE_TTL_MS`: ClickHouse 조회와 미리 계산 JSON을 프로세스 메모리에 기억하는 시간. 적재·배치 직후에는 캐시를 비워야 새 값이 보인다(`REVALIDATE_TOKEN` 항목 참고)
- `API_KEYS`: `/health`를 뺀 모든 요청은 `x-api-key` 헤더가 이 중 하나와 같아야 한다. 없거나 틀리면 401(둘 다 같은 문구). `/health/db`도 키가 필요하다. 키는 쉼표로 두 개까지 받아, 새 키를 더하고 → Vercel 값을 바꾸고 → 옛 키를 빼는 순서로 중단 없이 바꾼다. **`NODE_ENV`를 `development`나 `test`로 명시했을 때만** 비워 둘 수 있고 그때 검사를 끈다(시작할 때 경고 로그 한 줄). `NODE_ENV`가 비어 있으면(기본값 development로 동작하더라도) 서버에서 API가 열리지 않도록 `API_KEYS`가 없으면 시작하지 않는다. production에서는 각 키가 64자 소문자 hex(`openssl rand -hex 32` 결과)여야 한다. 손으로 친 값이나 이 공개 저장소의 테스트 키는 거부한다
- **요청 제한은 두지 않는다.** API 키 검사가 DB에 닿기 전에 걸러 내고, 사용자별 제한이 필요하면 Vercel(Next 서버) 쪽에서 한다
- `REVALIDATE_TOKEN`: `POST /admin/cache/clear`만 이 토큰(헤더 `x-revalidate-token`)으로 연다. API 키로는 열리지 않고, 이 토큰으로 다른 경로가 열리지도 않는다. 없거나 틀리면 401. 응답은 `{"cleared": <비운 항목 수>}`. production에서는 같은 64자 hex 규칙이 적용되며, **어느 환경이든 `API_KEYS` 중 하나와 같으면 시작하지 않는다**(`REVALIDATE_TOKEN(API_KEYS와 같음)`)
- **`/admin/*` 경로는 API 키 대신 `REVALIDATE_TOKEN`으로 보호된다.** `AdminController` 전체가 API 키 검사에서 빠지므로, admin에 경로를 더하면 그 경로도 운영 토큰만으로 열린다. Next 서버(API 키)가 불러야 하는 경로는 admin이 아니라 기능 컨트롤러에 둔다
- **ClickHouse 적재 뒤에는 이 엔드포인트를 부르거나 컨테이너를 다시 시작한다**(그래야 새 데이터와 새 몬스터 목록이 보인다. 안 하면 `CACHE_TTL_MS` 뒤). Python 배치 결과(미리 계산 JSON)는 이미지에 들어 있어 커밋 후 다시 빌드·배포해야 반영된다

### 나중에 추가할 키

| 키      | 비밀 | 용도                                                             |
| ------- | ---- | ---------------------------------------------------------------- |
| S3 위치 | 아님 | 미리 계산 JSON을 S3에서 읽게 되면 추가한다. 지금은 폴더만 읽는다 |

## 2. 로컬 설정

1. `.env.example`을 `.env`로 복사한다. `.env`는 `.gitignore`로 제외되어 있다
2. 값은 **팀 비밀번호 관리자로만** 받는다. 메신저와 Notion에 올리지 않는다
3. `pnpm start:dev`로 띄우고 `GET /health/db`가 200인지 확인한다
4. 실제 DB 테스트는 `pnpm test:db`로 따로 돌린다. `pnpm check`와 CI는 DB 없이 돈다

## 3. 개발 DB 접속

- 필요한 사람의 IP만 DB 보안 그룹의 8123 포트에 연다. 규칙 설명에 이름을 적는다
- **등록과 변경은 사용자(관리자)에게 요청한다.** 공인 IP가 바뀌면(집, 카페 등) 다시 요청한다
- 개발자는 읽기 전용 `api` 계정만 쓴다

> **경고: 지금 개발 연결은 http다.** 비밀번호가 인터넷 구간에서 평문으로 오간다. 공용 Wi-Fi에서는 접속하지 않는다. DB에 HTTPS(8443)를 켜면 `CLICKHOUSE_URL`만 `https://<DB 주소>:8443`으로 바꾸면 된다.

## 4. 운영 EC2

배포 절차는 [DEPLOY.md](./DEPLOY.md)에 있다.

- 서버에 `/opt/backend/.env`를 **한 번 직접 만들고** `chmod 600`으로 둔다
- `docker compose`의 `env_file`로 읽는다. **배포는 이 파일을 건드리지 않는다**
- 값을 바꾸면 서버에서 파일을 고치고 `/opt/backend/app`에서 `docker compose up -d`로 다시 띄운다(`restart`는 `.env` 변경을 반영하지 않는다)
- `NODE_ENV`·`PORT`는 `compose.yaml`이 정하므로 `.env`에 넣지 않는다
- 운영 `CLICKHOUSE_URL`은 DB의 **사설 IP**다. DB 보안 그룹의 8123은 NestJS EC2 보안 그룹에서만 받는다
- DB 비밀번호는 GitHub(Secrets 포함)에 두지 않는다
- 미리 계산 JSON은 이미지에 들어 있다(`/app/data/precomputed`). 배치 결과를 바꾸려면 `data/precomputed`에 커밋하고 다시 빌드·배포한다. `PRECOMPUTED_DIR`은 비워 둔다

## 5. Vercel (front-demo)

- `BACKEND_URL`과 API 키를 **Production** 환경 변수에 둔다. 키는 `API_KEYS` 중 하나이며 서버 쪽 코드에서만 `x-api-key` 헤더로 보낸다(브라우저 노출 금지, `NEXT_PUBLIC_` 접두어 금지)

## 6. GitHub Actions

- 배포에 필요한 값만 둔다. DB 접속 정보는 두지 않는다
- 어떤 값을 둘지는 배포 방식(SSH 또는 EC2가 ECR에서 이미지를 받아 가는 방식)에 달려 있다. **배포 이슈에서 결정**
