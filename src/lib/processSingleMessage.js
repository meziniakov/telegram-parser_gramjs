const { savePost, saveMediaMetadata } = require('../database');
const { extractMediaMetadata } = require('./extractMediaMetadata');
const { detectAdvertising } = require('./detectAdvertising');

// Функция для обработки одного сообщения
async function processSingleMessage(msg, cleanChannelName, jobId) {
  const isAd = detectAdvertising(msg.message);
  const messageDate = msg.date instanceof Date ? msg.date : new Date(msg.date * 1000);

  const postId = await savePost({
    channel_username: cleanChannelName,
    message_id: msg.id,
    text: msg.message || '',
    date: messageDate,
    views: msg.views || 0,
    is_ad: isAd,
    job_id: jobId,
  });

  let savedMedia = 0;

  // Обработка медиа
  if (msg.media) {
    try {
      console.log(
        `[${jobId}] Message ${msg.id} media type:`,
        msg.media.className || typeof msg.media
      );

      const mediaMetadata = await extractMediaMetadata(msg.media, msg.id, cleanChannelName);

      if (!mediaMetadata.fileId) {
        console.log(`[${jobId}] Skipping media for ${msg.id} - no file_id (${mediaMetadata.type})`);
      } else {
        await saveMediaMetadata({
          post_id: postId,
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
        });

        savedMedia++;
      }
    } catch (error) {
      console.error(`[${jobId}] Failed to save media for message ${msg.id}:`, error.message);
    }
  }

  return { savedPosts: 1, savedMedia };
}

module.exports = { processSingleMessage };
