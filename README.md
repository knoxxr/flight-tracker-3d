# AeroGlobe 3D — 전 세계 실시간 항공기 3D 추적 프로그램

> **라이브 웹 데모 (GitHub Pages):** https://knoxxr.github.io/flight-tracker-3d/

전 세계 항공기의 실시간 위치를 인터랙티브 3D 지구본 위에 시각화하고, 고도·속도·방위각·대권 항로·기체 정보를 추적할 수 있는 Node.js + HTML5 3D 지구본 웹 애플리케이션입니다.

## 주요 기능

- **실시간 3D 지구본 렌더링 (`public/globe.js`)**
  - 정사 투영 기반 3D 구면 회전, 드래그 관성, 줌 인/아웃, 부드러운 카메라 `flyTo` 전환
  - 구면 지평선 클리핑(Horizon Clipping)이 적용된 전 세계 대륙·주요 도서 해안선 렌더링
  - 현재 UTC 시각 기반 **실시간 태양 위치(밤/낮 그림자)** 및 야간 주요 도시 불빛 표현
  - 항공기 실제 고도를 반영한 3D 고도 부양 표시 및 지상 수직 투영선(Drop Line)
  - 선택 항공기의 출발지 → 도착지 **3D 대권 항로 아크(Great Circle Arc)** 시각화
- **실시간 ADS-B 연동 + 지능형 시뮬레이션 폴백 (`src/opensky.js`, `src/simulator.js`)**
  - **OpenSky Network REST API** (`/api/states/all`) 연동 지원 (익명, Basic Auth, OAuth2 모두 지원)
  - API 호출 제한(HTTP 429) 또는 오프라인 환경에서도 끊김 없이 작동하도록 60여 개 글로벌 허브 공항과 350대 이상의 국제선 대권 항로 물리 시뮬레이션 엔진 자동 전환
  - **Server-Sent Events (SSE)** 실시간 스트리밍 + 클라이언트 측 60fps 추측 항법(Dead Reckoning) 보간
- **항공기 탐색 및 텔레메트리 인스펙터**
  - 편명, 항공사, 공항 코드(예: `KAL`, `ICN`, `LHR`, `JFK`), ICAO24 실시간 검색
  - 지역별 퀵 카메라 프리셋 (한국·동아시아, 전 세계, 유럽, 북미, 중동, 북대서양, 태평양)
  - 항공기 클릭 시 고도(ft/m), 속도(kts/km/h), 방위각, 수직속도(fpm), 좌표, Squawk, 고도 프로파일 차트 및 카메라 추적(Follow) 기능

## 프로젝트 구조

```text
flight-tracker-3d/
├── package.json
├── .env.example
├── README.md
├── src/
│   ├── server.js          # HTTP + SSE 백엔드 및 정적 파일 서버
│   ├── opensky.js         # OpenSky Network ADS-B 실시간 API 클라이언트
│   ├── simulator.js       # 전 세계 대권 항로(SLERP) 항공기 물리 시뮬레이터
│   └── airports.js        # 전 세계 주요 허브 공항 데이터베이스 (60+ 공항)
├── public/
│   ├── index.html         # 메인 웹 UI
│   ├── styles.css         # 항공 관제 테마 스타일시트
│   ├── globe.js           # 3D 구면 지구본 & 항공기 렌더링 엔진
│   ├── world-data.js      # 전 세계 대륙/도서 해안선 폴리곤 & 도시 좌표
│   └── app.js             # SSE 수신, 60fps 보간, 검색 및 인스펙터 컨트롤러
└── test/
    └── flight-tracker.test.js  # 단위 및 HTTP API 통합 테스트
```

## 실행 방법

외부 npm 의존성 없이 **Node.js 20+**만으로 바로 실행됩니다.

```bash
cd flight-tracker-3d
npm start
```

브라우저에서 서버 주소(기본 포트 `3000`)로 접속하면 3D 실시간 항공기 추적기가 실행됩니다.

### OpenSky Network 실시간 ADS-B 인증 설정 (선택)

익명 호출은 OpenSky 요청 제한이 엄격하므로, 무료 계정의 자격 증명을 `.env` 파일에 설정하면 더 안정적으로 실시간 데이터를 수신할 수 있습니다.

```bash
cp .env.example .env
# .env 파일에 OPENSKY_CLIENT_ID / OPENSKY_CLIENT_SECRET 또는 OPENSKY_USERNAME / OPENSKY_PASSWORD 입력
```

## 테스트 실행

```bash
npm test
```

## REST / SSE API 엔드포인트

| 엔드포인트 | 설명 |
| --- | --- |
| `GET /api/flights?mode=auto\|live\|simulation&q=...` | 실시간 항공기 목록 조회 및 검색 |
| `GET /api/flights/:icao24` | 특정 항공기 상세 텔레메트리 및 최근 궤적 조회 |
| `GET /api/stream?mode=auto\|live\|simulation` | Server-Sent Events(SSE) 실시간 스트림 |
| `GET /api/airports` | 전 세계 주요 허브 공항 목록 |
| `GET /api/status` | 현재 데이터 소스 및 OpenSky 연결 상태 |
| `GET /api/health` | 서버 헬스 체크 |
