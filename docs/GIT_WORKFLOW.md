# Git 작업 규칙

## 1. 브랜치

```
feat/12-xxx ─┐
fix/18-xxx  ─┼─(squash)─▶ dev ─(릴리스 PR, merge commit)─▶ main (배포)
docs/3-xxx  ─┘                                              ▲
                              hotfix/21-xxx ─(squash)───────┘ → main을 dev에 다시 병합
```

| 브랜치                     | 역할                                                | 직접 push |
| -------------------------- | --------------------------------------------------- | --------- |
| `main`                     | 배포 브랜치. 항상 배포 가능한 상태                  | 금지      |
| `dev`                      | 통합 브랜치, **기본 브랜치**. 모든 작업 PR이 여기로 | 금지      |
| `<type>/<이슈번호>-<설명>` | 작업 브랜치. `dev`에서 만든다                       | 가능      |
| `hotfix/<이슈번호>-<설명>` | 배포된 버그 긴급 수정. `main`에서 만든다            | 가능      |

### 작업 (일상)

1. `dev`에서 브랜치 생성: `git switch dev && git pull && git switch -c feat/12-encounter-summary`
2. PR은 `dev`로 (기본 브랜치라 자동 선택됨)
3. 병합 방식: **Squash and merge** (PR 하나 = dev 커밋 하나), 병합 후 브랜치 삭제
4. `dev`에 병합되면 `Closes #번호`로 연결된 이슈가 자동으로 닫힌다

### 배포 (dev → main)

1. 배포할 시점에 `dev` → `main` PR 생성. 제목: `chore(release): YYYY-MM-DD 배포`
2. 본문은 `.github/agent-templates/release.md` 사용. 포함된 PR 목록을 적는다
3. 병합 방식: **Create a merge commit** (squash 금지. squash하면 dev와 main 기록이 어긋나 다음 릴리스에서 충돌한다)
4. 릴리스 PR은 이슈 연결이 필요 없다

### 긴급 수정 (hotfix)

1. 이슈 생성, 담당자 지정
2. `main`에서 `hotfix/21-xxx` 생성 → `main`으로 PR (squash)
3. 병합 후 바로 `main` → `dev` PR을 열어 merge commit으로 병합 (dev에 수정 반영)

## 2. 커밋 메시지

[Conventional Commits](https://www.conventionalcommits.org/ko/v1.0.0/) 형식. `commitlint`가 커밋할 때 검사한다.

```
<type>(<scope>): <제목>

<본문: 무엇을, 왜. 선택>

<꼬리말: Closes #12. 선택>
```

| type       | 언제                             |
| ---------- | -------------------------------- |
| `feat`     | 새 기능                          |
| `fix`      | 버그 수정                        |
| `docs`     | 문서만 변경                      |
| `style`    | 포맷, 세미콜론 등 동작 변화 없음 |
| `refactor` | 동작 변화 없는 구조 개선         |
| `perf`     | 성능 개선                        |
| `test`     | 테스트 추가/수정                 |
| `build`    | 의존성, 빌드 설정                |
| `ci`       | CI 설정                          |
| `chore`    | 그 외 잡무                       |
| `revert`   | 되돌리기                         |

규칙:

1. 제목은 한국어 가능, 72자 이내, 마침표 없음
2. 제목은 "~한다" 대신 명사형/동사 원형으로 짧게: `feat(encounters): 몬스터별 교전 요약 API 추가`
3. scope는 선택. 쓰면 기능 모듈명 (`health`, `encounters`, `config`, `deps`)
4. 하나의 커밋에는 하나의 변경 이유만

좋은 예:

```
feat(encounters): 몬스터별 교전 요약 API 추가
fix(deaths): 운영자 계정이 사망 수에 포함되는 문제 수정
docs: 커밋 메시지 규칙 정리
build(deps): @nestjs/config 추가
```

나쁜 예:

```
수정함                  # type 없음
feat: 이것저것 고침      # 변경 이유가 여러 개
Fix: Health.             # 대문자 type, 마침표
```

## 3. 이슈

이슈 없이 작업하지 않는다. `.github/ISSUE_TEMPLATE`의 양식을 쓴다.

| 양식        | 용도                 | 제목 형식                              |
| ----------- | -------------------- | -------------------------------------- |
| 기능 요청   | 새 API, 기능         | `[Feat] 몬스터별 교전 요약 API`        |
| 버그 리포트 | 잘못된 동작          | `[Bug] 사망 수에 운영자 계정이 포함됨` |
| 작업        | 설정, 문서, 리팩터링 | `[Task] CI에 build 단계 추가`          |

- **작업 시작 전에 담당자(Assignee) 지정**, 라벨 지정
- 작성법과 예시: [ISSUE_PR_GUIDE.md](ISSUE_PR_GUIDE.md)
- 완료 조건은 체크박스로, 리뷰어가 확인할 수 있게 구체적으로

## 4. Pull Request

- 제목은 커밋 메시지 형식과 동일 (squash 시 그대로 dev 커밋 제목이 됨)
- 본문은 PR 템플릿 사용, `Closes #이슈번호` 필수
- 리뷰어 지정은 권장 (CI가 강제하지 않는다)
- 제목 형식, 브랜치 방향, 이슈 연결, 이슈 담당자는 CI `pr-rules`가 검사한다
- CI(`pnpm check`, `pnpm build`) 통과 필수
- API 응답이 바뀌면 요청/응답 예시 첨부 (지갑 주소, 채팅 원문은 가린다)
- 한 PR은 리뷰 가능한 크기로 (변경 400줄 이내 권장)
