/**
 * FLAS — Google Apps Script Push 동기화
 *
 * 설치 방법:
 *   1. Google Sheets 열기 → 확장 프로그램 → Apps Script
 *   2. 이 코드 전체 붙여넣기
 *   3. FLAS_SERVER_URL을 실제 서버 주소로 변경
 *   4. 저장(Ctrl+S) → 실행: pushToFLAS() 한 번 수동 실행하여 권한 허용
 *   5. 자동 주기 설정: setTrigger() 실행 (15분마다 자동 동기화)
 *
 * 수동 실행:
 *   상단 메뉴 "FLAS 동기화" → "지금 동기화" 클릭
 */

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  ★ 여기만 수정하세요
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
var FLAS_SERVER_URL = 'https://your-flas-server.com'; // 예: https://flas.railway.app
var SHEET_GID       = 1283549642;  // 수주 프로젝트 시트 GID (생산입력 탭)
var SKIP_ROWS       = 1;           // 헤더 행 수 (건너뛸 행) — 헤더가 1행이면 1
var NOTIFY_EMAIL    = '';          // 오류 발생 시 알림 이메일 (빈 칸이면 미발송)

// 컬럼 인덱스 (0-based, A열=0, B열=1 …)
// ※ debugColumns() 실행 결과 기준 — 실제 시트: 생산입력 (23개 컬럼)
var COL = {
  PROJECT_CODE : 1,   // B: 프로젝트코드
  DIVISION     : 2,   // C: 사업부구분 (BU)
  CLIENT       : 3,   // D: 발주처
  ITEM         : 4,   // E: ITEM
  PRODUCT_GROUP: 5,   // F: 제품군
  SHOP_CODE    : 11,  // L: SHOP (공장 코드/약칭, fallback)
  QUANTITY     : 12,  // M: 계약수량
  END_DATE     : 14,  // O: 변경납기일 (최종 납기)
  SHOP         : 18,  // S: 공장 (전체 공장명 — 주 사용)
  START_DATE   : 20,  // U: 변경납기일-조립기간 (착수일)
  DIMENSIONS   : 21,  // V: 면적(M) — "가로 x 세로" 합쳐진 형식
  ZONE         : 22,  // W: 작업동
};
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━


/**
 * 메뉴 추가 (시트 열 때 자동 표시)
 */
function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('FLAS 동기화')
    .addItem('지금 동기화', 'pushToFLAS')
    .addSeparator()
    .addItem('📋 컬럼 구조 확인', 'debugColumns')
    .addItem('🔍 면적/날짜 샘플 확인', 'debugDimSamples')
    .addItem('🏭 공장별 zone 요약', 'debugFactorySummary')
    .addSeparator()
    .addItem('자동 동기화 설정 (15분)', 'setTrigger')
    .addItem('자동 동기화 해제', 'removeTrigger')
    .addItem('동기화 로그 확인', 'showLog')
    .addToUi();
}


/**
 * 시트의 실제 컬럼 구조를 읽어 스크립트 상단에 기록
 * → 동기화 전에 반드시 먼저 실행해서 COL 인덱스를 맞춰야 합니다.
 */
