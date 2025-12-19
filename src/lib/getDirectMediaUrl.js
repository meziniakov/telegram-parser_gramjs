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

    // Ищем медиа в сгруппированных элементах (альбомах) по href
    // Фото в альбоме
    let mediaElement = $(`.tgme_widget_message_photo_wrap[href*="/${messageId}?single"]`);
    if (mediaElement.length > 0) {
      const photoUrl = mediaElement.attr('style');
      if (photoUrl) {
        const match = photoUrl.match(/url\(['"']?([^'"')]+)['"']?\)/);
        if (match) {
          console.log(`Found grouped photo for ${postId}`);
          return match[1];
        }
      }
    }

    // Видео в альбоме
    mediaElement = $(`.tgme_widget_message_video_player[href*="/${messageId}?single"]`);
    if (mediaElement.length > 0) {
      const videoUrl = mediaElement.find('video').attr('src');
      if (videoUrl) {
        console.log(`Found grouped video for ${postId}`);
        return videoUrl;
      }
    }

    // Если не найдено в альбоме, ищем основной пост с data-post
    const postElement = $(`.tgme_widget_message[data-post="${postId}"]`);

    if (postElement.length === 0) {
      console.warn(`Media ${postId} not found on page`);
      return null;
    }

    console.log(`Found main post element for ${postId}`);

    // Ищем фото в основном посте
    const photoUrl = postElement.find('.tgme_widget_message_photo_wrap').attr('style');
    if (photoUrl) {
      const match = photoUrl.match(/url\(['"']?([^'"')]+)['"']?\)/);
      if (match) {
        console.log(`Found main photo for ${postId}`);
        return match[1];
      }
    }

    // Ищем видео в основном посте
    const videoUrl = postElement.find('.tgme_widget_message_video_player video').attr('src');
    if (videoUrl) {
      console.log(`Found main video for ${postId}`);
      return videoUrl;
    }

    // Ищем документ
    const docUrl = postElement.find('.tgme_widget_message_document_icon').closest('a').attr('href');
    if (docUrl) {
      console.log(`Found document for ${postId}`);
      return docUrl;
    }

    return null;
  } catch (error) {
    console.error(`Failed to get direct URL for ${channelUsername}/${messageId}:`, error.message);
    return null;
  }
}

module.exports = { getDirectMediaUrl };
