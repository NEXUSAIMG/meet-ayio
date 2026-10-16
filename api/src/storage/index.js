const { criarLocalStorage } = require('./local');
const { criarS3Storage } = require('./s3');

// S3 se S3_BUCKET estiver definido; senão disco (Railway Volume em RECORDINGS_DIR).
function criarStorage(cfg) {
  if (cfg.s3.bucket) return criarS3Storage(cfg.s3);
  return criarLocalStorage({ dir: cfg.recordingsDir, segredo: cfg.filesSecret, baseUrl: cfg.publicUrl });
}

module.exports = { criarStorage };
