const {getDirectMediaUrl} = require('./getDirectMediaUrl')

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
    directUrl: null  // Прямая ссылка на файл
  };

  const postUrl = `https://t.me/${channelUsername}/${messageId}`;
  metadata.publicUrl = postUrl;

  if (media.photo) {
    metadata.type = 'photo';
    metadata.fileId = media.photo.id?.toString();
    
    // Получаем прямую ссылку через веб-скрапинг
    metadata.directUrl = await getDirectMediaUrl(channelUsername, messageId);
    
    if (media.photo.sizes && media.photo.sizes.length > 0) {
      const largestSize = media.photo.sizes[media.photo.sizes.length - 1];
      metadata.width = largestSize.w;
      metadata.height = largestSize.h;
      metadata.size = largestSize.size;
    }
  } 
  else if (media.document) {
    const doc = media.document;
    metadata.fileId = doc.id?.toString();
    metadata.size = doc.size;
    metadata.mimeType = doc.mimeType;
    
    // Получаем прямую ссылку
    metadata.directUrl = await getDirectMediaUrl(channelUsername, messageId);
    
    if (doc.mimeType?.startsWith('video/')) {
      metadata.type = 'video';
      
      if (doc.attributes) {
        for (const attr of doc.attributes) {
          if (attr.className === 'DocumentAttributeVideo') {
            metadata.width = attr.w;
            metadata.height = attr.h;
            metadata.duration = attr.duration;
          }
        }
      }
    } 
    else if (doc.mimeType?.startsWith('image/')) {
      metadata.type = 'image';
    }
    else if (doc.mimeType?.startsWith('audio/')) {
      metadata.type = 'audio';
    }
    else {
      metadata.type = 'document';
    }
  }

  return metadata;
}

module.exports = {extractMediaMetadata}