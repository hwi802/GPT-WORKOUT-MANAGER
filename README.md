# FitLog

운동 종목과 세트별 중량·반복 횟수를 기록하고, 웹과 ChatGPT의 MCP 도구에서 같은 SQLite 데이터를 사용하는 개인 운동 기록 프로젝트입니다. 종목별 최근 기록과 최고 중량 변화를 확인하고, 저장된 기록을 바탕으로 AI 운동 제안과 조언을 받을 수 있습니다.

산업경영공학에서 배운 데이터 관리와 분석 관점을 실제 서비스 구현으로 연결하기 위해 만들었습니다. 운동 기록의 입력부터 저장, 조회, 수정·삭제, 시각화, AI 활용까지 하나의 흐름으로 구성했습니다.

## 주요 기능

| 기능 | 내용 |
| --- | --- |
| 운동 기록 추가 | 기존 종목을 선택하거나 새 종목을 입력합니다. 운동 중 빈 세트 행을 추가해 중량과 횟수를 기록하고, 여러 종목을 한 번에 저장합니다. |
| 운동 기록 조회·수정·삭제 | 웹에서 최근 기록을 확인하고 날짜·종목·세트를 수정하거나 기록을 삭제합니다. |
| 운동 부위 관리 | 저장된 종목에 운동 부위를 지정합니다. 새 종목은 먼저 `미분류`로 등록할 수 있습니다. |
| 최근 종목·부위 기록 | 선택한 종목의 최근 7회와 같은 부위의 최근 7회 운동 기록을 세트 단위로 조회합니다. 여기서 7회는 날짜 수가 아닌 기록된 운동 세션 수입니다. |
| 성장 기록 | 종목별 세션 최고 중량 변화를 웹에서 시각화합니다. |
| 오늘 운동 제안 | 종목 및 부위별 최근 기록을 바탕으로 AI가 오늘 수행할 종목과 세트 구성을 제안합니다. |
| 최근 7일 운동 분석 | 최근 7일 동안 저장된 기록을 AI가 분석해 수행 수준과 다음 운동을 위한 조언을 제시합니다. 기록이 없으면 AI를 호출하지 않습니다. |
| ChatGPT 연동 | MCP `get_recent_workouts`와 `save_workout` 도구로 ChatGPT에서 같은 운동 기록을 조회하고 저장합니다. |

## 구성

- **웹:** HTML, CSS, JavaScript (`app/`)
- **서버:** Node.js HTTP 서버, `@modelcontextprotocol/sdk`, Zod (`mcp-server/`)
- **데이터베이스:** SQLite (`node:sqlite`, `database/`)
- **AI:** 서버에서 OpenAI API를 호출합니다. 운동 데이터는 분석 요청 시 API로 전송됩니다.

웹은 `/api/*`로, ChatGPT는 `/mcp`로 서버에 연결합니다. 두 경로는 같은 SQLite 파일을 사용합니다. 데이터는 `workouts` → `exercises` → `workout_sets` 관계로 저장되며, `exercise_catalog`에 종목별 부위를 보관합니다. 기록 저장·수정·삭제는 트랜잭션으로 처리합니다.

## 로컬 실행 (Windows PowerShell)

Node.js 24 환경에서 개발·검증했습니다. 프로젝트 루트에는 `package.json`이 없으므로 패키지는 `mcp-server` 폴더에 설치합니다.

```powershell
git clone https://github.com/hwi802/GPT-WORKOUT-MANAGER.git
cd GPT-WORKOUT-MANAGER
npm.cmd --prefix .\mcp-server install
node .\database\init-db.js
npm.cmd --prefix .\mcp-server start
```

