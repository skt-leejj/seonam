# 스크립트 기술 분석서

`seonam-reservation-helper.user.js` v2.0의 구조, 동작 원리, 보안 우회 방법을 분석한 문서입니다.

---

## 1. 개요

| 항목 | 내용 |
|------|------|
| 대상 사이트 | yeyak.seoul.go.kr (서울시 공공서비스예약) |
| 대상 시설 | 서남센터 축구장 (rsv_svc_id: S210407133421401399) |
| 스크립트 유형 | Tampermonkey Userscript |
| 동작 페이지 | selectReservView.do (1페이지), insertFormReserve.do (2페이지) |
| 핵심 전략 | 2페이지에서 `.click()` 사용 회피 → `.checked=true` + `fn_Resev()` 직접 호출 |

---

## 2. 사이트 보안 체계

### 2.1 STCLab BotManager

서울시 예약 사이트는 2025년 7월부터 **STCLab BotManager** (매크로 차단 전용 솔루션)을 적용했습니다. 2025년 7~11월 동안 약 105만 건의 매크로 접근을 차단했습니다.

**주요 감지 방식:**

| 감지 레이어 | 설명 |
|------------|------|
| MouseEvent 속성 분석 | `.click()` 호출 시 `screenX/screenY = 0`, `clientX/clientY = 0` 감지 |
| 이벤트 시퀀스 분석 | 실제 클릭은 `mousemove → mouseover → mousedown → mouseup → click` 순서. `.click()`은 click만 단독 발생 |
| 행동 패턴 분석 | 클릭 간격, 마우스 이동 패턴, 타이핑 속도 등을 종합 분석 |
| 빈도/주기성 분석 | 접근 빈도, 주기적 패턴 감지 |
| 브라우저 핑거프린팅 | `navigator.webdriver`, headless 브라우저 시그니처 등 검사 |

### 2.2 기존 보안 장치

| 장치 | 설명 |
|------|------|
| Simple CAPTCHA | 이미지 기반 문자 입력 (`#simplecaptcha_answer`) |
| Google reCAPTCHA v3 | 사용자 행동 기반 점수 산출 (백그라운드) |
| 무작위 버튼 배열 | 예약하기 버튼 + 8개 더미 버튼이 무작위로 배치 |
| SMS 인증 | 본인 인증 |

### 2.3 차단 시 동작

차단 발생 시 `THREAT_CODE: DNP` 코드와 함께 "비정상 접근으로 인한 차단" 페이지로 리다이렉트됩니다.

---

## 3. 예약 사이트 DOM 구조

### 3.1 페이지 URL

```
1페이지: https://yeyak.seoul.go.kr/web/reservation/selectReservView.do?rsv_svc_id=S210407133421401399
2페이지: https://yeyak.seoul.go.kr/web/reservation/insertFormReserve.do?...
```

### 3.2 주요 DOM 요소

**1페이지 (시설 상세)**

| 요소 | 셀렉터 | 설명 |
|------|--------|------|
| 달력 날짜 버튼 | `#cal_YYYYMMDD` (예: `#cal_20260307`) | 날짜별 ID가 부여된 달력 셀 |
| 예약하기 버튼 | `a.common_btn.blue` | 날짜 선택 후 2페이지로 이동 |
| 달력 이전/다음 | `.cal_prev`, `.cal_next` | 달력 월 이동 버튼 |
| 팝업 닫기 | `.pop_x` | 시설 안내 팝업 닫기 |

**2페이지 (예약 신청)**

| 요소 | 셀렉터 | 설명 |
|------|--------|------|
| 날짜 셀 | `td.able a[data-ymd]` | 예약 가능 날짜 |
| 회차(시간대) | `a.rsv_unit_seq_row` | 시간대 선택 링크 (부모 `li.disable`이면 마감) |
| 인원 + 버튼 | `.user_plus` | 인원수 증가 |
| 동의 체크박스 | `#chk_agree1`, `#chk_agree2`, `#chk_agree3_1`, `#chk_agree_all` | 이용 동의 |
| CAPTCHA 입력 | `#simplecaptcha_answer` | CAPTCHA 문자 입력란 |
| CAPTCHA 이미지 | `#captchaImg` | CAPTCHA 이미지 |
| 예약 제출 함수 | `fn_Resev()` | 전역 함수, 폼 유효성 검사 + 제출 |
| 예약 버튼 (실제) | `.btn_book` (부모 `li.active`) | 무작위 배열 중 진짜 버튼 |
| 예약 버튼 (더미) | `.btn_book` (부모 `li.book_macro`) | 8개 더미 버튼 |

