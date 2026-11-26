# 배포

지금은 **내부 테스트**용이다. HTTP로 띄우고, VM 보안 그룹은 팀원 IP만 3000 포트에 연다. HTTPS(Caddy)와 자동 배포는 이번 범위가 아니며 나중에 붙인다.

## 1. VM 준비 (처음 한 번)

- VM: Ubuntu 24.04 arm64, `t4g.small`, ClickHouse DB와 **같은 VPC**에 둔다
- 보안 그룹: 22(SSH)와 3000 포트는 팀원 IP만 연다. DB 보안 그룹의 8123 포트는 이 VM의 보안 그룹에서만 받는다([ENV.md](./ENV.md#4-운영-ec2) 4절 참고)
- Docker Engine과 compose 플러그인을 설치한다(Docker 공식 apt 저장소)

```bash
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker "$USER"   # 다시 로그인해야 적용
docker compose version
```

- 주의: `t4g.small`은 메모리 2GB다. 서버에서 이미지를 빌드하다 메모리가 모자라 멈추면 스왑을 1~2GB 잡는다

## 2. `/opt/backend/.env` 만들기 (처음 한 번)

```bash
sudo mkdir -p /opt/backend
sudo chown "$USER":"$USER" /opt/backend
touch /opt/backend/.env && chmod 600 /opt/backend/.env
sudo chown ubuntu:ubuntu /opt/backend/.env   # compose를 실행하는 사용자 소유로 (600 유지)
nano /opt/backend/.env   # 키를 적는다
```

- 첫 배포 전이라 소스가 아직 없다. 키 이름은 repo의 `.env.example`을 보고 적는다
- 키 목록과 설명은 `.env.example`과 [ENV.md](./ENV.md#1-키-목록) 1절을 참고한다
- `NODE_ENV`는 Dockerfile이 `production`으로 정하므로 `.env`에 넣지 않아도 된다. `CLICKHOUSE_URL`은 DB의 **사설 IP** 주소를 적는다
- **`API_KEYS`는 production에서 필수다.** 비우면 컨테이너가 시작하지 않고 로그에 `환경 변수 설정 오류: API_KEYS(없음)`가 나온다
- 키 만들기는 `openssl rand -hex 32`를 쓴다(32자 이상). 만든 키는 팀 비밀번호 관리자에 두고, 같은 값을 Vercel `API_KEYS` 자리([ENV.md](./ENV.md#5-vercel-front-demo) 5절)에도 넣는다. 교체 순서는 [ENV.md](./ENV.md#1-키-목록) 1절을 참고한다
- 값은 **팀 비밀번호 관리자**에서 받는다. 메신저·Notion·GitHub(Secrets 포함)에 두지 않는다
- 파일 주인은 `docker compose`를 실행하는 사용자다. `docker compose`는 `env_file`을 실행한 사용자 권한으로 읽으므로, root 소유 600이면 `open /opt/backend/.env: permission denied`로 실패한다. 위 `chown`으로 소유자만 바꾸고 권한은 600을 유지한다
- Ghostty 같은 터미널에서 접속해 `nano`가 `Error opening terminal`로 열리지 않으면 `TERM=xterm-256color nano /opt/backend/.env`로 연다(root 소유 파일이면 `sudo TERM=xterm-256color nano /opt/backend/.env`)
- 배포는 이 파일을 건드리지 않는다. 값을 바꾸면 파일을 고치고 `docker compose up -d`로 다시 띄운다(`restart`는 `env_file` 변경을 반영하지 않는다)

## 3. 배포

로컬(내 컴퓨터)에서 배포할 커밋을 묶어 보낸다. `git archive`는 커밋된 파일만 담으므로 `.env`는 들어가지 않는다.

```bash
git archive --format=tar.gz -o backend.tar.gz <브랜치 또는 커밋>
scp -i <SSH 키> backend.tar.gz ubuntu@<VM 주소>:/opt/backend/
```

VM에서 이미지를 빌드하고 컨테이너를 띄운다.

```bash
cd /opt/backend
docker image tag 5dots-backend:latest 5dots-backend:prev 2>/dev/null || true   # 되돌리기용, 첫 배포면 건너뜀
rm -rf app && mkdir app && tar -xzf backend.tar.gz -C app
cd app && docker compose up -d --build
```

- 소스는 `/opt/backend/app`, 비밀 값은 `/opt/backend/.env`다. 둘을 나눠 두어 배포가 `.env`를 지우지 않는다
- 컨테이너는 `restart: unless-stopped`라 VM이 재부팅돼도 다시 뜬다
- 로그는 `json-file`로 10MB씩 3개까지만 남는다

## 4. 확인

`/health`만 키 없이 열리고, `/health/db`와 `/encounters/...`는 `x-api-key` 헤더가 필요하다. 키를 셸 기록에 남기지 않도록 먼저 입력받는다.

```bash
read -rs API_KEY   # 키를 붙여 넣고 Enter (화면과 셸 기록에 남지 않는다)
docker compose ps                     # STATUS가 healthy인지 (healthcheck는 30초마다 /health)
curl -s localhost:3000/health         # {"status":"ok"} (키 필요 없음)
curl -s -o /dev/null -w '%{http_code}\n' localhost:3000/health/db                        # 401 (키 없음)
curl -s -o /dev/null -w '%{http_code}\n' -H "x-api-key: $API_KEY" localhost:3000/health/db   # 200. 503이면 DB 연결 실패
curl -s -H "x-api-key: $API_KEY" 'localhost:3000/encounters/count?monster=small_zombie&heavy=include&period=current'
# {"monster":"small_zombie","encounters":4429}
curl -s -o /dev/null -w '%{http_code}\n' -H "x-api-key: $API_KEY" 'localhost:3000/encounters/count?monster=nobody'   # 404 (모르는 몬스터)
docker compose logs --tail 100 backend
unset API_KEY
```

- 팀원 PC에서는 `http://<VM 주소>:3000/health`(키 없이)로 확인한다. 다른 경로를 브라우저 주소창으로 열면 401이 정상이다
- 401이면 볼 것: 헤더 이름(`x-api-key`), `.env`의 `API_KEYS`와 같은 값인지, 앞뒤 공백
- 429면 IP 하나가 1분에 `RATE_LIMIT_PER_MINUTE`(기본 60)번을 넘긴 것이다. 1분 뒤 다시 된다
- `/health/db`가 503이면 볼 것: `.env`의 `CLICKHOUSE_URL`(사설 IP인지), DB 보안 그룹이 이 VM 보안 그룹을 허용하는지, 계정·비밀번호
- 환경 변수가 없거나 틀리면 컨테이너가 바로 멈추고 로그에 **키 이름만** 나온다(`환경 변수 설정 오류: ...`)

## 5. 되돌리기

직전 이미지로 돌아간다(3절에서 `prev` 태그를 남긴 경우).

```bash
cd /opt/backend/app
docker image tag 5dots-backend:prev 5dots-backend:latest
docker compose up -d --no-build
```

- 소스도 되돌리려면 이전 커밋으로 3절을 다시 한다

## 6. 나중에 바꿀 것

- Caddy(HTTPS)를 앞에 두면 `compose.yaml`의 `ports`를 `127.0.0.1:3000:3000`으로 바꾸고 보안 그룹의 3000을 닫는다
- 자동 배포(GitHub Actions)는 별도 이슈
