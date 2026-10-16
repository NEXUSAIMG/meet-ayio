const { Transform } = require('stream');

// Storage S3-compatível (Railway Bucket, R2, AWS...). Download por URL pré-assinada do próprio bucket.
function criarS3Storage({ endpoint, region, bucket, accessKeyId, secretAccessKey, forcePathStyle }) {
  const { S3Client, DeleteObjectCommand, GetObjectCommand } = require('@aws-sdk/client-s3');
  const { Upload } = require('@aws-sdk/lib-storage');
  const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');

  const client = new S3Client({
    region: region || 'auto',
    endpoint: endpoint || undefined,
    forcePathStyle: Boolean(forcePathStyle),
    credentials: { accessKeyId, secretAccessKey },
  });

  return {
    tipo: 's3',

    async put(key, stream, { contentType = 'video/mp4' } = {}) {
      let sizeBytes = 0;
      const contador = new Transform({
        transform(chunk, _enc, cb) { sizeBytes += chunk.length; cb(null, chunk); },
      });
      stream.pipe(contador);
      stream.on('error', (e) => contador.destroy(e));
      await new Upload({ client, params: { Bucket: bucket, Key: key, Body: contador, ContentType: contentType } }).done();
      return { sizeBytes };
    },

    async delete(key) {
      await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
    },

    // Baixa para um arquivo temporário em `dir` (para o ffmpeg processar).
    async paraArquivoLocal(key, dir) {
      const fs = require('fs');
      const path = require('path');
      const { pipeline } = require('stream/promises');
      const destino = path.join(dir, path.basename(key));
      const r = await client.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
      await pipeline(r.Body, fs.createWriteStream(destino));
      return destino;
    },

    downloadUrl(key, ttlSec, { filename }) {
      return getSignedUrl(client, new GetObjectCommand({
        Bucket: bucket,
        Key: key,
        ResponseContentDisposition: `attachment; filename="${filename}"`,
      }), { expiresIn: ttlSec });
    },
  };
}

module.exports = { criarS3Storage };
