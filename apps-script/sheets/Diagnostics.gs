/** Read-only diagnostic. Run manually in the existing Apps Script editor.
 * No cells, tabs, permissions, or credentials are changed or logged.
 */
function diagnosePCFPreview() {
  var step = 'read workbook state';
  try {
    var id = PCF_BOOKS.buying;
    var requests = [{ updateCells: { start: { sheetId: 1301669337, rowIndex: 7, columnIndex: 5 }, rows: [{ values: [{ userEnteredValue: { stringValue: 'E2E PREVIEW ONLY - NEVER COMMITTED' } }] }], fields: 'userEnteredValue' } }];
    var state = pcfState_(id, requests);
    console.log('PASS: workbook state read');
    step = 'validate preview request';
    pcfValidate_(requests, state);
    console.log('PASS: request validation');
    step = 'check existing operation receipt';
    pcfReceipt_(id, 'e2e_readonly_preview_probe');
    console.log('PASS: operation lookup');
    step = 'hash workbook state';
    pcfHash_(pcfStableJson_(state));
    console.log('PASS: workbook state hashing');
    step = 'prepare preview (no commit)';
    var preview = pcfPreview_(id, { book: 'buying', operationId: 'e2e_readonly_preview_probe', requests: requests });
    console.log('PASS: preview prepared; no sheet changes made');
    if (preview.token) CacheService.getScriptCache().remove('pcf_' + preview.token);
  } catch (error) {
    console.error('FAILED STEP: ' + step);
    console.error(String(error.message || error));
  }
}
