const axios = require('axios');
const cheerio = require('cheerio');
const { sleep, randomDelay } = require('./utils');

// Функция для получения прямой ссылки через веб-скрапинг
async function getDirectMediaUrl(channelUsername, messageId) {
  try {
    const url = `https://t.me/s/${channelUsername}/${messageId}`;

    // Задержка для безопасности
    await sleep(randomDelay(1000, 2000));

    const response = await axios.get(url, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
        'Accept-Encoding': 'gzip, deflate, br',
        Connection: 'keep-alive',
        'Upgrade-Insecure-Requests': '1',
      },
      timeout: 10000,
    });

    const $ = cheerio.load(response.data);

    // Формируем полный идентификатор поста: channel/messageId
    const postId = `${channelUsername}/${messageId}`;

    // Находим конкретный пост по data-post атрибуту
    const postElement = $(`.tgme_widget_message[data-post="${postId}"]`);

    if (postElement.length === 0) {
      console.warn(`Post ${postId} not found on page`);
      return null;
    }

    console.log(`Found post element for ${postId}`);

    // Ищем фото
    const photoUrl = postElement.find('.tgme_widget_message_photo_wrap').attr('style');
    if (photoUrl) {
      const match = photoUrl.match(/url\('([^']+)'\)/);
      if (match) {
        return match[1]; // https://cdn4.telesco.pe/file/...
      }
    }

    // Ищем видео
    const videoUrl = postElement.find('.tgme_widget_message_video_player video').attr('src');
    if (videoUrl) {
      return videoUrl; // https://cdn4.telesco.pe/file/...
    }

    // Ищем документ
    const docUrl = postElement.find('.tgme_widget_message_document_icon').closest('a').attr('href');
    if (docUrl) {
      return docUrl;
    }

    return null;
  } catch (error) {
    console.error(`Failed to get direct URL for ${channelUsername}/${messageId}:`, error.message);
    return null;
  }
}

module.exports = { getDirectMediaUrl };
