/** PCF Sheets bridge v1. Enable the Google Sheets advanced service before setup.
 * Admin assignments, expense mapping and the approval UI live in the PCF app.
 * This script never polls, sends emails, scans receipts, or writes on installation.
 */
const PCF_BOOKS = {
  operations: '1XfAjl-cONxOdPganObQzxwXy12T5TkJItERY-SoghfM',
  buying: '1XuReREuOKezAZWmwhuWc60BgTuZwX-vuRC5OMjp-g18',
  selling: '1aafL4rtQHXqr5zUut7NZ4H0cR6FKqFzswgXDvUdQBB8',
  lmr: '1h2LDeemJZBSBUtyrUs3-rvEVsi26eyJoMeex1a29Los',
  dryve: '1yhst5xpEQ41cAEc89-GVd-QXpUlshpckfzAk2vbxR9w'
};

function setupPCF() {
  const props = PropertiesService.getScriptProperties();
  if (!props.getProperty('PCF_SHARED_SECRET')) {
    props.setProperty('PCF_SHARED_SECRET', Utilities.getUuid().replace(/-/g, '') + Utilities.getUuid().replace(/-/g, ''));
  }
  if (!props.getProperty('PCF_WRITES_ENABLED')) props.setProperty('PCF_WRITES_ENABLED', 'false');
  Object.keys(PCF_BOOKS).forEach(function (key) {
    Sheets.Spreadsheets.get(PCF_BOOKS[key], { fields: 'spreadsheetId,properties(title)' });
    console.log(key + ': read access verified');
  });
  console.log('Setup complete. Secret is in Project Settings > Script properties. Writes remain disabled until PCF is connected.');
}

function doGet() {
  return pcfReply_({ ok: true, service: 'pcf-sheets', version: 2 });
}

function doPost(e) {
  try {
    const raw = e && e.postData && e.postData.contents;
    if (!raw || raw.length > 1000000) throw new Error('invalid_request');
    const body = JSON.parse(raw);
    const props = PropertiesService.getScriptProperties();
    const secret = props.getProperty('PCF_SHARED_SECRET');
    if (!secret || secret.length < 32 || !pcfEqual_(String(body.secret || ''), secret)) throw new Error('unauthorized');
    if (body.action === 'catalog') return pcfReply_({ ok: true, books: pcfCatalog_(), writesEnabled: props.getProperty('PCF_WRITES_ENABLED') === 'true' });
    if (!Object.prototype.hasOwnProperty.call(PCF_BOOKS, body.book)) throw new Error('unknown_workbook');
    const id = PCF_BOOKS[body.book];
    if (body.action === 'read') return pcfReply_({ ok: true, snapshot: pcfRead_(id, body) });
    if (body.action === 'status') return pcfReply_({ ok: true, receipt: pcfReceipt_(id, pcfOperation_(body.operationId)) });
    if (body.action === 'preview') return pcfReply_({ ok: true, preview: pcfPreview_(id, body) });
    if (body.action === 'commit') {
      if (props.getProperty('PCF_WRITES_ENABLED') !== 'true') throw new Error('writes_disabled');
      return pcfReply_({ ok: true, report: pcfCommit_(id, body) });
    }
    throw new Error('unknown_action');
  } catch (error) {
    const message = String(error.message || '');
    const safe = /^(invalid_request|unauthorized|unknown_workbook|unknown_action|writes_disabled|invalid_operation|invalid_plan|unsupported_request|vat_write_blocked|preview_expired|sheet_changed|operation_conflict|busy|unknown_tab|invalid_range|snapshot_too_large)$/;
    // Provider errors can contain sheet data; never return them to a caller.
    return pcfReply_({ ok: false, error: safe.test(message) ? message : 'google_request_failed' });
  }
}

function pcfCatalog_() {
  return Object.keys(PCF_BOOKS).map(function (key) {
    const book = Sheets.Spreadsheets.get(PCF_BOOKS[key], { fields: 'spreadsheetId,properties(title,timeZone),sheets(properties)' });
    return { key: key, id: book.spreadsheetId, title: book.properties.title,
      timeZone: book.properties.timeZone, url: 'https://docs.google.com/spreadsheets/d/' + book.spreadsheetId + '/edit',
      tabs: (book.sheets || []).map(function (s) { return s.properties; }) };
  });
}

