const { savePost, saveMediaMetadata } = require('../database');
const { extractMediaMetadata } = require('./extractMediaMetadata');
const { detectAdvertising } = require('./detectAdvertising');

// Функция для обработки сгруппированных сообщений (альбом)
async function processGroupedMessages(messages, cleanChannelName, jobId) {
  // Сортируем по ID (первое сообщение содержит текст)
  messages.sort((a, b) => a.id - b.id);

  console.log(`all messages: ${JSON.stringify(messages)}`);

  const firstMsg = messages[0];
  const isAd = detectAdvertising(firstMsg.message);
  const messageDate =
    firstMsg.date instanceof Date ? firstMsg.date : new Date(firstMsg.date * 1000);

  console.log(`[${jobId}] Processing grouped messages: ${messages.map((m) => m.id).join(', ')}`);
  console.log(
    `[${jobId}] Album text from first message ${firstMsg.id}: "${firstMsg.message || '(no text)'}"`
  );

  // Сохраняем ОДИН пост для всего альбома (используем ID первого сообщения)
  const postId = await savePost({
    channel_username: cleanChannelName,
    message_id: firstMsg.id,
    text: firstMsg.message || '', // Текст берем из первого сообщения
    date: messageDate,
    views: firstMsg.views || 0,
    is_ad: isAd,
    job_id: jobId,
  });

  let savedMedia = 0;

  // счетчик порядка
  let mediaOrder = 0;

  // Обрабатываем ВСЕ медиа из альбома
  for (const msg of messages) {
    if (msg.media) {
      try {
        console.log(`[${jobId}] Processing media from message ${msg.id} in group`);

        const mediaMetadata = await extractMediaMetadata(msg.media, msg.id, cleanChannelName);

        if (!mediaMetadata.fileId) {
          console.log(`[${jobId}] Skipping media for ${msg.id} - no file_id`);
          continue;
        }

        // Сохраняем медиа с привязкой к ОДНОМУ посту
        await saveMediaMetadata({
          post_id: postId, // Все медиа привязываем к одному посту
          media_type: mediaMetadata.type,
          file_id: mediaMetadata.fileId,
          file_size: mediaMetadata.size,
          mime_type: mediaMetadata.mimeType,
          width: mediaMetadata.width,
          height: mediaMetadata.height,
          duration: mediaMetadata.duration,
          file_url: mediaMetadata.publicUrl,
          direct_url: mediaMetadata.directUrl,
          thumbnail_url: mediaMetadata.thumbnailUrl,
          media_order: mediaOrder++, // Порядок медиа в группе
        });

        savedMedia++;
        console.log(`[${jobId}] ✓ Saved media ${savedMedia} from message ${msg.id}`);
      } catch (error) {
        console.error(`[${jobId}] Failed to save media from message ${msg.id}:`, error.message);
      }
    }
  }

  console.log(`[${jobId}] ✓ Saved grouped post ${firstMsg.id} with ${savedMedia} media files`);

  return { savedPosts: 1, savedMedia };
}

module.exports = { processGroupedMessages };
