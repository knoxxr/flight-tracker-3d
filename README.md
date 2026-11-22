# AeroGlobe 3D — 전 세계 실시간 ADS-B 항공기 3D 추적 프로그램

> **라이브 웹 데모 (GitHub Pages):** https://knoxxr.github.io/flight-tracker-3d/

전 세계 실제 비행 중인 항공기의 **100% 실시간 ADS-B 트랜스폰더 데이터만**을 3D 지구본 위에 시각화하는 실시간 항공 추적 웹 애플리케이션입니다. (시뮬레이션/가상 항공기 데이터 없음)

## 주요 기능

- **100% 실시간 ADS-B 데이터 수신 (시뮬레이션 제외)**
  - **전 세계 피드 (`OpenSky Network`)**: `https://opensky-network.org/api/states/all`에서 전 세계 실제 비행 중인 항공기 최대 1,500대 실시간 표시
  - **화면 주변 피드 (`adsb.fi Open Data v3`)**: `https://opendata.adsb.fi/api/v3/lat/{lat}/lon/{lon}/dist/250`에서 현재 3D 지구본 화면 중심 반경 250NM 내 실제 항공기(기종·등록번호 포함) 실시간 표시
  - OpenSky 익명 요청 제한(HTTP 429) 시 자동으로 실제 **adsb.fi 실시간 피드**로 전환하며, 가짜/시뮬레이션 데이터는 표시하지 않습니다.
  - 실시간 수신 패킷 사이는 실제 대지속도와 진방위 기반 **1배속 추측 항법(Dead Reckoning)**으로 부드럽게 보간
- **커스텀 3D 구면 지구본 렌더링 (`public/globe.js`)**
  - 드래그 관성 회전, 줌 인/아웃, 지역별 퀵 카메라 프리셋 (`한국·동아시아`, `전 세계`, `유럽`, `북미`, `중동`, `북대서양`, `태평양`)
  - 현재 UTC 시각 기반 **실시간 태양광 밤/낮 그림자** 및 야간 도시 불빛
  - 선택 항공기의 **실시간 누적 비행 궤적(3D Track)**, 예상 진행 방향 벡터, 실시간 수신 고도 추이 그래프 및 카메라 자동 추적(Follow)

## 실행 방법 (로컬 Node.js 서버)

```bash
npm start
```

OpenSky 익명 호출 제한을 완화하려면 `.env.example`을 `.env`로 복사해 OpenSky 계정(또는 OAuth2) 정보를 입력하세요.

## 테스트 실행

```bash
npm test
```

## 데이터 출처

- [OpenSky Network](https://opensky-network.org/) — 글로벌 실시간 ADS-B 상태 벡터
- [adsb.fi](https://adsb.fi/) — 지역 실시간 ADS-B 오픈 데이터