function pcfRead_(id, body) {
  const catalog = Sheets.Spreadsheets.get(id, { fields: 'sheets(properties)' });
  const tab = (catalog.sheets || []).find(function (s) { return s.properties.sheetId === body.sheetId; });
  if (!tab) throw new Error('unknown_tab');
  const start = body.startRow === undefined ? 0 : body.startRow;
  const limit = body.limit === undefined ? 200 : body.limit;
  if (!Number.isInteger(start) || start < 0 || !Number.isInteger(limit) || limit < 1 || limit > 500 || start >= tab.properties.gridProperties.rowCount) throw new Error('invalid_range');
  const end = Math.min(start + limit, tab.properties.gridProperties.rowCount);
  const range = "'" + tab.properties.title.replace(/'/g, "''") + "'!A" + (start + 1) + ':AZ' + end;
  const snapshot = Sheets.Spreadsheets.get(id, { ranges: [range], includeGridData: true,
    fields: 'spreadsheetId,sheets(properties,data(startRow,startColumn,rowData(values(userEnteredValue,effectiveValue,formattedValue,userEnteredFormat(numberFormat),dataValidation))),merges)' });
  return { fetchedAt: new Date().toISOString(), nextRow: end < tab.properties.gridProperties.rowCount ? end : null, data: snapshot };
}

function pcfState_(id, requests) {
  // Metadata is small. Never fetch all grid data for the whole workbook at once.
  const metadata = Sheets.Spreadsheets.get(id, {
    fields: 'spreadsheetId,properties(title,timeZone),sheets(properties,merges)'
  });
  const touched = {};
  function collect(value) {
    if (!value || typeof value !== 'object') return;
    if (Number.isInteger(value.sheetId)) touched[value.sheetId] = true;
    Object.keys(value).forEach(function (key) { collect(value[key]); });
  }
  collect(requests);
  if (requests && !Object.keys(touched).length) throw new Error('invalid_plan');
  const workbook = SpreadsheetApp.openById(id);
  const nativeSheets = workbook.getSheets();
  (metadata.sheets || []).forEach(function (sheet) {
    const properties = sheet.properties;
    if (requests && !touched[properties.sheetId]) return;
    const native = nativeSheets.find(function (item) { return item.getSheetId() === properties.sheetId; });
    if (!native) throw new Error('sheet_changed');
    const lastRow = Math.max(1, native.getLastRow());
    const lastColumn = Math.max(1, native.getLastColumn());
    if (lastRow > 10000 || lastColumn > 100) throw new Error('snapshot_too_large');
    sheet.usedBounds = { rows: lastRow, columns: lastColumn };
    sheet.data = [];
    const quoted = "'" + properties.title.replace(/'/g, "''") + "'!";
    // Read both dimensions in small batches. Style-heavy historical tabs can
    // otherwise exceed Google's response limit even with a single-sheet read.
    for (let row = 0; row < lastRow; row += 100) {
      for (let column = 0; column < lastColumn; column += 26) {
        const range = quoted + pcfColumn_(column) + (row + 1) + ':' +
          pcfColumn_(Math.min(column + 26, lastColumn) - 1) + Math.min(row + 100, lastRow);
        const chunk = Sheets.Spreadsheets.get(id, {
          ranges: [range], includeGridData: true,
          fields: 'sheets(data(startRow,startColumn,rowData(values(userEnteredValue,userEnteredFormat,dataValidation,note))))'
        });
        (chunk.sheets || []).forEach(function (part) {
          (part.data || []).forEach(function (block) { sheet.data.push(block); });
        });
      }
    }
  });
  return metadata;
}

function pcfColumn_(index) {
  let label = '';
  for (let n = index + 1; n > 0; n = Math.floor((n - 1) / 26)) {
    label = String.fromCharCode(65 + (n - 1) % 26) + label;
  }
  return label;
}

function pcfOperation_(value) {
  if (typeof value !== 'string' || !/^[a-zA-Z0-9_-]{16,80}$/.test(value)) throw new Error('invalid_operation');
  return value;
}

function pcfReceipt_(id, operationId) {
  const result = Sheets.Spreadsheets.DeveloperMetadata.search({ dataFilters: [{ developerMetadataLookup: {
    metadataKey: 'pcf_operation', metadataValue: operationId, visibility: 'DOCUMENT'
  } }] }, id);
  const matches = result.matchedDeveloperMetadata || [];
  if (!matches.length) return null;
  // Receipt is written in a second metadata item in the SAME atomic batch.
  const details = Sheets.Spreadsheets.DeveloperMetadata.search({ dataFilters: [{ developerMetadataLookup: {
    metadataKey: 'pcf_receipt_' + operationId, visibility: 'DOCUMENT'
  } }] }, id);
  if (!details.matchedDeveloperMetadata || details.matchedDeveloperMetadata.length !== 1) throw new Error('operation_conflict');
  return JSON.parse(details.matchedDeveloperMetadata[0].developerMetadata.metadataValue);
}

function pcfPreview_(id, body) {
  const operation = pcfOperation_(body.operationId);
  const state = pcfState_(id, body.requests);
  pcfValidate_(body.requests, state);
  const digest = pcfHash_(JSON.stringify(body.requests));
  const previous = pcfReceipt_(id, operation);
  if (previous) {
    if (previous.digest !== digest) throw new Error('operation_conflict');
    return { alreadyApplied: true, report: previous };
  }
  const preview = { operationId: operation, book: body.book, digest: digest,
    state: pcfHash_(JSON.stringify(state)), expires: Date.now() + 300000 };
  const token = Utilities.getUuid();
  CacheService.getScriptCache().put('pcf_' + token, JSON.stringify(preview), 300);
  return { token: token, expiresAt: new Date(preview.expires).toISOString(), workbookId: id,
    operationId: operation, requestCount: body.requests.length, requests: body.requests,
    notice: 'Review these changes in PCF before confirming. Input VAT is not written.' };
}

function pcfCommit_(id, body) {
  const operation = pcfOperation_(body.operationId);
  const digest = pcfHash_(JSON.stringify(body.requests));
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) throw new Error('busy');
  try {
    const previous = pcfReceipt_(id, operation);
    if (previous) {
      if (previous.digest !== digest) throw new Error('operation_conflict');
      return Object.assign({ alreadyApplied: true }, previous);
    }
    const cached = CacheService.getScriptCache().get('pcf_' + String(body.token || ''));
    if (!cached) throw new Error('preview_expired');
    const preview = JSON.parse(cached);
    if (preview.expires < Date.now()) throw new Error('preview_expired');
    if (preview.operationId !== operation || preview.book !== body.book || preview.digest !== digest) throw new Error('operation_conflict');
    const state = pcfState_(id, body.requests);
    if (pcfHash_(JSON.stringify(state)) !== preview.state) throw new Error('sheet_changed');
    pcfValidate_(body.requests, state);
    const report = { operationId: operation, digest: digest, completedAt: new Date().toISOString(),
      workbookId: id, requestCount: body.requests.length,
      url: 'https://docs.google.com/spreadsheets/d/' + id + '/edit' };
    const requests = body.requests.concat([
      { createDeveloperMetadata: { developerMetadata: { metadataKey: 'pcf_operation', metadataValue: operation, location: { spreadsheet: true }, visibility: 'DOCUMENT' } } },
      { createDeveloperMetadata: { developerMetadata: { metadataKey: 'pcf_receipt_' + operation, metadataValue: JSON.stringify(report), location: { spreadsheet: true }, visibility: 'DOCUMENT' } } }
    ]);
    Sheets.Spreadsheets.batchUpdate({ requests: requests }, id);
    CacheService.getScriptCache().remove('pcf_' + body.token);
    return report;
  } finally { lock.releaseLock(); }
}

function pcfValidate_(requests, state) {
  if (!Array.isArray(requests) || !requests.length || requests.length > 1000 || JSON.stringify(requests).length > 800000) throw new Error('invalid_plan');
  const tabs = {};
  (state.sheets || []).forEach(function (s) {
    const vat = [];
    (s.data || []).forEach(function (block) {
      (block.rowData || []).forEach(function (row, offset) {
        if ((block.startRow || 0) + offset >= 10) return;
        ((row && row.values) || []).forEach(function (cell, column) {
          const text = cell && cell.userEnteredValue && cell.userEnteredValue.stringValue;
          if (text && /^INPUT\s*VAT$/i.test(text.trim())) vat.push((block.startColumn || 0) + column);
        });
      });
    });
    tabs[s.properties.sheetId] = { vat: vat, fresh: false };
  });
  function tab(id) { if (!Number.isInteger(id) || !Object.prototype.hasOwnProperty.call(tabs, id)) throw new Error('invalid_plan'); return tabs[id]; }
  requests.forEach(function (request) {
    const keys = Object.keys(request);
    if (keys.length !== 1) throw new Error('invalid_plan');
    const kind = keys[0], value = request[kind];
    if (kind === 'addSheet') {
      const p = value.properties || {};
      if (!Number.isInteger(p.sheetId) || p.sheetId < 0 || tabs[p.sheetId] || !p.title || p.title.length > 100 || !p.gridProperties || p.gridProperties.columnCount > 52 || p.gridProperties.rowCount > 5000) throw new Error('invalid_plan');
      tabs[p.sheetId] = { fresh: true, vat: [] };
    } else if (kind === 'updateCells') {
      // Explicit row values only; a broad range could accidentally clear neighboring cells.
      if (!value.start || value.range || !Array.isArray(value.rows) || !value.rows.length || value.fields !== 'userEnteredValue') throw new Error('invalid_plan');
      const t = tab(value.start.sheetId), col = value.start.columnIndex || 0;
      if (!Number.isInteger(value.start.rowIndex) || value.start.rowIndex < 0 || !Number.isInteger(col) || col < 0) throw new Error('invalid_plan');
      value.rows.forEach(function (row) {
        (row.values || []).forEach(function (cell, i) {
          if (col + i >= 52 || Object.keys(cell).some(function (key) { return key !== 'userEnteredValue'; })) throw new Error('invalid_plan');
          if (t.vat.indexOf(col + i) >= 0) throw new Error('vat_write_blocked');
          // New sheets must be prepared from a reviewed template by the backend.
          if (t.fresh && cell.userEnteredValue && /^INPUT\s*VAT$/i.test(cell.userEnteredValue.stringValue || '')) t.vat.push(col + i);
        });
      });
    } else if (kind === 'insertDimension') {
      tab(value.range && value.range.sheetId);
      if (value.range.dimension !== 'ROWS' || !Number.isInteger(value.range.startIndex) || !Number.isInteger(value.range.endIndex) || value.range.startIndex < 1 || value.range.endIndex <= value.range.startIndex || value.range.endIndex - value.range.startIndex > 100) throw new Error('invalid_plan');
    } else if (kind === 'copyPaste') {
      tab(value.source && value.source.sheetId); tab(value.destination && value.destination.sheetId);
      if (['PASTE_FORMAT', 'PASTE_DATA_VALIDATION'].indexOf(value.pasteType) < 0) throw new Error('unsupported_request');
    } else if (kind === 'mergeCells') {
      if (!tab(value.range && value.range.sheetId).fresh) throw new Error('unsupported_request');
    } else if (kind === 'updateDimensionProperties') {
      if (!tab(value.range && value.range.sheetId).fresh || value.fields !== 'pixelSize') throw new Error('unsupported_request');
    } else {
      // No delete, arbitrary metadata editing, or copying old transaction values.
      throw new Error('unsupported_request');
    }
  });
}

function pcfHash_(value) {
  return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, value, Utilities.Charset.UTF_8)
    .map(function (b) { return ('0' + ((b + 256) % 256).toString(16)).slice(-2); }).join('');
}
function pcfEqual_(a, b) {
  const x = pcfHash_(a), y = pcfHash_(b); let difference = 0;
  for (let i = 0; i < x.length; i++) difference |= x.charCodeAt(i) ^ y.charCodeAt(i);
  return difference === 0;
}
function pcfReply_(value) {
  return ContentService.createTextOutput(JSON.stringify(value)).setMimeType(ContentService.MimeType.JSON);
}