---

## 4. 스크립트 구조 분석

### 4.1 Userscript 헤더

```javascript
// @match   https://yeyak.seoul.go.kr/web/reservation/selectReservView.do*
// @match   https://yeyak.seoul.go.kr/web/reservation/insertFormReserve.do*
// @grant   GM_setValue
// @grant   GM_getValue
// @run-at  document-idle
```

| 속성 | 역할 |
|------|------|
| `@match` (x2) | 1페이지, 2페이지에서만 스크립트 실행 |
| `GM_setValue / GM_getValue` | Tampermonkey 전용 저장소 — 페이지 새로고침/이동 시에도 설정값 유지 |
| `@run-at document-idle` | DOM 로드 완료 후 실행 |

### 4.2 전체 구조

```
(IIFE)
├── 설정 관리 (loadConfig, saveConfig)
├── 페이지 감지 (isPage1, isPage2)
├── 유틸 함수 (log, beep)
├── UI 생성 (createUI, injectStyles)
├── 1페이지 로직
│   ├── buildPage1HTML() — 설정 입력 + 실행 버튼 UI
│   ├── initPage1() — 이벤트 바인딩 + autorun 체크
│   └── runPage1() — 날짜 클릭 + 예약하기 클릭 or 새로고침 대기
├── 2페이지 로직
│   ├── buildPage2HTML() — 6단계 UI
│   ├── initPage2() — 이벤트 바인딩
│   ├── runStep4() — 동의 체크 + CAPTCHA 포커스
│   └── runStep6() — fn_Resev() 호출
└── UI 헬퍼 (markStepDone, markStepActive, setupMinimize)
```

### 4.3 설정 저장 구조

```javascript
var CONFIG_KEY = 'seonam_config_v2';
// 저장 형태: { targetDate: '2026-03-07', targetTime: '08', headcount: 10 }
```

- `GM_setValue`/`GM_getValue` 사용 — localStorage와 달리 도메인과 무관하게 Tampermonkey 내부에 저장
- 1페이지에서 설정 → 2페이지에서 읽기 가능 (같은 스크립트의 저장소 공유)
- `seonam_autorun` 별도 플래그로 새로고침 후 자동 실행 제어

---

## 5. 핵심 동작 상세

### 5.1 1페이지: 날짜 선택 + 페이지 이동

```javascript
function runPage1() {
  var dateStr = config.targetDate.replace(/-/g, '');  // '2026-03-07' → '20260307'
  var calId = 'cal_' + dateStr;                        // 'cal_20260307'

  var dateButton = document.getElementById(calId);

  if (dateButton) {
    dateButton.click();                                // 달력 날짜 클릭
    document.querySelector('a.common_btn.blue').click(); // 예약하기 버튼 클릭
  } else {
    // 날짜 미표시 → 자동 새로고침 대기
    GM_setValue('seonam_autorun', true);
    // 3~5초 카운트다운 후 location.reload()
  }
}
```

**왜 1페이지에서는 `.click()`이 차단되지 않는가?**

1페이지(selectReservView.do)는 시설 정보 조회 페이지로, 예약 폼 제출이 발생하지 않습니다. BotManager의 행동 분석은 주로 **예약 신청 폼 제출 과정**(2페이지)에 집중됩니다. 1페이지에서의 달력 클릭과 페이지 이동은 일반적인 브라우징 행위로 분류되어 감지 임계값이 낮습니다.

### 5.2 오픈 대기 자동 새로고침

```javascript
// 날짜 미표시 시:
GM_setValue('seonam_autorun', true);  // 새로고침 후 자동 실행 플래그

var sec = 3 + Math.floor(Math.random() * 3);  // 3~5초 랜덤
// 카운트다운 후 location.reload()

// 새로고침 후 initPage1()에서:
var autoRun = GM_getValue('seonam_autorun', false);
if (autoRun) {
  // 팝업 닫기 → runPage1() 자동 실행
}
```

- `GM_setValue`를 사용하여 `location.reload()` 후에도 자동실행 상태 유지
- 3~5초 랜덤 간격으로 과도한 요청 방지
- 2페이지 진입 시 `GM_setValue('seonam_autorun', false)`로 플래그 초기화

### 5.3 2페이지 4단계: 동의 체크 (핵심)

