const { getDirectMediaUrl } = require('./getDirectMediaUrl');
const { bigIntToString } = require('./utils');

// Извлечение метаданных медиа + генерация публичной ссылки
async function extractMediaMetadata(media, messageId, channelUsername) {
  const metadata = {
    type: 'unknown',
    fileId: null,
    size: null,
    mimeType: null,
    width: null,
    height: null,
    duration: null,
    publicUrl: null,
    thumbnailUrl: null,
    directUrl: null, // Прямая ссылка на файл
  };

  const postUrl = `https://t.me/${channelUsername}/${messageId}`;
  metadata.publicUrl = postUrl;

  // Проверка на null/undefined
  if (!media) {
    console.warn(`No media object for message ${messageId}`);
    return metadata;
  }

  // console.log(`Extracting metadata for message ${messageId} with media type:`, Object.keys(media));

  if (media.photo && media.photo.id) {
    metadata.type = 'photo';
    metadata.fileId = bigIntToString(media.photo.id);

    // Получаем прямую ссылку через веб-скрапинг
    metadata.directUrl = await getDirectMediaUrl(channelUsername, messageId);

    if (media.photo.sizes && Array.isArray(media.photo.sizes) && media.photo.sizes.length > 0) {
      const largestSize = media.photo.sizes[media.photo.sizes.length - 1];
      metadata.width = largestSize.w;
      metadata.height = largestSize.h;
      metadata.size = largestSize.size;
    }
  } else if (media.document && media.document.id) {
    const doc = media.document;
    metadata.fileId = bigIntToString(media.document.id);
    metadata.size = doc.size;
    metadata.mimeType = doc.mimeType;

    // Получаем прямую ссылку
    metadata.directUrl = await getDirectMediaUrl(channelUsername, messageId);

    if (doc.mimeType && doc.mimeType.startsWith('video/')) {
      metadata.type = 'video';

      if (doc.attributes && Array.isArray(doc.attributes)) {
        for (const attr of doc.attributes) {
          if (attr.className === 'DocumentAttributeVideo') {
            metadata.width = attr.w;
            metadata.height = attr.h;
            metadata.duration = attr.duration;
          }
          if (attr && attr.className === 'DocumentAttributeFilename') {
            metadata.filename = attr.fileName;
          }
        }
      }
    } else if (doc.mimeType && doc.mimeType.startsWith('image/')) {
      metadata.type = 'image';
    } else if (doc.mimeType && doc.mimeType.startsWith('audio/')) {
      metadata.type = 'audio';
      if (doc.attributes && Array.isArray(doc.attributes)) {
        for (const attr of doc.attributes) {
          if (attr && attr.className === 'DocumentAttributeAudio') {
            metadata.duration = attr.duration;
            metadata.title = attr.title;
            metadata.performer = attr.performer;
          }
        }
      }
    } else {
      metadata.type = 'document';
    }
  }

  // console.log(`Extracted metadata for message ${messageId}:`, metadata);

  return metadata;
}

module.exports = { extractMediaMetadata };