function debugColumns() {
  var ss    = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = getProjectSheet(ss);

  if (!sheet) {
    showAlert('오류', '시트를 찾을 수 없습니다. SHEET_GID(' + SHEET_GID + ')를 확인하세요.\n\n현재 시트 목록:\n' +
      ss.getSheets().map(function(s) { return s.getName() + ' (gid=' + s.getSheetId() + ')'; }).join('\n'));
    return;
  }

  // 1~2행 헤더와 3번째 데이터 샘플 읽기
  var allData = sheet.getDataRange().getValues();
  var row1    = allData[0] || [];  // 1번째 헤더행
  var row2    = allData[1] || [];  // 2번째 헤더행 (병합된 경우)
  var sample  = allData[SKIP_ROWS] || [];  // 첫 번째 데이터행

  // 결과 시트에 기록
  var logSheet = ss.getSheetByName('FLAS_COL_DEBUG');
  if (!logSheet) {
    logSheet = ss.insertSheet('FLAS_COL_DEBUG');
  } else {
    logSheet.clearContents();
  }

  logSheet.appendRow(['인덱스(0-base)', '열(A=1)', '헤더1행', '헤더2행', '샘플데이터', '매핑 항목']);

  var KNOWN = {
    '프로젝트코드'  : 'PROJECT_CODE',
    '사업부'        : 'DIVISION',
    '사업부구분'    : 'DIVISION',
    'BU'            : 'DIVISION',
    '발주처'        : 'CLIENT',
    '고객사'        : 'CLIENT',
    'ITEM'          : 'ITEM',
    '제품군'        : 'PRODUCT_GROUP',
    'SHOP'          : 'SHOP',
    '공장'          : 'SHOP',
    '납기'          : 'END_DATE',
    '납기일'        : 'END_DATE',
    '변경납기'      : 'END_DATE',
    '착수일'        : 'START_DATE',
    '시작일'        : 'START_DATE',
    '가로'          : 'WIDTH_M',
    '세로'          : 'HEIGHT_M',
    '작업동'        : 'ZONE',
    '구역'          : 'ZONE',
    '수량'          : 'QUANTITY',
    '여유율'        : 'MARGIN_RATE',
  };

  var maxCols = Math.max(row1.length, row2.length, sample.length);
  for (var i = 0; i < maxCols; i++) {
    var h1  = String(row1[i] || '').trim();
    var h2  = String(row2[i] || '').trim();
    var val = String(sample[i] || '').trim();
    var col = String.fromCharCode(65 + (i % 26));  // A~Z 간단 표기
    if (i >= 26) col = String.fromCharCode(65 + Math.floor(i/26) - 1) + col;

    // 자동 매핑 추측
    var guess = '';
    for (var keyword in KNOWN) {
      if (h1.indexOf(keyword) !== -1 || h2.indexOf(keyword) !== -1) {
        guess = KNOWN[keyword]; break;
      }
    }

    logSheet.appendRow([i, col, h1, h2, val.slice(0, 50), guess]);
  }

  logSheet.getRange(1, 1, 1, 6).setFontWeight('bold').setBackground('#4a86e8').setFontColor('white');
  logSheet.autoResizeColumns(1, 6);
  ss.setActiveSheet(logSheet);

  showAlert(
    '📋 컬럼 구조 확인 완료',
    '시트명: ' + sheet.getName() + ' (gid=' + sheet.getSheetId() + ')\n' +
    '총 ' + maxCols + '개 컬럼\n\n' +
    '→ FLAS_COL_DEBUG 탭에서 확인하세요.\n' +
    '"매핑 항목" 열에 추측값이 표시됩니다.\n\n' +
    '인덱스(0-base)를 확인한 뒤\n' +
    'Apps Script의 COL 블록을 수정하세요.'
  );
}


/**
 * 메인 함수: 시트 데이터를 읽어 FLAS 서버로 전송
 */
