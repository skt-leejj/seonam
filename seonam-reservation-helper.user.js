// ==UserScript==
// @name         서남센터 축구장 예약 도우미
// @namespace    http://tampermonkey.net/
// @version      2.1
// @description  서울시 공공서비스예약 - 서남센터 축구장 단계별 예약 보조 도구
// @match        https://yeyak.seoul.go.kr/web/reservation/selectReservView.do*
// @match        https://yeyak.seoul.go.kr/web/reservation/insertFormReserve.do*
// @grant        GM_setValue
// @grant        GM_getValue
// @run-at       document-idle
// ==/UserScript==

(function () {
  'use strict';

  // ===== 설정 =====
  var CONFIG_KEY = 'seonam_config_v2';

  function loadConfig() {
    try {
      var saved = GM_getValue(CONFIG_KEY, null);
      if (saved) return JSON.parse(saved);
    } catch (e) {}
    return { targetDate: '', targetTime: '08', headcount: 10 };
  }

  function saveConfig(cfg) {
    GM_setValue(CONFIG_KEY, JSON.stringify(cfg));
  }

  var config = loadConfig();

  // ===== 페이지 감지 =====
  var isPage1 = location.href.indexOf('selectReservView.do') !== -1;
  var isPage2 = location.href.indexOf('insertFormReserve.do') !== -1;

  // ===== 유틸 =====
  function log(msg) {
    var el = document.getElementById('sh-log');
    if (el) {
      var t = new Date().toLocaleTimeString('ko-KR');
      el.textContent = '[' + t + '] ' + msg + '\n' + el.textContent;
    }
  }

  function beep() {
    try {
      var ctx = new (window.AudioContext || window.webkitAudioContext)();
      [0, 200, 400].forEach(function (d) {
        var o = ctx.createOscillator(), g = ctx.createGain();
        o.connect(g); g.connect(ctx.destination);
        o.frequency.value = 880; o.type = 'sine'; g.gain.value = 0.3;
        o.start(ctx.currentTime + d / 1000);
        o.stop(ctx.currentTime + d / 1000 + 0.15);
      });
    } catch (e) {}
  }

  // ===== 메인 UI =====
  function createUI() {
    var panel = document.createElement('div');
    panel.id = 'sh-panel';

    if (isPage1) {
      panel.innerHTML = buildPage1HTML();
    } else if (isPage2) {
      panel.innerHTML = buildPage2HTML();
    }

    document.body.appendChild(panel);
    injectStyles();

    if (isPage1) initPage1();
    if (isPage2) initPage2();
  }

  function injectStyles() {
    var s = document.createElement('style');
    s.textContent = '\
      #sh-panel {\
        position: fixed; top: 10px; right: 10px;\
        z-index: 999999; background: #1a1a2e; color: #eee;\
        border-radius: 12px; padding: 16px 18px; width: 340px;\
        font-family: "Malgun Gothic", sans-serif; font-size: 13px;\
        box-shadow: 0 4px 24px rgba(0,0,0,0.5); border: 1px solid #333;\
      }\
      #sh-panel .sh-title {\
        font-size: 15px; font-weight: bold; color: #4fc3f7;\
        margin-bottom: 14px; text-align: center;\
      }\
      #sh-panel .sh-row {\
        display: flex; align-items: center; margin-bottom: 8px; gap: 8px;\
      }\
      #sh-panel label {\
        width: 50px; font-weight: bold; color: #aaa; flex-shrink: 0; font-size: 12px;\
      }\
      #sh-panel input, #sh-panel select {\
        background: #16213e; color: #eee; border: 1px solid #444;\
        border-radius: 6px; padding: 5px 8px; font-size: 13px; flex: 1;\
      }\
      #sh-panel input:focus, #sh-panel select:focus {\
        border-color: #4fc3f7; outline: none;\
      }\
      #sh-panel .sh-step-area {\
        margin-top: 12px;\
      }\
      #sh-panel .sh-step {\
        display: flex; align-items: center; gap: 10px;\
        padding: 10px 12px; margin-bottom: 6px;\
        border-radius: 8px; background: #16213e; border: 1px solid #333;\
        transition: all 0.3s;\
      }\
      #sh-panel .sh-step.active {\
        border-color: #4fc3f7; background: #1b2d4a;\
      }\
      #sh-panel .sh-step.done {\
        border-color: #4caf50; background: #1a2e1a; opacity: 0.7;\
      }\
      #sh-panel .sh-step .sh-num {\
        width: 26px; height: 26px; border-radius: 50%;\
        display: flex; align-items: center; justify-content: center;\
        font-size: 13px; font-weight: bold; flex-shrink: 0;\
        background: #333; color: #888;\
      }\
      #sh-panel .sh-step.active .sh-num {\
        background: #4fc3f7; color: #000;\
      }\
      #sh-panel .sh-step.done .sh-num {\
        background: #4caf50; color: #fff;\
      }\
      #sh-panel .sh-step .sh-desc {\
        flex: 1; font-size: 12px; color: #999;\
      }\
      #sh-panel .sh-step.active .sh-desc {\
        color: #eee; font-weight: bold;\
      }\
      #sh-panel .sh-step.done .sh-desc {\
        color: #888; text-decoration: line-through;\
      }\
      #sh-panel .sh-step-btn {\
        padding: 5px 12px; border: none; border-radius: 6px;\
        font-size: 12px; font-weight: bold; cursor: pointer;\
        background: #4fc3f7; color: #000; flex-shrink: 0;\
        transition: background 0.2s;\
      }\
      #sh-panel .sh-step-btn:hover {\
        background: #81d4fa;\
      }\
      #sh-panel .sh-step-btn:disabled {\
        background: #333; color: #666; cursor: default;\
      }\
      #sh-panel .sh-step-btn.green {\
        background: #00c853; color: #fff;\
      }\
      #sh-panel .sh-step-btn.green:hover {\
        background: #00e676;\
      }\
      #sh-panel .sh-step-btn.orange {\
        background: #ff9800; color: #000;\
      }\
      #sh-panel .sh-step-btn.orange:hover {\
        background: #ffb74d;\
      }\
      #sh-log {\
        margin-top: 8px; padding: 6px; background: #0d1b2a;\
        border-radius: 6px; font-size: 10px; color: #666;\
        max-height: 60px; overflow-y: auto; white-space: pre-wrap;\
        font-family: monospace;\
      }\
      #sh-panel .sh-info {\
        margin-top: 8px; padding: 8px; background: #0d1b2a;\
        border-radius: 6px; font-size: 11px; color: #81c784;\
        text-align: center;\
      }\
      #sh-panel .sh-minimize {\
        position: absolute; top: 6px; right: 10px;\
        background: none; border: none; color: #888;\
        font-size: 18px; cursor: pointer; line-height: 1;\
      }\
      #sh-panel .sh-refresh-info {\
        font-size: 11px; color: #ff9800; text-align: center;\
        margin-top: 4px; padding: 4px;\
      }\
      @keyframes sh-pulse {\
        0%, 100% { opacity: 1; }\
        50% { opacity: 0.6; }\
      }\
      .sh-blink { animation: sh-pulse 1s infinite; }\
    ';
    document.head.appendChild(s);
  }

  // =========================================================
  //  1페이지 UI
  // =========================================================
  function buildPage1HTML() {
    return '\
      <div class="sh-title">1\uD398\uC774\uC9C0 - \uC2DC\uC124 \uC0C1\uC138</div>\
      <button class="sh-minimize" id="sh-min">_</button>\
      <div class="sh-row">\
        <label>\uB0A0\uC9DC</label>\
        <input type="date" id="sh-date" />\
      </div>\
      <div class="sh-row">\
        <label>\uC2DC\uAC04</label>\
        <select id="sh-time">\
          <option value="08">08:00~10:00</option>\
          <option value="10">10:00~12:00</option>\
          <option value="13">13:00~15:00</option>\
          <option value="15">15:00~17:00</option>\
        </select>\
      </div>\
      <div class="sh-row">\
        <label>\uC778\uC6D0</label>\
        <input type="number" id="sh-count" min="1" max="24" />\
      </div>\
      <div class="sh-step-area">\
        <div class="sh-step" id="sh-s1">\
          <div class="sh-num">1</div>\
          <div class="sh-desc">\uB0A0\uC9DC \uC120\uD0DD + \uC608\uC57D\uD558\uAE30 \u2192 2\uD398\uC774\uC9C0 \uC774\uB3D9</div>\
          <button class="sh-step-btn green" id="sh-run1">\uC2E4\uD589</button>\
        </div>\
      </div>\
      <div class="sh-info" id="sh-status">\uC124\uC815 \uD6C4 \uC2E4\uD589 \uBC84\uD2BC\uC744 \uB204\uB974\uC138\uC694</div>\
      <div class="sh-refresh-info" id="sh-refresh" style="display:none;">\uC624\uD508 \uB300\uAE30 \uC911... <span id="sh-countdown"></span>\uCD08 \uD6C4 \uC0C8\uB85C\uACE0\uCE68</div>\
      <div id="sh-log"></div>';
  }

  function initPage1() {
    // 값 복원
    document.getElementById('sh-date').value = config.targetDate || '';
    document.getElementById('sh-time').value = config.targetTime || '08';
    document.getElementById('sh-count').value = config.headcount || 10;

    // 최소화
    setupMinimize();

    // 입력 변경 시 자동 저장
    ['sh-date', 'sh-time', 'sh-count'].forEach(function (id) {
      document.getElementById(id).addEventListener('change', function () {
        readConfig();
        saveConfig(config);
      });
    });

    // 실행 버튼
    document.getElementById('sh-run1').addEventListener('click', function () {
      readConfig();
      saveConfig(config);
      if (!config.targetDate) {
        log('\uB0A0\uC9DC\uB97C \uC785\uB825\uD574\uC8FC\uC138\uC694!');
        return;
      }
      runPage1();
    });

    // autoStart 체크 (새로고침 후 자동 실행)
    var autoRun = GM_getValue('seonam_autorun', false);
    if (autoRun) {
      readConfig();
      log('\uC790\uB3D9 \uC7AC\uC2E4\uD589...');
      // 팝업 닫기 후 실행
      setTimeout(function () {
        var pop = document.querySelector('.pop_x');
        if (pop) pop.click();
        setTimeout(function () { runPage1(); }, 500);
      }, 800);
    }
  }

  function readConfig() {
    config.targetDate = document.getElementById('sh-date').value;
    config.targetTime = document.getElementById('sh-time').value;
    config.headcount = parseInt(document.getElementById('sh-count').value) || 10;
  }

  function runPage1() {
    var dateStr = config.targetDate.replace(/-/g, '');
    var calId = 'cal_' + dateStr;
    var btn = document.getElementById('sh-run1');
    var status = document.getElementById('sh-status');

    // 팝업 닫기
    var pop = document.querySelector('.pop_x');
    if (pop) pop.click();

    log('\uB0A0\uC9DC \uAC80\uC0C9: ' + dateStr + ' (id: ' + calId + ')');

    var dateButton = document.getElementById(calId);

    if (dateButton) {
      // 날짜 발견! → 클릭 → 예약하기 클릭
      dateButton.click();
      log('\uB0A0\uC9DC \uD074\uB9AD \uC644\uB8CC!');

      var reserveBtn = document.querySelector('a.common_btn.blue');
      if (reserveBtn) {
        reserveBtn.click();
        log('\uC608\uC57D\uD558\uAE30 \uD074\uB9AD \u2192 2\uD398\uC774\uC9C0 \uC774\uB3D9!');
        markStepDone('sh-s1');
        status.textContent = '2\uD398\uC774\uC9C0\uB85C \uC774\uB3D9 \uC911...';
        btn.disabled = true;
        btn.textContent = '\uC774\uB3D9\uC911';
      } else {
        log('\uC608\uC57D\uD558\uAE30 \uBC84\uD2BC \uBABB\uCC3E\uC74C');
        status.textContent = '\uC608\uC57D\uD558\uAE30 \uBC84\uD2BC\uC744 \uCC3E\uC744 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4';
      }
    } else {
      // 날짜 없음 → 오픈 대기 새로고침
      log('\uB0A0\uC9DC \uBBF8\uD45C\uC2DC - \uC624\uD508 \uB300\uAE30 \uC0C8\uB85C\uACE0\uCE68...');
      status.textContent = '\uC624\uD508 \uB300\uAE30 \uC911...';
      btn.disabled = true;
      btn.textContent = '\uB300\uAE30\uC911';
      btn.classList.add('sh-blink');

      // 자동 새로고침 설정
      GM_setValue('seonam_autorun', true);

      var refreshEl = document.getElementById('sh-refresh');
      var countdownEl = document.getElementById('sh-countdown');
      refreshEl.style.display = 'block';

      var sec = 3 + Math.floor(Math.random() * 3); // 3~5초
      countdownEl.textContent = sec;

      var timer = setInterval(function () {
        sec--;
        countdownEl.textContent = sec;
        if (sec <= 0) {
          clearInterval(timer);
          location.reload();
        }
      }, 1000);
    }
  }

  // =========================================================
  //  2페이지 UI
  // =========================================================
  function buildPage2HTML() {
    var timeLabel = { '08': '08:00~10:00', '10': '10:00~12:00', '13': '13:00~15:00', '15': '15:00~17:00' };
    var tl = timeLabel[config.targetTime] || '08:00~10:00';
    var hc = config.headcount || 10;

    return '\
      <div class="sh-title">2\uD398\uC774\uC9C0 - \uC608\uC57D \uC2E0\uCCAD</div>\
      <button class="sh-minimize" id="sh-min">_</button>\
      <div class="sh-step-area">\
        <div class="sh-step active" id="sh-s1">\
          <div class="sh-num">1</div>\
          <div class="sh-desc">\uB0A0\uC9DC \uC120\uD0DD (\uB2EC\uB825\uC5D0\uC11C \uC9C1\uC811 \uD074\uB9AD)</div>\
          <span style="color:#ff9800;font-size:11px;font-weight:bold;">\uC9C1\uC811</span>\
        </div>\
        <div class="sh-step" id="sh-s2">\
          <div class="sh-num">2</div>\
          <div class="sh-desc">\uD68C\uCC28 \uC120\uD0DD: ' + tl + '</div>\
          <span style="color:#ff9800;font-size:11px;font-weight:bold;">\uC9C1\uC811</span>\
        </div>\
        <div class="sh-step" id="sh-s3">\
          <div class="sh-num">3</div>\
          <div class="sh-desc">\uC778\uC6D0 \uC120\uD0DD: ' + hc + '\uBA85</div>\
          <span style="color:#ff9800;font-size:11px;font-weight:bold;">\uC9C1\uC811</span>\
        </div>\
        <div class="sh-step" id="sh-s4">\
          <div class="sh-num">4</div>\
          <div class="sh-desc">\uB3D9\uC758\uCCB4\uD06C + CAPTCHA \uD3EC\uCEE4\uC2A4</div>\
          <button class="sh-step-btn green" id="sh-run4">\uC2E4\uD589</button>\
        </div>\
        <div class="sh-step" id="sh-s5">\
          <div class="sh-num">5</div>\
          <div class="sh-desc">CAPTCHA \uC785\uB825 (\uC9C1\uC811 \uC785\uB825)</div>\
          <span style="color:#ff9800;font-size:11px;font-weight:bold;">\uC9C1\uC811</span>\
        </div>\
        <div class="sh-step" id="sh-s6">\
          <div class="sh-num">6</div>\
          <div class="sh-desc">\uC608\uC57D\uD558\uAE30 (fn_Resev \uD638\uCD9C)</div>\
          <button class="sh-step-btn orange" id="sh-run6">\uC608\uC57D!</button>\
        </div>\
      </div>\
      <div class="sh-info" id="sh-status">1~3\uB2E8\uACC4 \uC218\uB3D9 \uC644\uB8CC \uD6C4 \u2192 4\uB2E8\uACC4 \uC2E4\uD589</div>\
      <div id="sh-log"></div>';
  }

  function initPage2() {
    // autorun 플래그 초기화
    GM_setValue('seonam_autorun', false);

    setupMinimize();

    // 4단계 실행 버튼: 주소 + 동의체크 + CAPTCHA 포커스
    document.getElementById('sh-run4').addEventListener('click', function () {
      runStep4();
    });

    // 6단계 예약 버튼: fn_Resev() 호출
    document.getElementById('sh-run6').addEventListener('click', function () {
      runStep6();
    });

    log('2\uD398\uC774\uC9C0 \uC900\uBE44 \uC644\uB8CC');
    log('1~3\uB2E8\uACC4: \uB0A0\uC9DC/\uD68C\uCC28/\uC778\uC6D0 \uC9C1\uC811 \uC120\uD0DD');
    log('4\uB2E8\uACC4: \uC2E4\uD589 \uBC84\uD2BC \uD074\uB9AD');
    log('5\uB2E8\uACC4: CAPTCHA \uC9C1\uC811 \uC785\uB825');
    log('6\uB2E8\uACC4: \uC608\uC57D! \uBC84\uD2BC \uD074\uB9AD');
  }

  // 4단계: 주소 입력 + 동의 체크 + CAPTCHA 포커스
  function runStep4() {
    var btn = document.getElementById('sh-run4');
    var status = document.getElementById('sh-status');

    // 동의 체크 (.checked = true — .click() 사용 안 함!)
    var checkIds = ['chk_agree1', 'chk_agree2', 'chk_agree3_1', 'chk_agree_all'];
    checkIds.forEach(function (id) {
      var cb = document.getElementById(id);
      if (cb && !cb.disabled) {
        cb.checked = true;
      }
    });
    log('\uB3D9\uC758 \uCCB4\uD06C \uC644\uB8CC');

    // CAPTCHA 포커스
    var captcha = document.getElementById('simplecaptcha_answer');
    if (captcha) {
      captcha.scrollIntoView({ behavior: 'auto', block: 'center' });
      captcha.focus();
      log('CAPTCHA \uC785\uB825\uB780 \uD3EC\uCEE4\uC2A4');
    }

    // UI 업데이트
    markStepDone('sh-s4');
    markStepActive('sh-s5');
    btn.disabled = true;
    btn.textContent = '\uC644\uB8CC';
    status.textContent = 'CAPTCHA \uC785\uB825 \uD6C4 \u2192 6\uB2E8\uACC4 \uC608\uC57D! \uD074\uB9AD';
    beep();
  }

  // 6단계: fn_Resev() 호출
  function runStep6() {
    var btn = document.getElementById('sh-run6');
    var status = document.getElementById('sh-status');

    log('\uC608\uC57D \uC2E0\uCCAD \uC2E4\uD589!');

    if (typeof unsafeWindow !== 'undefined' && typeof unsafeWindow.fn_Resev === 'function') {
      unsafeWindow.fn_Resev();
      markStepDone('sh-s6');
      btn.disabled = true;
      btn.textContent = '\uC644\uB8CC';
      status.textContent = '\uC608\uC57D \uC2E0\uCCAD \uC644\uB8CC!';
      log('fn_Resev() \uD638\uCD9C \uC131\uACF5!');
    } else if (typeof fn_Resev === 'function') {
      fn_Resev();
      markStepDone('sh-s6');
      btn.disabled = true;
      btn.textContent = '\uC644\uB8CC';
      status.textContent = '\uC608\uC57D \uC2E0\uCCAD \uC644\uB8CC!';
      log('fn_Resev() \uD638\uCD9C \uC131\uACF5!');
    } else {
      log('fn_Resev \uD568\uC218\uB97C \uCC3E\uC744 \uC218 \uC5C6\uC74C');
      status.textContent = 'fn_Resev \uD568\uC218 \uBBF8\uBC1C\uACAC - \uC218\uB3D9 \uC608\uC57D \uD544\uC694';
    }
  }

  // ===== UI 헬퍼 =====
  function markStepDone(id) {
    var el = document.getElementById(id);
    if (el) {
      el.className = 'sh-step done';
    }
  }

  function markStepActive(id) {
    var el = document.getElementById(id);
    if (el) {
      el.className = 'sh-step active';
    }
  }

  function setupMinimize() {
    var minBtn = document.getElementById('sh-min');
    var panel = document.getElementById('sh-panel');
    var minimized = false;

    if (minBtn) {
      minBtn.addEventListener('click', function () {
        minimized = !minimized;
        var content = panel.querySelectorAll('.sh-step-area, .sh-info, #sh-log, .sh-row, .sh-refresh-info');
        for (var i = 0; i < content.length; i++) {
          content[i].style.display = minimized ? 'none' : '';
        }
        minBtn.textContent = minimized ? '+' : '_';
        panel.style.width = minimized ? '120px' : '340px';
      });
    }
  }

  // ===== 시작 =====
  function init() {
    // document-idle 시점에는 DOM이 이미 준비되어 있으므로 즉시 실행
    // (readyState 체크 + window.load 리스너 방식은 Tampermonkey 샌드박스 모드에서
    //  window 프록시 객체가 load 이벤트를 못 잡는 경우가 있어 UI가 안 나올 수 있음)
    if (document.body) {
      createUI();
    } else {
      document.addEventListener('DOMContentLoaded', createUI);
    }
  }

  init();

})();