```javascript
function runStep4() {
  // 동의 체크 — .checked = true (이벤트 발생 없음)
  var checkIds = ['chk_agree1', 'chk_agree2', 'chk_agree3_1', 'chk_agree_all'];
  checkIds.forEach(function (id) {
    var cb = document.getElementById(id);
    if (cb && !cb.disabled) {
      cb.checked = true;  // DOM 속성 직접 변경
    }
  });

  // CAPTCHA 입력란 포커스
  var captcha = document.getElementById('simplecaptcha_answer');
  if (captcha) {
    captcha.scrollIntoView({ behavior: 'auto', block: 'center' });
    captcha.focus();
  }
}
```

**`.checked = true` vs `.click()` 비교:**

| | `.click()` | `.checked = true` |
|---|---|---|
| MouseEvent 발생 | O (screenX=0, clientY=0) | X |
| change 이벤트 발생 | O | X |
| BotManager 감지 | **감지됨** | **감지 안됨** |
| 시각적 체크 표시 | O | 경우에 따라 안 될 수 있음 |
| 폼 제출 시 값 전송 | O | O |

핵심: BotManager는 **MouseEvent**를 감시합니다. `.checked = true`는 DOM 속성만 변경하고 어떤 이벤트도 발생시키지 않으므로 감지 대상이 아닙니다. 하지만 HTML 폼 제출 시에는 checkbox의 `checked` 속성값이 그대로 전송되므로 서버 측에서는 정상적으로 체크된 것으로 인식합니다.

### 5.4 2페이지 6단계: fn_Resev() 직접 호출

```javascript
function runStep6() {
  if (typeof unsafeWindow !== 'undefined' && typeof unsafeWindow.fn_Resev === 'function') {
    unsafeWindow.fn_Resev();
  } else if (typeof fn_Resev === 'function') {
    fn_Resev();
  }
}
```

**왜 `fn_Resev()` 직접 호출인가?**

예약 사이트의 제출 버튼은 무작위 배열(진짜 1개 + 더미 8개)로 되어 있습니다:
- 진짜 버튼: `li.active > .btn_book` → `onclick` 핸들러에서 `fn_Resev()` 호출
- 더미 버튼: `li.book_macro > .btn_book` → 클릭 시 차단

`fn_Resev()`를 직접 호출하면:
1. 무작위 배열에서 진짜 버튼을 찾을 필요 없음
2. 버튼 `.click()`을 사용하지 않으므로 MouseEvent 감지 회피
3. 함수 내부에서 폼 유효성 검사 + reCAPTCHA 토큰 생성 + 폼 제출을 정상 수행

**unsafeWindow 사용 이유:**

Tampermonkey는 `@grant`가 있을 때 스크립트를 **격리된 샌드박스**에서 실행합니다. 이 경우 페이지의 전역 변수(window.fn_Resev)에 직접 접근할 수 없습니다. `unsafeWindow`는 Tampermonkey가 제공하는 특수 객체로, 페이지의 실제 window 객체에 접근할 수 있게 해줍니다.

```
[Tampermonkey 샌드박스]          [페이지 window]
   스크립트 실행                    fn_Resev() 정의됨
   window.fn_Resev → undefined
   unsafeWindow.fn_Resev → 접근 가능!
```

---

## 6. 보안 우회 원리 요약

### 6.1 v1.x에서 차단된 이유

| 버전 | 차단 원인 |
|------|----------|
| v1.0 | `querySelectorAll('*')` 전체 DOM 탐색, 1~3초 간격 `location.reload()`, 2페이지에서 연속 `.click()` |
| v1.1 | 셀렉터 최적화했으나 2페이지에서 달력 `.click()` + 체크박스 `.click()` 여전히 감지 |
| v1.2 | 날짜 수동으로 변경했으나 시간대/인원/체크박스 `.click()` 여전히 감지 |
| v1.3 | 가이드 모드(하이라이트만)로 전환 — 직접 테스트 안 됨 |

### 6.2 v2.0에서 차단되지 않는 이유

| 동작 | 방식 | BotManager 감지 | 이유 |
|------|------|:---------------:|------|
| 1페이지 날짜 클릭 | `getElementById().click()` | X | 조회 페이지, 감지 임계값 낮음 |
| 1페이지 예약하기 | `querySelector().click()` | X | 페이지 이동만, 폼 제출 아님 |
| 2페이지 날짜/시간/인원 | 사용자 직접 클릭 | X | 실제 MouseEvent |
| 2페이지 동의 체크 | `.checked = true` | X | **이벤트 미발생** |
| 2페이지 CAPTCHA | 사용자 직접 입력 | X | 실제 키보드 이벤트 |
| 2페이지 예약 제출 | `fn_Resev()` 직접 호출 | X | **MouseEvent 없음, 함수 호출만** |

