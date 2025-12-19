const { PutObjectCommand } = require('@aws-sdk/client-s3');
const { Upload } = require('@aws-sdk/lib-storage');
const { PassThrough } = require('stream');
const { Api } = require('telegram');
const { getS3Client, getS3Config } = require('../s3Client');

// Получаем конфигурацию
const s3Config = getS3Config();

// Функция для загрузки небольшого видео в S3 (buffer целиком)
async function uploadSmallVideoToS3(client, channelUsername, messageId) {
  try {
    const s3Client = getS3Client();
    const messages = await client.getMessages(channelUsername, {
      ids: [messageId],
    });

    const message = messages[0];

    if (!message || !message.media) {
      console.warn(`No media found in message ${messageId}`);
      return null;
    }

    console.log(`Starting download: ${channelUsername}/${messageId}`);

    // Скачиваем в buffer
    const buffer = await client.downloadMedia(message, {
      progressCallback: (downloaded, total) => {
        const percent = ((downloaded / total) * 100).toFixed(2);
        console.log(`Downloaded: ${percent}%`);
      },
    });

    if (!buffer) {
      console.warn(`Failed to download media ${messageId}`);
      return null;
    }

    // Определяем расширение файла
    const ext = message.media.document?.mimeType?.includes('video')
      ? 'mp4'
      : message.media.document?.mimeType?.includes('image')
        ? 'jpg'
        : 'bin';

    const fileName = `telegram/${channelUsername}/${messageId}.${ext}`;

    console.log(`Uploading to S3: ${fileName}`);

    // Загружаем в S3
    const uploadParams = {
      Bucket: s3Config.bucket,
      Key: fileName,
      Body: buffer,
      ContentType: message.media.document?.mimeType || 'application/octet-stream',
    };

    const command = new PutObjectCommand(uploadParams);

    await s3Client.send(command);

    const s3Url = `${s3Config.endpoint}/${s3Config.bucket}/${fileName}`;
    console.log(`Successfully uploaded to S3: ${s3Url}`);

    return {
      url: s3Url,
      bucket: s3Config.bucket,
      key: fileName,
      size: buffer.length,
    };
  } catch (error) {
    console.error(`Failed to upload video ${channelUsername}/${messageId}:`, error.message);
    return null;
  }
}

// Функция для потоковой загрузки больших видео в S3
async function uploadLargeVideoToS3Stream(client, channelUsername, messageId) {
  try {
    const s3Client = getS3Client();
    const messages = await client.getMessages(channelUsername, {
      ids: [messageId],
    });

    const message = messages[0];

    if (!message || !message.media || !message.media.document) {
      console.warn(`No video document found in message ${messageId}`);
      return null;
    }

    const document = message.media.document;
    const totalSize = document.size;

    // Определяем расширение файла
    const ext = document.mimeType?.includes('video')
      ? 'mp4'
      : document.mimeType?.includes('image')
        ? 'jpg'
        : 'bin';

    const fileName = `telegram/${channelUsername}/${messageId}.${ext}`;

    console.log(`Streaming ${totalSize} bytes to S3: ${fileName}`);

    // Создаём PassThrough stream для передачи данных
    const passThrough = new PassThrough();

    // Настраиваем multipart upload в S3
    const upload = new Upload({
      client: s3Client,
      params: {
        Bucket: s3Config.bucket,
        Key: fileName,
        Body: passThrough,
        ContentType: document.mimeType || 'application/octet-stream',
      },
      // Размер части для multipart upload (минимум 5 MB)
      partSize: 5 * 1024 * 1024, // 5 MB
      queueSize: 4, // Количество одновременных загрузок частей
    });

    // Отслеживаем прогресс загрузки в S3
    upload.on('httpUploadProgress', (progress) => {
      const percent = ((progress.loaded / totalSize) * 100).toFixed(2);
      console.log(`S3 Upload progress: ${percent}% (${progress.loaded}/${totalSize} bytes)`);
    });

    // Запускаем загрузку в S3 асинхронно
    const uploadPromise = upload.done();

    let downloadedBytes = 0;

    // Скачиваем из Telegram и пишем в stream
    for await (const chunk of client.iterDownload({
      file: new Api.InputDocumentFileLocation({
        id: document.id,
        accessHash: document.accessHash,
        fileReference: document.fileReference,
        thumbSize: '', // Полный файл, не thumbnail
      }),
      requestSize: 2 * 1024 * 1024, // 2 MB за раз
    })) {
      downloadedBytes += chunk.length;
      const percent = ((downloadedBytes / totalSize) * 100).toFixed(2);
      console.log(`Telegram download: ${percent}% (${downloadedBytes}/${totalSize} bytes)`);

      // Пишем chunk в PassThrough stream
      const canWrite = passThrough.write(chunk);

      // Если буфер заполнен, ждём drain
      if (!canWrite) {
        await new Promise((resolve) => passThrough.once('drain', resolve));
      }
    }

    // Завершаем stream
    passThrough.end();

    // Ждём завершения загрузки в S3
    const result = await uploadPromise;

    const s3Url = `${s3Config.endpoint}/${s3Config.bucket}/${fileName}`;
    console.log(`Successfully streamed to S3: ${s3Url}`);

    return {
      url: s3Url,
      bucket: s3Config.bucket,
      key: fileName,
      size: totalSize,
      etag: result.ETag,
    };
  } catch (error) {
    console.error(`Failed to stream video ${channelUsername}/${messageId}:`, error);
    return null;
  }
}

// Универсальная функция с автоматическим выбором метода
async function uploadVideoToS3(client, channelUsername, messageId) {
  try {
    // Получаем информацию о сообщении
    const messages = await client.getMessages(channelUsername, {
      ids: [messageId],
    });

    const message = messages[0];

    if (!message || !message.media) {
      console.warn(`No media found in message ${messageId}`);
      return null;
    }

    // Определяем размер файла
    const fileSize = message.media.document?.size || 0;

    // Если файл меньше 50 MB, загружаем через buffer
    if (fileSize < 50 * 1024 * 1024) {
      console.log(`Using buffer upload for ${messageId} (${fileSize} bytes)`);
      return await uploadSmallVideoToS3(client, channelUsername, messageId);
    } else {
      console.log(`Using stream upload for ${messageId} (${fileSize} bytes)`);
      return await uploadLargeVideoToS3Stream(client, channelUsername, messageId);
    }
  } catch (error) {
    console.error(`Failed to upload video ${channelUsername}/${messageId}:`, error.message);
    return null;
  }
}

module.exports = {
  uploadVideoToS3,
  uploadSmallVideoToS3,
  uploadLargeVideoToS3Stream,
};
