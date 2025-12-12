const { TelegramClient } = require('telegram');
const { StringSession } = require('telegram/sessions');
const { savePost, saveMedia } = require('./database');
const { uploadToStorage } = require('./storage');

async function parseChannel(channelUsername, limit, offset, downloadMedia, jobId) {
  const client = new TelegramClient(
    new StringSession(process.env.TELEGRAM_SESSION),
    parseInt(process.env.TELEGRAM_API_ID),
    process.env.TELEGRAM_API_HASH,
    { connectionRetries: 5 }
  );

  await client.connect();

  const messages = await client.getMessages(channelUsername, {
    limit: limit,
    offsetId: offset,
  });

  for (const msg of messages) {
    // Детекция рекламы
    const isAd = detectAdvertising(msg.text);

    // Сохранение поста
    const postId = await savePost({
      channel_username: channelUsername,
      message_id: msg.id,
      text: msg.text || '',
      date: msg.date,
      views: msg.views || 0,
      is_ad: isAd,
      job_id: jobId
    });

    // Обработка медиа
    if (msg.media && downloadMedia) {
      try {
        const buffer = await client.downloadMedia(msg.media, {});
        const mediaType = getMediaType(msg.media);
        
        // Загрузка в Supabase Storage
        const fileUrl = await uploadToStorage(buffer, `${channelUsername}/${msg.id}`, mediaType);
        
        // Сохранение метаданных медиа
        await saveMedia({
          post_id: postId,
          media_type: mediaType,
          file_url: fileUrl,
          file_size: buffer.length
        });
      } catch (error) {
        console.error(`Failed to download media for message ${msg.id}:`, error);
      }
    }
  }

  await client.disconnect();
  return { parsed: messages.length, job_id: jobId };
}

function detectAdvertising(text) {
  if (!text) return false;
  const adKeywords = ['реклама', '#ad', '#промо', 'партнерский', 'sponsored'];
  return adKeywords.some(keyword => text.toLowerCase().includes(keyword));
}

function getMediaType(media) {
  if (media.photo) return 'photo';
  if (media.document?.mimeType?.startsWith('video/')) return 'video';
  return 'other';
}

module.exports = { parseChannel };
