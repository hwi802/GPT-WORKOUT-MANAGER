# FitLog

운동 종목과 세트별 중량·반복 횟수를 기록하고, 웹 화면과 ChatGPT의 MCP 도구에서 같은 SQLite 데이터를 조회하는 개인 운동 기록 프로젝트입니다.

이 프로젝트는 **운동 데이터 모델 설계 → MCP 연동 → 웹 입력 및 조회 → 수정·삭제**까지 하나의 데이터 흐름을 구현한 작업입니다. 산업경영공학과 데이터 관리 경험을 소프트웨어 구현으로 확장한 포트폴리오를 목표로 합니다.

## 현재 기능

| 기능 | 내용 |
| --- | --- |
| 운동 기록 조회 | 웹에서 최근 10건 확인. MCP `get_recent_workouts`는 최근 기록을 구조화된 데이터로 반환. |
| 운동 기록 추가 | DB에 실제 세트 기록이 있는 종목을 스크롤해 선택하거나 새 종목을 직접 입력. 운동하면서 빈 세트 행을 추가하고 여러 종목을 한 기록으로 저장. |
| 운동 기록 수정 | 기존 날짜, 종목, 세트를 폼에 불러와 같은 운동 ID로 저장. 수정 취소 가능. |
| 운동 기록 삭제 | 날짜와 종목을 확인한 뒤 해당 기록 및 관련 종목·세트를 함께 삭제. |
| ChatGPT 도구 | MCP `get_recent_workouts`, `save_workout` 제공. ChatGPT 연결에는 별도의 접근 가능한 MCP 서버 URL과 연결 설정이 필요. |

## 기술 구성

- **서버:** Node.js HTTP 서버, `@modelcontextprotocol/sdk`, Zod
- **DB:** SQLite (`node:sqlite`), `workouts` → `exercises` → `workout_sets`
- **웹:** HTML, CSS, JavaScript
- **인터페이스:** `/mcp` (MCP), `/api/workouts` 및 `/api/exercises` (웹 API)

웹과 MCP 도구가 같은 SQLite 파일을 사용합니다. 하나의 운동 기록에는 여러 운동 종목이, 각 종목에는 여러 세트가 연결됩니다. 기록 수정·삭제는 트랜잭션으로 처리해 도중 오류가 발생하면 기존 데이터가 유지되도록 했습니다.

## 로컬 실행 (Windows PowerShell)

Node.js 24 환경에서 개발·검증했습니다. **프로젝트 루트에는 `package.json`이 없고**, Node 패키지는 `mcp-server` 폴더에 설치합니다.

```powershell
git clone https://github.com/hwi802/GPT-WORKOUT-MANAGER.git
cd GPT-WORKOUT-MANAGER
npm.cmd --prefix .\mcp-server install
node .\database\init-db.js
npm.cmd --prefix .\mcp-server start
```

서버가 실행 중인 동안 [http://localhost:8787](http://localhost:8787)을 엽니다. MCP 경로는 `http://localhost:8787/mcp`입니다. 서버를 종료할 때는 실행 중인 터미널에서 `Ctrl+C`를 누릅니다.

`database/fitlog.db`는 첫 초기화 때 로컬에 생성됩니다. 실제 운동 기록을 담는 파일이므로 Git에는 포함하지 않습니다. 예시 데이터가 필요한 경우 서버를 시작하기 전에 `node .\database\seed-db.js`를 실행할 수 있습니다.

## 사용 흐름

1. 이전에 수행한 운동 종목을 선택하거나 종목명을 입력합니다.
2. 운동하면서 `+ 세트 추가`를 눌러 중량과 횟수를 입력합니다. 새 세트 행의 값은 공란입니다.
3. 필요하면 `+ 다른 운동 추가`로 종목을 늘리고 `운동 기록 저장`을 누릅니다.
4. 아래 최근 기록에서 저장 결과를 확인하고, 기록 단위의 `수정`·`삭제`를 사용할 수 있습니다.

MCP 연동을 확인할 때는 서버를 켜 둔 상태에서 다른 터미널에서 실행합니다.

```powershell
node .\mcp-server\test-client.js
```

## 검증 기록

- 웹에서 여러 종목과 세트를 한 기록으로 저장하고, 웹 API 및 MCP 조회에서 같은 결과를 확인했습니다.
- 기존 운동 기록의 중량을 수정한 뒤 기록 수가 늘지 않고 값이 변경되는 것을 확인했습니다.
- 수정 취소 후 기존 값이 유지되는 것과, 삭제 후 해당 기록만 사라지고 다른 기록이 유지되는 것을 브라우저에서 확인했습니다.
- [운동 기록 수정·삭제 마일스톤](docs/fitlog-edit-delete-milestone.md)에 API 처리와 검증 사례를 정리했습니다.

## 현재 범위

웹 목록은 최근 10건만 표시합니다. 전체 기록 검색, 여러 브라우저 탭 사이의 수정 충돌 감지, 사용자별 계정과 인증은 아직 구현하지 않았습니다. 로컬 서버를 외부에 연결하려면 별도의 접근 제어와 안정적인 호스팅을 설계해야 합니다.
