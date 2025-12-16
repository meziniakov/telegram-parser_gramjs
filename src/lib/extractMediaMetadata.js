const {getDirectMediaUrl} = require('./getDirectMediaUrl')

// Helper для конвертации BigInt в строку
function bigIntToString(value) {
  if (value === null || value === undefined) {
    return null;
  }
  
  // Если это BigInt объект из GramJS
  if (typeof value === 'object' && value.toString) {
    return value.toString();
  }
  
  // Если это встроенный BigInt
  if (typeof value === 'bigint') {
    return value.toString();
  }
  
  // Если это уже строка
  if (typeof value === 'string') {
    return value;
  }
  
  // Если это число
  if (typeof value === 'number') {
    return String(value);
  }
  
  // Fallback
  return String(value);
}


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
    metadata.fileId = bigIntToString(media.photo.id);
    
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
    metadata.fileId = bigIntToString(media.photo.id);
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