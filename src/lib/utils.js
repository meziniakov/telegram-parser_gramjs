// Функция задержки
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Случайная задержка в диапазоне
function randomDelay(min, max) {
  return min + Math.random() * (max - min);
}

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

function parseTelegramPost(text, entities) {
  const result = {
    hashtags: [],
    title: '',
    author: '',
    authorUrl: null,
    coordinates: {
      lat: null,
      lon: null,
    },
    media: [],
    mapUrl: null,
    description: '',
  };

  // Извлекаем хэштеги
  const hashtagEntities = entities.filter((e) => e.className === 'MessageEntityHashtag');
  result.hashtags = hashtagEntities.map((e) => text.substr(e.offset, e.length).replace('#', ''));

  // Извлекаем заголовок (первая строка до первого хэштега)
  const firstHashtag = entities.find((e) => e.className === 'MessageEntityHashtag');
  const titleEnd = firstHashtag ? firstHashtag.offset : text.indexOf('\n');
  result.title = text
    .substring(0, titleEnd)
    .replace(/^[^а-яА-ЯёЁ]+/, '')
    .trim();

  //Извлекаем автора изображения и URL автора (если есть)
  // Разделение текста на строки
  const lines = text.split('\n').filter((line) => line.trim());

  // Ищем строку с 📷 или надписью Фото
  const cameraIndex = lines.findIndex((line) => line.includes('📷') || line.includes('Фото'));
  if (cameraIndex === -1) {
    return ((result.author = null), (result.authorUrl = null));
  }

  // Находим конец строки с 📷
  const endIndex = text.indexOf('\n', cameraIndex);

  // Извлекаем автора изображения (строка после 📷  или слова Фото)
  const authorLine = lines.find((line) => line.includes('📷') || line.includes('Фото'));
  if (authorLine) {
    result.author = authorLine.replace('📷').replace('Автор фото:', '').trim();
  }

  console.log({ authorLine, author: result.author });

  // Извлекаем URL автора изображения (если есть)
  for (const entity of entities) {
    // Ищем TextUrl после 📷
    if (
      entity.className === 'MessageEntityTextUrl' &&
      entity.offset >= cameraIndex &&
      entity.offset < endIndex
    ) {
      result.authorName = text.slice(entity.offset, entity.offset + entity.length).trim();
      result.authorUrl = entity.url;
      break;
    }
    // Альтернативно ищем упоминание @username
    if (
      entity.className === 'MessageEntityMention' &&
      entity.offset >= cameraIndex &&
      entity.offset < endIndex
    ) {
      const mention = text.slice(entity.offset, entity.offset + entity.length).trim();
      result.author = mention;
      result.authorUrl = `https://t.me/${mention.replace('@', '')}`;
      break;
    }
  }

  // Извлекаем координаты
  // const regex = /[-+]?\d{1,2}\.\d+,\s*[-+]?\d{1,3}\.\d+/g;
  const coordsMatch = text.match(/(\d+\.\d+), (\d+\.\d+)/);
  if (coordsMatch) {
    result.coordinates.lat = parseFloat(coordsMatch[1]);
    result.coordinates.lon = parseFloat(coordsMatch[2]);
  }

  // Извлекаем URL карты
  const mapUrlEntity = entities
    .filter((e) => text.substring(e.offset, e.offset + e.length).includes('Место на карте'))
    .find((e) => e.className === 'MessageEntityTextUrl');
  if (mapUrlEntity) {
    try {
      new URL(mapUrlEntity.url);
      result.mapUrl = mapUrlEntity.url;
    } catch (e) {
      console.log(e);
      // URL невалидный, пропускаем
    }
  }

  // Извлекаем описание (текст между хэштегами и координатами)
  const descStart =
    text.indexOf('\n', firstHashtag ? firstHashtag.offset + firstHashtag.length : 0) + 1;
  const descEnd = text.indexOf('Координаты -');
  if (descStart !== -1 && descEnd !== -1) {
    result.description = text
      .substring(descStart, descEnd)
      // .replace(/[^\а-яА-ЯёЁ\s\.\,\!\?\-]/g, "") // Удаляем эмодзи и спецсимволы
      .replace(/\s+/g, ' ') // Удаляем лишние пробелы
      .trim();
  }

  return result;
}

module.exports = { bigIntToString, sleep, randomDelay, parseTelegramPost };
