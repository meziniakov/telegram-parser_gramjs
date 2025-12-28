const { savePost, saveMediaMetadata } = require('../database');
const { extractMediaMetadata } = require('./extractMediaMetadata');
const { detectAdvertising } = require('./detectAdvertising');
const { uploadToS3 } = require('../storage');
const { parseTelegramPost } = require('./utils');

// Функция для обработки одного сообщения
async function processSingleMessage(client, msg, cleanChannelName, jobId, downloadMedia = false) {
  const isAd = detectAdvertising(msg.message);
  if (isAd) {
    return { savedPosts: 0, savedMedia: 0 };
  }
  const messageDate = msg.date instanceof Date ? msg.date : new Date(msg.date * 1000);

  const parsedPost = parseTelegramPost(msg.message || '', msg.entities || []);

  console.log(`Parsed single post: `, parsedPost);

  // return { savedPosts: 1, savedMedia };

  const postId = await savePost({
    channel_username: cleanChannelName,
    title: parsedPost.title,
    description: parsedPost.description,
    latitude: parsedPost.coordinates.lat,
    longitude: parsedPost.coordinates.lon,
    hashtags: parsedPost.hashtags,
    author: parsedPost.author,
    author_url: parsedPost.authorUrl,
    mapUrl: parsedPost.mapUrl,
    status: 'pending',
    externalId: msg.id,
    message_id: msg.id,
    text: msg.message || '',
    entities: msg.entities || [],
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

      let s3Url = null;
      console.log(`[${jobId}] Downloading video from message ${msg.id}...`);

      const buffer = await client.downloadMedia(msg.media, {
        progressCallback: (downloaded, total) => {
          const percent = ((downloaded / total) * 100).toFixed(1);
          if (downloaded % (1024 * 1024 * 5) === 0) {
            // Логируем каждые 5 MB
            console.log(`[${jobId}] Download progress: ${percent}%`);
          }
        },
      });
      console.log(`[${jobId}] ✓ Downloaded ${(buffer.length / 1024 / 1024).toFixed(2)} MB`);

      if (!mediaMetadata.fileId) {
        console.log(`[${jobId}] Skipping media for ${msg.id} - no file_id (${mediaMetadata.type})`);
      } else {
        // ЗАГРУЗКА ВИДЕО В S3
        if (downloadMedia && mediaMetadata.type === 'video') {
          try {
            // Загружаем в S3
            s3Url = await uploadToS3(buffer, cleanChannelName, msg.id, msg.media);

            console.log(`[${jobId}] ✓ Uploaded to S3: ${s3Url}`);
          } catch (downloadError) {
            console.error(`[${jobId}] Failed to download/upload video:`, downloadError.message);
            // Продолжаем без S3 URL
          }
        } else {
          s3Url = await uploadToS3(buffer, cleanChannelName, msg.id, msg.media);
        }

        await saveMediaMetadata({
          post_id: postId,
          media_type: mediaMetadata.type,
          file_id: mediaMetadata.fileId,
          file_size: mediaMetadata.size,
          image_author: parsedPost.author,
          image_author_url: parsedPost.authorUrl,
          mime_type: mediaMetadata.mimeType,
          width: mediaMetadata.width,
          height: mediaMetadata.height,
          duration: mediaMetadata.duration,
          file_url: mediaMetadata.publicUrl,
          direct_url: mediaMetadata.directUrl,
          thumbnail_url: mediaMetadata.thumbnailUrl,
          s3_url: s3Url || null,
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