function pushToFLAS() {
  var ss    = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = getProjectSheet(ss);

  if (!sheet) {
    showAlert('오류', '수주 프로젝트 시트를 찾을 수 없습니다. SHEET_GID를 확인하세요.');
    return;
  }

  var data = sheet.getDataRange().getValues();
  var rows = [];

  for (var i = SKIP_ROWS; i < data.length; i++) {
    var row = data[i];

    var projectCode = String(row[COL.PROJECT_CODE] || '').trim();
    if (!projectCode) continue;

    // 공장명: S열(공장) 우선, 비어있으면 L열(SHOP 코드) 사용
    var shopName = String(row[COL.SHOP] || '').trim();
    if (!shopName) shopName = String(row[COL.SHOP_CODE] || '').trim();

    var zoneName  = String(row[COL.ZONE]     || '').trim();
    var endDate   = formatDate(row[COL.END_DATE]);
    var startDate = formatDate(row[COL.START_DATE]);

    // 착수일(U열) 없으면 납기일 90일 전으로 추정
    if (!startDate && endDate) {
      var fallback = new Date(endDate);
      fallback.setDate(fallback.getDate() - 90);
      startDate = formatDate(fallback);
    }

    if (!shopName || !zoneName || !endDate || !startDate) continue;

    // 착수일이 납기일보다 늦으면 보정
    if (startDate >= endDate) {
      var adjusted = new Date(endDate);
      adjusted.setDate(adjusted.getDate() - 30);
      startDate = formatDate(adjusted);
    }

    // V열: "가로 x 세로" 합쳐진 형식 파싱 → widthM, heightM 분리
    var dims = parseDimensions(row[COL.DIMENSIONS]);
    if (!dims) continue;  // 면적 없는 행 스킵

    var quantity = String(row[COL.QUANTITY] || '1').trim();
    if (!quantity || isNaN(Number(quantity))) quantity = '1';

    rows.push({
      projectCode  : projectCode,
      division     : String(row[COL.DIVISION]      || '').trim() || undefined,
      client       : String(row[COL.CLIENT]         || '').trim() || undefined,
      item         : String(row[COL.ITEM]           || '').trim() || undefined,
      productGroup : String(row[COL.PRODUCT_GROUP]  || '').trim() || undefined,
      shopName     : shopName,
      endDate      : endDate,
      startDate    : startDate,
      widthM       : dims.widthM,
      heightM      : dims.heightM,
      quantity     : quantity,
      marginRate   : '0',   // 시트에 여유율 컬럼 없음 → 0% 기본값
      zoneName     : zoneName,
    });
  }

  // 공장 배치 없는 행도 프로젝트 정보는 수집 (사업부문 보존)
  var allStubs = {};
  for (var si = SKIP_ROWS; si < data.length; si++) {
    var srow = data[si];
    var scode = String(srow[COL.PROJECT_CODE] || '').trim();
    if (!scode || allStubs[scode]) continue;
    allStubs[scode] = {
      projectCode: scode,
      division: String(srow[COL.DIVISION] || '').trim() || undefined,
      client:   String(srow[COL.CLIENT]   || '').trim() || undefined,
    };
  }
  var stubsArray = Object.values(allStubs);

  if (rows.length === 0 && stubsArray.length === 0) {
    logAndAlert('경고', '유효한 데이터 행이 없습니다. 컬럼 인덱스(COL)를 확인하세요.');
    return;
  }

  // Vercel 함수 타임아웃(10~60초) 대응: 200행씩 분할 전송
  var BATCH_SIZE = 200;
  var url = FLAS_SERVER_URL.replace(/\/$/, '') + '/api/admin/push-projects';
  var totalProjects = 0, totalAssignments = 0, totalSkipped = 0, totalDeleted = 0;
  var allSkipReasons = {}, allSkipSamples = [];
  var errors = [];

  for (var batchStart = 0; batchStart < rows.length; batchStart += BATCH_SIZE) {
    var batch = rows.slice(batchStart, batchStart + BATCH_SIZE);
    var isFirst = batchStart === 0;

    try {
      var response = UrlFetchApp.fetch(url, {
        method      : 'post',
        contentType : 'application/json',
        payload     : JSON.stringify({
          rows: batch,
          replaceExisting: isFirst,
          allStubs: isFirst ? stubsArray : undefined,
        }),
        muteHttpExceptions: true,
        headers     : { 'X-FLAS-Source': 'apps-script', 'X-Sheet-Id': ss.getId() },
      });

      var code = response.getResponseCode();
      var body = response.getContentText();

      if (code !== 200) {
        errors.push('배치 ' + (batchStart/BATCH_SIZE+1) + ' HTTP ' + code + ': ' + body.slice(0, 100));
        continue;
      }

      var result;
      try { result = JSON.parse(body); }
      catch (e) {
        errors.push('배치 ' + (batchStart/BATCH_SIZE+1) + ' JSON 파싱 실패: ' + body.slice(0, 100));
        continue;
      }

      totalProjects    += result.projectsUpserted    || 0;
      totalAssignments += result.assignmentsUpserted || 0;
      totalSkipped     += result.skipped             || 0;
      totalDeleted     += result.projectsDeleted     || 0;

      if (result.skippedByReason) {
        for (var r in result.skippedByReason) {
          allSkipReasons[r] = (allSkipReasons[r] || 0) + result.skippedByReason[r];
        }
      }
      if (result.skippedSamples) {
        allSkipSamples = allSkipSamples.concat(result.skippedSamples).slice(0, 5);
      }

    } catch (e) {
      errors.push('배치 ' + (batchStart/BATCH_SIZE+1) + ' 요청 실패: ' + e.toString().slice(0, 100));
    }
  }

  var batches = Math.ceil(rows.length / BATCH_SIZE);
  var msg = (errors.length === 0 ? '✅' : '⚠') + ' 동기화 완료 (' + batches + '배치)\n' +
            '프로젝트: ' + totalProjects + '건\n' +
            '배치: '     + totalAssignments + '건\n' +
            '스킵: '     + totalSkipped + '건\n' +
            '삭제: '     + totalDeleted + '건';

  if (errors.length > 0) {
    msg += '\n\n── 오류 ──\n' + errors.join('\n');
  }
  if (totalSkipped > 0 && Object.keys(allSkipReasons).length > 0) {
    msg += '\n\n── 스킵 이유 ──';
    for (var sr in allSkipReasons) msg += '\n• ' + sr + ': ' + allSkipReasons[sr] + '건';
  }
  if (allSkipSamples.length > 0) {
    msg += '\n\n── 샘플 ──';
    allSkipSamples.slice(0, 3).forEach(function(sp) {
      msg += '\n[' + sp.reason + '] ' + (sp.projectCode||'') + ' / ' + (sp.shopName||'') + ' / ' + (sp.zoneName||'');
    });
  }

  writeLog(errors.length === 0 ? 'SUCCESS' : 'WARN',
    rows.length + '행 / ' + batches + '배치 → 프로젝트:' + totalProjects + ' 배치:' + totalAssignments + ' 스킵:' + totalSkipped);
  showAlert('FLAS 동기화', msg);
}


