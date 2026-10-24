/**
 * Pengirim jawaban Google Form ke Retalio (Tahap B: Pengajuan Calon Klien).
 *
 * Cara pasang: lihat README.md di folder ini. Nilai rahasia TIDAK ditulis di sini; keduanya disimpan di
 * Project Settings > Script Properties:
 *   RETALIO_INTAKE_URL     contoh: https://<alamat-retalio>/v1/intake/google-form
 *   RETALIO_INTAKE_SECRET  sama persis dengan INTAKE_WEBHOOK_SECRET di server Retalio
 */

function props_() {
  const p = PropertiesService.getScriptProperties();
  const url = p.getProperty('RETALIO_INTAKE_URL');
  const secret = p.getProperty('RETALIO_INTAKE_SECRET');
  if (!url || !secret) throw new Error('Isi Script Properties RETALIO_INTAKE_URL dan RETALIO_INTAKE_SECRET dulu.');
  return { url: url, secret: secret };
}

function hex_(bytes) {
  return bytes.map(function (b) { return ('0' + (b & 0xff).toString(16)).slice(-2); }).join('');
}

/** Mengirim satu payload bertanda tangan: HMAC-SHA256(secret, `${detik}.${isi JSON}`). */
function send_(payload) {
  const cfg = props_();
  const body = JSON.stringify(payload);
  const ts = Math.floor(Date.now() / 1000);
  const sig = hex_(Utilities.computeHmacSha256Signature(ts + '.' + body, cfg.secret));
  const res = UrlFetchApp.fetch(cfg.url, {
    method: 'post',
    contentType: 'application/json',
    payload: body,
    headers: { 'x-retalio-timestamp': String(ts), 'x-retalio-signature': sig },
    muteHttpExceptions: true,
  });
  const code = res.getResponseCode();
  if (code < 200 || code >= 300) throw new Error('Retalio menolak kiriman (' + code + '): ' + res.getContentText().slice(0, 200));
  return code;
}

/** Dipanggil otomatis setiap ada jawaban baru (pemicu "Dari formulir > Saat formulir dikirim"). */
function onFormSubmit(e) {
  const response = e.response;
  const answers = [];
  response.getItemResponses().forEach(function (item) {
    answers.push({ question: item.getItem().getTitle(), answer: item.getResponse() });
  });
  const payload = {
    responseId: response.getId(),
    formId: e.source.getId(),
    submittedAt: response.getTimestamp().toISOString(),
    answers: answers,
  };
  // Percobaan ulang untuk gangguan jaringan sesaat; Retalio mengenali kiriman ganda lewat responseId.
  for (var attempt = 1; attempt <= 3; attempt++) {
    try { send_(payload); return; } catch (err) {
      if (attempt === 3) throw err;
      Utilities.sleep(1500 * attempt);
    }
  }
}

/** Jalankan SEKALI untuk memasang pemicu (menjalankan ulang tidak membuat pemicu ganda). */
function setupTrigger() {
  const form = FormApp.getActiveForm();
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'onFormSubmit') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('onFormSubmit').forForm(form).onFormSubmit().create();
}

/** Uji koneksi tanpa mengisi formulir: kiriman contoh akan muncul di tab Pengajuan dengan nama "Uji Koneksi". */
function testSend() {
  const code = send_({
    responseId: 'uji-' + Date.now(),
    formId: 'uji-koneksi',
    submittedAt: new Date().toISOString(),
    answers: [
      { question: 'Nama Lengkap', answer: 'Uji Koneksi' },
      { question: 'Jenis Usaha / Industri', answer: 'Uji' },
    ],
  });
  Logger.log('Berhasil, kode ' + code);
}
