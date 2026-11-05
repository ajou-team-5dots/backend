# 환경 변수

앱은 시작할 때 `src/config/env.schema.ts`(zod)로 모든 키를 검사한다. 키가 없거나 형식이 틀리면 바로 멈추고, 문제가 된 **키 이름만** 보여 준다(값은 출력하지 않는다).

```
환경 변수 설정 오류: CLICKHOUSE_URL(없음), PORT(형식 오류). .env.example과 docs/ENV.md를 확인하세요.
```

`process.env`는 `src/config/` 밖에서 읽지 않는다(lint 에러). 다른 코드는 `ConfigService`로 받는다.

## 1. 키 목록

| 키                              | 필수 | 비밀      | 개발                       | 운영                       |
| ------------------------------- | ---- | --------- | -------------------------- | -------------------------- |
| `NODE_ENV`                      | 아님 | 아님      | `development` (기본)       | `production`               |
| `PORT`                          | 아님 | 아님      | `3000` (기본)              | `3000`                     |
| `CLICKHOUSE_URL`                | 필수 | 비밀 취급 | `http://<DB 공인 IP>:8123` | `http://<DB 사설 IP>:8123` |
| `CLICKHOUSE_USER`               | 필수 | 비밀 취급 | 읽기 전용 `api` 계정       | 같음                       |
| `CLICKHOUSE_PASSWORD`           | 필수 | **비밀**  | `api` 계정 비밀번호        | 같음                       |
| `CLICKHOUSE_DB`                 | 필수 | 아님      | 같음                       | 같음                       |
| `CLICKHOUSE_REQUEST_TIMEOUT_MS` | 아님 | 아님      | `10000` (기본)             | `10000` (기본)             |

- `CLICKHOUSE_URL`은 `http://` 또는 `https://`만 받는다. 계정과 비밀번호를 URL에 넣으면 거부한다
- **개발과 운영은 `CLICKHOUSE_URL` 하나만 다르다.** 코드는 그대로 둔다
- `api` 계정은 readonly=2다. 클라이언트는 `readonly` 설정을 보내지 않는다(보내면 서버가 거부한다)

### 나중에 추가할 키

| 키              | 비밀     | 용도                                                                                |
| --------------- | -------- | ----------------------------------------------------------------------------------- |
| `API_KEYS`      | **비밀** | Next(Vercel)가 API를 부를 때의 키. 쉼표로 두 개까지 받아 교체할 때 중단이 없게 한다 |
| `PRECOMPUTED_*` | 아님     | 미리 계산 JSON 위치 (front-demo에서 옮긴다)                                         |

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

- 서버에 `/opt/backend/.env`를 **한 번 직접 만들고** `chmod 600`으로 둔다
- `docker compose`의 `env_file`로 읽는다. **배포는 이 파일을 건드리지 않는다**
- 값을 바꾸면 서버에서 파일을 고치고 컨테이너를 다시 시작한다
- 운영 `CLICKHOUSE_URL`은 DB의 **사설 IP**다. DB 보안 그룹의 8123은 NestJS EC2 보안 그룹에서만 받는다
- DB 비밀번호는 GitHub(Secrets 포함)에 두지 않는다

## 5. Vercel (front-demo)

- `BACKEND_URL`과 API 키를 **Production** 환경 변수에 둔다

## 6. GitHub Actions

- 배포에 필요한 값만 둔다. DB 접속 정보는 두지 않는다
- 어떤 값을 둘지는 배포 방식(SSH 또는 EC2가 ECR에서 이미지를 받아 가는 방식)에 달려 있다. **배포 이슈에서 결정**
