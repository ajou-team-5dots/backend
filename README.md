# 5dots backend

몬스터 밸런스 보드의 NestJS 백엔드. 화면(Next.js, Vercel)과 ClickHouse(EC2 사설망) 사이의 로직 층이다.

## 시작하기

```bash
fnm use            # .nvmrc의 Node 26.13.0 (nvm이면 nvm use)
pnpm install
pnpm start:dev     # http://localhost:3000/health → { "status": "ok" }
```

환경 변수는 `.env.example`을 `.env`로 복사해 채운다. `.env`는 커밋하지 않는다.

## 명령어

| 명령              | 내용                                              |
| ----------------- | ------------------------------------------------- |
| `pnpm check`      | lint + format:check + typecheck + test + test:e2e |
| `pnpm build`      | `dist/`로 빌드                                    |
| `pnpm start:prod` | 빌드 결과 실행                                    |

## 문서

- 작업 규칙 요약: [AGENTS.md](AGENTS.md)
- 코드 컨벤션: [docs/CONVENTION.md](docs/CONVENTION.md)
- Git 규칙: [docs/GIT_WORKFLOW.md](docs/GIT_WORKFLOW.md)
- 이슈와 PR 작성: [docs/ISSUE_PR_GUIDE.md](docs/ISSUE_PR_GUIDE.md)
