/**
 * PCF Vouchers: receives voucher photos from the app and saves them in Drive.
 *
 * Runs as the person who deploys it, so files are owned by them and live in
 * their (company) Drive. Setup is in docs/GOOGLE_DRIVE.md.
 *
 * Script properties (Project Settings > Script properties):
 *   UPLOAD_SECRET   required. A long random string, also set in the app.
 *   ROOT_FOLDER_ID  optional. Id of an existing Drive folder to use. Without
 *                   it a "Petty Cash Vouchers" folder is created in My Drive.
 */

var ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
var MAX_BASE64_LENGTH = 8 * 1024 * 1024; // about 6 MB of image
var DEFAULT_ROOT_NAME = 'Petty Cash Vouchers';

function doPost(e) {
  try {
    var props = PropertiesService.getScriptProperties();
    var secret = props.getProperty('UPLOAD_SECRET');
    var body = JSON.parse(e.postData.contents);

    if (!secret || secret.length < 20 || !sameText_(String(body.secret || ''), secret)) {
      return reply_({ ok: false, error: 'unauthorized' });
    }
    if (ALLOWED_TYPES.indexOf(body.mimeType) === -1) {
      return reply_({ ok: false, error: 'unsupported type' });
    }
    if (typeof body.data !== 'string' || body.data.length === 0 || body.data.length > MAX_BASE64_LENGTH) {
      return reply_({ ok: false, error: 'bad size' });
    }
    var folders = Array.isArray(body.folders) ? body.folders.slice(0, 4) : [];

    var folder = rootFolder_(props.getProperty('ROOT_FOLDER_ID'));
    for (var i = 0; i < folders.length; i++) {
      folder = childFolder_(folder, cleanName_(folders[i]));
    }

    var blob = Utilities.newBlob(
      Utilities.base64Decode(body.data),
      body.mimeType,
      cleanName_(body.fileName)
    );
    var file = folder.createFile(blob);
    return reply_({ ok: true, id: file.getId(), url: file.getUrl() });
  } catch (error) {
    return reply_({ ok: false, error: 'failed' });
  }
}

// Opening the address in a browser just says it is alive.
function doGet() {
  return reply_({ ok: true, service: 'pcf-voucher-uploads' });
}

function rootFolder_(id) {
  if (id) return DriveApp.getFolderById(id);
  return childFolder_(DriveApp.getRootFolder(), DEFAULT_ROOT_NAME);
}

function childFolder_(parent, name) {
  var found = parent.getFoldersByName(name);
  return found.hasNext() ? found.next() : parent.createFolder(name);
}

function cleanName_(value) {
  var text = String(value || 'untitled')
    .replace(/[\u0000-\u001f\u007f-\u009f​-‏‪-‮⁦-⁩]/g, '')
    .replace(/[\\\/:*?"<>|]/g, '-')
    .replace(/\s+/g, ' ')
    .trim();
  return text.substring(0, 80) || 'untitled';
}

// Compares without stopping at the first different character.
function sameText_(a, b) {
  if (a.length !== b.length) return false;
  var diff = 0;
  for (var i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function reply_(object) {
  return ContentService.createTextOutput(JSON.stringify(object)).setMimeType(
    ContentService.MimeType.JSON
  );
}