/**
 * 15분마다 자동 동기화 트리거 설정
 */
function setTrigger() {
  // 기존 트리거 제거 후 재등록
  removeTrigger();
  ScriptApp.newTrigger('pushToFLAS')
    .timeBased()
    .everyMinutes(15)
    .create();
  showAlert('완료', '15분마다 자동 동기화가 설정되었습니다.');
}

function removeTrigger() {
  ScriptApp.getProjectTriggers().forEach(function(t) {
    if (t.getHandlerFunction() === 'pushToFLAS') ScriptApp.deleteTrigger(t);
  });
}


// ── 내부 유틸 ────────────────────────────────────────────

function getProjectSheet(ss) {
  // GID로 찾기
  var sheets = ss.getSheets();
  for (var i = 0; i < sheets.length; i++) {
    if (sheets[i].getSheetId() === SHEET_GID) return sheets[i];
  }
  // fallback: 이름에 "수주" 또는 "프로젝트" 포함
  for (var j = 0; j < sheets.length; j++) {
    var name = sheets[j].getName();
    if (/수주|프로젝트/i.test(name)) return sheets[j];
  }
  return null;
}

/**
 * 공장별 zone명 + 면적값 요약 — "unknown zone" 원인 파악용
 * 실행하면 FLAS_COL_DEBUG 탭에 공장별 고유 zone 목록과 면적 샘플을 기록합니다.
 */
