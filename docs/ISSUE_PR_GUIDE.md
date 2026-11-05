# 이슈 / PR 작성 가이드

사람과 AI 에이전트(Codex, Claude Code) 모두 이 순서를 따른다. 사람은 GitHub 웹 양식을, 에이전트는 `gh` CLI와 `.github/agent-templates/`를 쓴다. 두 경로로 만든 이슈의 제목(###) 구조가 같도록 맞춰 두었다.

## 전체 흐름

1. **이슈 만들기** (없으면)
2. **담당자 지정** — 작업 시작 전에 반드시. 담당자가 없는 이슈로 연 PR은 CI(`pr-rules`)가 막는다
3. **`dev`에서 브랜치 만들기** — `<type>/<이슈번호>-<설명>`
4. 작업, `pnpm check`
5. **`dev`로 PR 올리기** — `main`으로 바로 가는 PR은 CI가 막는다. 리뷰어 지정은 권장
6. CI 통과 후 Squash merge
7. 배포는 `dev` → `main` 릴리스 PR로 따로 한다 (`GIT_WORKFLOW.md` 1장)

## 1. 이슈

| 종류                 | 템플릿             | 제목                                   | 라벨      |
| -------------------- | ------------------ | -------------------------------------- | --------- |
| 새 API, 기능         | `issue-feature.md` | `[Feat] 몬스터별 교전 요약 API`        | `feature` |
| 잘못된 동작          | `issue-bug.md`     | `[Bug] 사망 수에 운영자 계정이 포함됨` | `bug`     |
| 설정, 문서, 리팩터링 | `issue-task.md`    | `[Task] CI에 build 단계 추가`          | `task`    |

```bash
cp .github/agent-templates/issue-feature.md /tmp/issue.md   # 채워 넣기
gh issue create --title "[Feat] 몬스터별 교전 요약 API" \
  --label feature --assignee @me --body-file /tmp/issue.md
```

이미 있는 이슈를 맡을 때:

```bash
gh issue edit <번호> --add-assignee @me
```

## 2. 브랜치

```bash
git switch dev && git pull
git switch -c feat/12-encounter-summary
```

## 3. PR

```bash
cp .github/PULL_REQUEST_TEMPLATE.md /tmp/pr.md   # 채워 넣기
gh pr create --title "feat(encounters): 몬스터별 교전 요약 API 추가" \
  --base dev --body-file /tmp/pr.md --assignee @me --label feature
```

- base: 항상 `dev`. `main`은 릴리스/hotfix PR만
- 제목: 커밋 메시지 형식. Squash merge 시 그대로 dev 커밋 제목이 된다
- 본문 첫 줄: `Closes #<이슈번호>`
- 리뷰어: 권장(CI가 강제하지 않음). 지정한다면 작성자 본인 제외, 해당 영역을 아는 팀원. 지정하려면 `--reviewer <github-id>`
- 라벨: 연결된 이슈와 같은 라벨

## 4. 릴리스 PR (dev → main)

```bash
gh pr list --base dev --state merged --search "merged:>=<지난 배포일>" --json number,title \
  --jq '.[] | "- #\(.number) \(.title)"'          # 포함된 PR 목록
cp .github/agent-templates/release.md /tmp/release.md   # 채워 넣기
gh pr create --base main --head dev --title "chore(release): 2026-10-20 배포" \
  --body-file /tmp/release.md
```

병합은 **Create a merge commit**. Squash하지 않는다.

## 5. 작성 규칙 (AI 에이전트는 특히 지킬 것)

1. **템플릿의 `###`/`##` 제목을 지우거나 바꾸지 않는다.** 내용만 채운다
2. **`<!-- -->` 안내 주석은 지우고 내용으로 바꾼다.** 쓸 내용이 없으면 "없음"
3. **모르는 것은 지어내지 않는다.** "확인 필요"라고 쓴다 (예: 재현 환경, 디자인 링크)
4. **체크리스트는 실제로 실행해 확인한 것만 `[x]`.** `pnpm check`를 돌리지 않았으면 체크하지 않는다
5. 완료 조건은 리뷰어가 확인 가능한 문장으로: "잘 동작한다"(X), "`GET /health`가 200과 `{ status: 'ok' }`를 돌려준다"(O)
6. 대상 역할(기획, 레벨 디자인, 엔지니어, 라이브 운영)을 구체적으로. "관리자"로 뭉뚱그리지 않는다
7. 채팅 원문, 지갑 주소(playerId, actorId, sourceActor, targetAddress), 토큰, 호스트·IP를 이슈/PR/로그에 붙이지 않는다
8. 이탈률/리텐션 지표를 요구사항으로 쓰지 않는다
9. 에이전트는 사용자가 요청했을 때만 이슈/PR을 생성한다. 만들기 전에 제목, 담당자를 사용자에게 보여 준다

## 6. 예시

<details>
<summary>기능 이슈 예시</summary>

```markdown
### 대상 역할

레벨 디자인

### 목적

레벨 디자이너가 몬스터별 교전 수, 위험 교전 수, 사망 수를 한 번에 받아 기대보다 위험한 몬스터를 찾는다.

### 작업 내용

- `encounters` 모듈 추가 (controller, service)
- `GET /encounters/summary?monster=<id>` 엔드포인트

### 완료 조건

- [ ] 운영자 계정이 제외된 수치를 돌려준다
- [ ] small_zombie 요청 시 교전 4,429 / 위험 38 / 사망 40이 나온다
- [ ] 응답에 지갑 주소 필드가 없다

### 범위 밖

캐시 (별도 이슈)

### 참고 자료

없음
```

</details>

<details>
<summary>PR 예시</summary>

```markdown
## 관련 이슈

Closes #12

## 요약

몬스터별 교전 요약 API를 추가한다.

## 변경 내용

- `src/encounters/` 모듈 추가
- `test/encounters.e2e-spec.ts` 추가

## 변경 이유

기초 표 `encounters`만 읽어 원시 `game_events` 조회를 피했다.

## 확인 방법

1. `pnpm start:dev`
2. `GET /encounters/summary?monster=small_zombie` 응답 확인

## 요청/응답 예시

(첨부)

## 리뷰 포인트

운영자 계정 제외 조건이 쿼리에 들어갔는지

## 체크리스트

- [x] `pnpm check` 통과 (lint, format, typecheck, test, test:e2e)
- [x] `pnpm build` 통과
- [x] PR 제목이 커밋 메시지 형식 (`feat(scope): 제목`)
- [x] 운영자 계정 제외, 채팅 원문/지갑 주소 미노출
```

</details>
