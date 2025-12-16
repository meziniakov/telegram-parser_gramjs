const axios = require('axios');
const cheerio = require('cheerio');

// Функция для получения прямой ссылки через веб-скрапинг
async function getDirectMediaUrl(channelUsername, messageId) {
  try {
    const url = `https://t.me/s/${channelUsername}/${messageId}`;
    
    // Задержка для безопасности
    await sleep(randomDelay(1000, 2000));
    
    const response = await axios.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      },
      timeout: 10000
    });
    
    const $ = cheerio.load(response.data);
    
    // Ищем фото
    const photoUrl = $('.tgme_widget_message_photo_wrap').attr('style');
    if (photoUrl) {
      const match = photoUrl.match(/url\('([^']+)'\)/);
      if (match) {
        return match[1];  // https://cdn4.telesco.pe/file/...
      }
    }
    
    // Ищем видео
    const videoUrl = $('.tgme_widget_message_video_player video').attr('src');
    if (videoUrl) {
      return videoUrl;  // https://cdn4.telesco.pe/file/...
    }
    
    // Ищем документ
    const docUrl = $('.tgme_widget_message_document_icon').closest('a').attr('href');
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