### 6.3 핵심 원칙

```
BotManager가 감시하는 것: MouseEvent (click, mousedown, mouseup, mousemove)
BotManager가 감시하지 않는 것: DOM 속성 변경, JavaScript 함수 호출

→ 2페이지에서 MouseEvent를 발생시키는 모든 프로그래밍 방식 조작을 제거
→ DOM 속성 직접 변경(.checked)과 함수 직접 호출(fn_Resev)만 사용
→ 사용자의 실제 클릭이 필요한 부분(날짜/시간/인원)은 수동으로 유지
```

---

## 7. UI 구성

### 7.1 패널 구조

```
#sh-panel (position: fixed, top-right, z-index: 999999)
├── .sh-title — 페이지 제목
├── .sh-minimize — 최소화 버튼
├── .sh-row (x3, 1페이지만) — 날짜/시간/인원 입력
├── .sh-step-area
│   └── .sh-step (x1 또는 x6) — 각 단계
│       ├── .sh-num — 단계 번호 (원형 배지)
│       ├── .sh-desc — 단계 설명
│       └── .sh-step-btn 또는 span — 실행 버튼 또는 "직접" 라벨
├── .sh-info — 현재 상태 메시지
├── .sh-refresh-info (1페이지) — 새로고침 카운트다운
└── #sh-log — 실행 로그
```

### 7.2 단계 상태

| CSS 클래스 | 시각적 표현 | 의미 |
|-----------|-----------|------|
| `.sh-step` (기본) | 회색 배경, 회색 번호 | 대기 중 |
| `.sh-step.active` | 파란 테두리, 파란 번호, 흰색 텍스트 | 현재 단계 |
| `.sh-step.done` | 녹색 테두리, 녹색 번호, 취소선 | 완료 |

### 7.3 알림음

```javascript
function beep() {
  var ctx = new AudioContext();
  // 880Hz 사인파 3연타 (0ms, 200ms, 400ms)
  // 각 150ms 길이, 볼륨 0.3
}
```

4단계(동의체크 + CAPTCHA 포커스) 완료 시 알림음이 울려 CAPTCHA 입력이 필요함을 알립니다.

---

## 8. 데이터 흐름

```
[사용자 설정 입력]
    │
    ▼
GM_setValue('seonam_config_v2', JSON)  ← 날짜/시간/인원 저장
    │
    ▼ (1페이지 실행)
getElementById('cal_YYYYMMDD').click()  ← 달력 날짜 클릭
querySelector('a.common_btn.blue').click()  ← 예약하기 → 2페이지 이동
    │
    ▼ (날짜 미오픈 시)
GM_setValue('seonam_autorun', true)  ← 자동실행 플래그
location.reload() (3~5초 후)
    │ (새로고침)
    ▼
GM_getValue('seonam_autorun') → true → runPage1() 자동 실행
    │
    ▼ (2페이지 진입)
GM_setValue('seonam_autorun', false)  ← 플래그 초기화
GM_getValue('seonam_config_v2')  ← 설정값 읽기 (시간/인원 표시용)
    │
    ▼ (사용자: 날짜/시간/인원 수동 선택)
    │
    ▼ (4단계 실행)
checkbox.checked = true  ← 동의 체크 (이벤트 없음)
captcha.focus()  ← CAPTCHA 입력란 포커스
    │
    ▼ (사용자: CAPTCHA 입력)
    │
    ▼ (6단계 실행)
fn_Resev()  ← 예약 제출 함수 직접 호출
```

---

## 9. 제한 사항

| 항목 | 설명 |
|------|------|
| 서남센터 전용 | `rsv_svc_id=S210407133421401399`에 맞춰져 있으나, 다른 시설도 동일한 DOM 구조면 동작 가능 |
| CAPTCHA 수동 | 이미지 CAPTCHA는 사용자가 직접 입력해야 함 |
| 무작위 버튼 우회 | `fn_Resev()` 직접 호출로 우회하지만, 사이트가 함수명을 변경하면 대응 필요 |
| reCAPTCHA v3 | 백그라운드 점수 산출은 여전히 동작 — 현재까지는 차단 없음 |
| 브라우저 종속 | Tampermonkey 확장 프로그램 필요 (Chrome, Edge, Firefox) |