function debugFactorySummary() {
  var ss    = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = getProjectSheet(ss);
  if (!sheet) { showAlert('오류', '시트를 찾을 수 없습니다.'); return; }

  var data = sheet.getDataRange().getValues();

  // 공장별 { zone Set, dim samples, count } 집계
  var factories = {};
  for (var i = SKIP_ROWS; i < data.length; i++) {
    var row = data[i];
    var code = String(row[COL.PROJECT_CODE] || '').trim();
    if (!code) continue;

    var shop = String(row[COL.SHOP] || '').trim() || String(row[COL.SHOP_CODE] || '').trim();
    var zone = String(row[COL.ZONE] || '').trim();
    var dim  = String(row[COL.DIMENSIONS] || '').trim();

    if (!shop) shop = '(공장없음)';
    if (!factories[shop]) factories[shop] = { zones: {}, dimSamples: [], count: 0 };
    factories[shop].count++;
    if (zone) factories[shop].zones[zone] = (factories[shop].zones[zone] || 0) + 1;
    if (dim && factories[shop].dimSamples.length < 3) factories[shop].dimSamples.push(dim);
  }

  var logSheet = ss.getSheetByName('FLAS_COL_DEBUG');
  if (!logSheet) logSheet = ss.insertSheet('FLAS_COL_DEBUG');
  else logSheet.clearContents();

  logSheet.appendRow(['공장(시트값)', '총행수', '고유zone목록 (zone명:건수)', '면적 샘플 (최대3개)']);

  for (var f in factories) {
    var entry = factories[f];
    var zoneStr = Object.keys(entry.zones).map(function(z) { return z + ':' + entry.zones[z]; }).join(', ');
    logSheet.appendRow([f, entry.count, zoneStr, entry.dimSamples.join(' | ')]);
  }

  logSheet.getRange(1, 1, 1, 4).setFontWeight('bold').setBackground('#0f9d58').setFontColor('white');
  logSheet.autoResizeColumns(1, 4);
  ss.setActiveSheet(logSheet);
  showAlert('완료',
    'FLAS_COL_DEBUG 탭에서\n' +
    '① 공장(시트값) — 이진이 "이진" or "이진공장" 등 어떤 값인지\n' +
    '② 고유zone목록 — FLAS DB의 zone명과 일치하는지\n' +
    '확인 후 알려주세요.');
}

/**
 * V열 샘플 값 확인 — invalid dimensions 원인 파악용
 * 실행하면 FLAS_COL_DEBUG 탭에 처음 30행의 V열 원본값을 기록합니다.
 */
function debugDimSamples() {
  var ss    = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = getProjectSheet(ss);
  if (!sheet) { showAlert('오류', '시트를 찾을 수 없습니다.'); return; }

  var data = sheet.getDataRange().getValues();
  var logSheet = ss.getSheetByName('FLAS_COL_DEBUG');
  if (!logSheet) logSheet = ss.insertSheet('FLAS_COL_DEBUG');
  else logSheet.clearContents();

  logSheet.appendRow(['행', '프로젝트코드', '공장(S열)', '작업동(W열)', 'V열 원본값(면적)', 'U열 원본값(착수일)', 'O열 원본값(납기일)']);

  var count = 0;
  for (var i = SKIP_ROWS; i < data.length && count < 30; i++) {
    var row = data[i];
    var code = String(row[COL.PROJECT_CODE] || '').trim();
    if (!code) continue;
    logSheet.appendRow([
      i + 1,
      code,
      String(row[COL.SHOP]       || '').trim(),
      String(row[COL.ZONE]       || '').trim(),
      String(row[COL.DIMENSIONS] || '').trim(),   // V열 원본
      String(row[COL.START_DATE] || '').trim(),   // U열 원본
      String(row[COL.END_DATE]   || '').trim(),   // O열 원본
    ]);
    count++;
  }

  logSheet.getRange(1, 1, 1, 7).setFontWeight('bold').setBackground('#e67c00').setFontColor('white');
  logSheet.autoResizeColumns(1, 7);
  ss.setActiveSheet(logSheet);
  showAlert('완료', 'FLAS_COL_DEBUG 탭에서 V열(면적) 원본값을 확인하세요.\n값 형식을 확인한 뒤 알려주세요.');
}

