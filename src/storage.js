require('dotenv').config();
const { PutObjectCommand } = require('@aws-sdk/client-s3');
const crypto = require('crypto');
const { getS3Client, getS3Config } = require('./s3Client');

// Получаем конфигурацию
const s3Config = getS3Config();

/**
 * Загрузка файла в S3
 * @param {Buffer} buffer - Буфер с данными файла
 * @param {string} channelUsername - Имя канала
 * @param {number} messageId - ID сообщения
 * @param {string} mimeType - MIME тип файла
 * @returns {Promise<string>} - URL загруженного файла
 */
async function uploadToS3(buffer, channelUsername, messageId, media) {
  try {
    // Определяем расширение файла
    // const extension = getExtensionFromMimeType(mimeType);

    // Определяем Content-Type
    // const contentType = mimeType || 'application/octet-stream';

    let [mimeType, ext] = '';
    if (media?.className?.includes('Photo')) {
      mimeType = 'image/jpeg';
      ext = '.jpg';
    } else if (media?.className.includes('Document')) {
      ext = '.mp4';
      mimeType = 'application/mp4';
    } else if (media?.className.includes('Video')) {
      ext = '.mp4';
      mimeType = 'video/mp4';
    } else if (media?.className.includes('Audio')) {
      ext = '.mp3';
      mimeType = 'audio/mpeg';
    } else {
      ext = '.bin';
      mimeType = 'application/octet-stream';
    }

    // Генерируем уникальное имя файла
    const hash = crypto.createHash('md5').update(buffer).digest('hex');
    const filename = `${messageId}_${hash}${ext}`;

    // Структура папок: channel/year/month/filename
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const key = `${channelUsername}/${year}/${month}/${filename}`;

    console.log(`Uploading to S3: ${key} (${(buffer.length / 1024 / 1024).toFixed(2)} MB)`);

    const command = new PutObjectCommand({
      Bucket: s3Config.bucket,
      Key: key,
      Body: buffer,
      ContentType: mimeType,
      // Делаем файл публично доступным (опционально)
      ACL: 'public-read',
      // Или используйте signed URLs если нужна приватность
    });

    const s3Client = getS3Client();

    await s3Client.send(command);

    // Формируем публичный URL
    const publicUrl = `https://${s3Config.bucket}.s3.cloud.ru/${key}`;

    console.log(`✓ Uploaded successfully: ${publicUrl}`);

    return publicUrl;
  } catch (error) {
    console.error('Failed to upload to S3:', error.message);
    throw error;
  }
}

/**
 * Определение расширения файла по MIME типу
 */
function getExtensionFromMimeType(mimeType) {
  console.log('Determining extension for MIME type:', mimeType);
  if (!mimeType) return '';

  const mimeMap = {
    'video/mp4': '.mp4',
    'video/quicktime': '.mov',
    'video/x-msvideo': '.avi',
    'video/webm': '.webm',
    'video/x-matroska': '.mkv',
    'video/mpeg': '.mpeg',
    'image/jpeg': '.jpg',
    'image/png': '.png',
    'image/gif': '.gif',
    'image/webp': '.webp',
    'audio/mpeg': '.mp3',
    'audio/ogg': '.ogg',
    'audio/wav': '.wav',
    'application/pdf': '.pdf',
  };

  return mimeMap[mimeType] || '';
}

/**
 * Генерация signed URL для приватных файлов (опционально)
 */
async function getSignedUrl(key, expiresIn = 3600) {
  const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
  const { GetObjectCommand } = require('@aws-sdk/client-s3');
  const s3Client = getS3Client();

  const command = new GetObjectCommand({
    Bucket: s3Config.bucket,
    Key: key,
  });

  const url = await getSignedUrl(s3Client, command, { expiresIn });
  return url;
}

module.exports = {
  uploadToS3,
  getExtensionFromMimeType,
  getSignedUrl,
};