서버가 실행 중일 때 [http://localhost:8787](http://localhost:8787)을 엽니다. MCP 경로는 `http://localhost:8787/mcp`입니다. 서버 종료는 실행 중인 터미널에서 `Ctrl+C`를 누릅니다.

`database/fitlog.db`는 초기화할 때 로컬에 생성되고 Git에서 제외됩니다. 예시 데이터가 필요하다면 서버 시작 전에 `node .\database\seed-db.js`를 실행할 수 있습니다. 기존 DB를 가진 경우에도 `node .\database\init-db.js`를 실행해 필요한 테이블을 준비합니다.

### AI 기능 설정

운동 기록 CRUD와 그래프는 API 키 없이 로컬에서 사용할 수 있습니다. **오늘 운동 제안**과 **최근 7일 분석**에는 OpenAI API 키와 웹에서 입력할 별도의 접근 토큰이 필요합니다. 서버를 실행할 PowerShell 창에서 두 환경 변수를 설정하세요. 서버를 다른 창에서 실행하거나 창을 닫으면 해당 창의 설정은 이어지지 않습니다.

```powershell
Read-Host "OpenAI API 키를 복사한 뒤 Enter" | Out-Null
$env:OPENAI_API_KEY = ([string](Get-Clipboard -Raw)).Trim()
if ($env:OPENAI_API_KEY -notmatch '^sk-[\x21-\x7E]+$') { throw "API 키 형식을 확인하세요." }
Set-Clipboard -Value "cleared"

$env:FITLOG_AI_TOKEN = [guid]::NewGuid().ToString("N")
Set-Clipboard -Value $env:FITLOG_AI_TOKEN
npm.cmd --prefix .\mcp-server start
```

서버 시작 후 웹페이지의 **AI 기능 접근 토큰** 입력란에 클립보드의 토큰을 붙여넣습니다. API 키는 서버 환경 변수에만 설정하고 브라우저 입력란이나 Git 저장소에 넣지 않습니다. AI 요청에는 별도의 API 사용 비용이 발생할 수 있습니다.

## 사용 흐름

1. 이전에 수행한 운동 종목을 선택하거나 새 이름을 입력합니다.
2. 운동하면서 `+ 세트 추가`를 누르고 중량과 횟수를 채웁니다. 새 행은 공란으로 시작합니다.
3. 필요하면 `+ 다른 운동 추가`로 종목을 늘리고 기록을 저장합니다.
4. 최근 기록에서 저장 결과를 확인하고, 필요한 경우 수정·삭제합니다.
5. 종목의 운동 부위를 설정하고 최근 종목·부위 기록과 최고 중량 변화를 확인합니다.
6. AI 기능을 설정했다면 오늘 운동을 제안받거나 최근 7일 기록에 대한 조언을 확인합니다.

MCP 도구를 로컬에서 확인할 때는 서버를 켜 둔 상태에서 **다른 터미널**에서 실행합니다.

```powershell
node .\mcp-server\test-client.js
```

ChatGPT에서 MCP를 사용하려면 ChatGPT가 접근할 수 있는 서버 URL과 MCP 연결 설정이 별도로 필요합니다. 로컬 주소만으로는 외부 ChatGPT 연결이 되지 않습니다.

## 검증 기록

- 웹에서 여러 종목과 세트를 저장하고 웹 API와 MCP 조회에서 같은 데이터를 확인했습니다.
- 수정 시 운동 ID가 유지되고 값만 바뀌는 것, 수정 취소 시 값이 유지되는 것, 삭제 시 해당 기록만 제거되는 것을 확인했습니다.
- 선택한 종목과 같은 부위의 최근 기록, 종목별 최고 중량 데이터가 조회되는 것을 확인했습니다.
- AI가 기존 종목·부위 기록을 참고해 종목과 세트 구성을 제안하는 것을 확인했습니다.
- 최근 7일 기록이 없으면 안내만 표시하고, 테스트 기록 1건을 저장했을 때는 AI 분석과 조언이 표시되는 것을 확인했습니다. 테스트 기록은 확인 후 삭제했습니다.
- 운동 기록 수정·삭제의 처리 과정은 [마일스톤 문서](docs/fitlog-edit-delete-milestone.md)에 정리했습니다.
- [운동 메모 데이터 정리 및 가져오기](docs/fitlog-data-import-milestone.md)에 37일치 메모의 변환 기준과 검증 결과를 정리했습니다.

## 현재 범위

현재는 개인 로컬 사용을 기준으로 합니다. 사용자 계정과 전체 웹 API에 대한 인증, 여러 브라우저 탭 사이의 수정 충돌 감지는 구현하지 않았습니다. AI 접근 토큰은 AI 호출 경로만 보호하므로, 로컬 서버를 외부에 공개하기 전에는 운동 기록 API 전체의 접근 제어와 안정적인 호스팅이 필요합니다. 운동 조언은 저장된 데이터의 양과 정확도에 영향을 받으며 전문가의 평가를 대신하지 않습니다.