/**
 * "가로 x 세로" 합쳐진 문자열 → { widthM, heightM } 분리
 * 지원 형식:
 *   "12 x 10"  "12.5X8"  "12500 x 10000"(mm)
 *   "120"  "120㎡"  (단독 면적 → 정사각형 근사: √area × √area)
 */
function parseDimensions(raw) {
  if (!raw && raw !== 0) return null;
  var s = String(raw).trim()
    .replace(/,/g, '')
    .replace(/㎡|m2|m²|M2|M²/gi, '')
    .replace(/[Xx×＊\*]/g, 'x')
    .replace(/\s+/g, ' ')
    .trim();

  // ① "가로 x 세로" 형식
  var m = s.match(/([\d.]+)\s*x\s*([\d.]+)/);
  if (m) {
    var w = parseFloat(m[1]);
    var h = parseFloat(m[2]);
    if (w > 0 && h > 0) {
      if (w > 500 || h > 500) { w /= 1000; h /= 1000; }
      return { widthM: String(w), heightM: String(h) };
    }
  }

  // ② 단독 숫자 = 총 면적(㎡) → 정사각형 근사 (√area × √area = area)
  var single = s.match(/^([\d.]+)$/);
  if (single) {
    var area = parseFloat(single[1]);
    if (area > 0) {
      var side = Math.sqrt(area);
      return { widthM: String(+side.toFixed(3)), heightM: String(+side.toFixed(3)) };
    }
  }

  return null;
}

function formatDate(val) {
  if (!val) return '';
  if (val instanceof Date) {
    var y = val.getFullYear();
    var m = String(val.getMonth() + 1).padStart(2, '0');
    var d = String(val.getDate()).padStart(2, '0');
    return y + '-' + m + '-' + d;
  }
  var s = String(val).trim();
  // "2025-07-01" 또는 "2025/07/01" 형태 허용
  var match = s.match(/(\d{4})[.\-\/](\d{1,2})[.\-\/](\d{1,2})/);
  if (match) return match[1] + '-' + match[2].padStart(2, '0') + '-' + match[3].padStart(2, '0');
  return '';
}

function showAlert(title, msg) {
  try {
    SpreadsheetApp.getUi().alert(title, msg, SpreadsheetApp.getUi().ButtonSet.OK);
  } catch (e) {
    // 트리거 실행 시엔 UI 없음 — 무시
  }
}

function logAndAlert(title, msg) {
  writeLog('WARN', msg);
  showAlert(title, msg);
}

function writeLog(level, msg) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var logSheet = ss.getSheetByName('FLAS_LOG');
  if (!logSheet) {
    logSheet = ss.insertSheet('FLAS_LOG');
    logSheet.appendRow(['일시', '레벨', '내용']);
    logSheet.setFrozenRows(1);
  }
  logSheet.appendRow([new Date(), level, msg]);
  // 최근 500행만 유지
  var lastRow = logSheet.getLastRow();
  if (lastRow > 501) logSheet.deleteRows(2, lastRow - 501);
}

function notifyError(msg) {
  if (!NOTIFY_EMAIL) return;
  try {
    MailApp.sendEmail(NOTIFY_EMAIL, '[FLAS] 동기화 오류 발생', msg);
  } catch (e) { /* 이메일 권한 없으면 무시 */ }
}

function showLog() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var logSheet = ss.getSheetByName('FLAS_LOG');
  if (logSheet) {
    ss.setActiveSheet(logSheet);
  } else {
    showAlert('로그', '아직 동기화 기록이 없습니다.');
  }
}
