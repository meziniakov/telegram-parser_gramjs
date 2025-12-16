const { TelegramClient } = require('telegram');
const { StringSession } = require('telegram/sessions');
const { savePost, saveMediaMetadata } = require('./database');
const {extractMediaMetadata} = require('./lib/extractMediaMetadata')
const {detectAdvertising} = require('./lib/detectAdvertising')
const {sleep} = require('./lib/sleep')
const {randomDelay} = require('./lib/randomDelay')

async function parseChannel(channelUsername, limit, offset, downloadMedia, jobId) {
  console.log(`[${jobId}] Starting safe parse: ${channelUsername}`);
  console.log(`[${jobId}] Limit: ${limit}, Download media: ${downloadMedia}`);
  
  const client = new TelegramClient(
    new StringSession(process.env.TELEGRAM_SESSION),
    parseInt(process.env.TELEGRAM_API_ID),
    process.env.TELEGRAM_API_HASH,
    { 
      connectionRetries: 5,
      floodSleepThreshold: 300,
      useWSS: false,
      autoReconnect: true
    }
  );

  try {
    await client.connect();
    console.log(`[${jobId}] ✓ Connected to Telegram`);

    // Получаем информацию о канале для построения ссылок
    const entity = await client.getEntity(channelUsername);
    const channelId = entity.id;
    const channelAccess = entity.accessHash;
    
    console.log(`[${jobId}] ✓ Channel ID: ${channelId}`);

    // Безопасный размер батча
    const batchSize = 50;
    const totalMessages = [];
    const maxBatches = Math.ceil(limit / batchSize);
    
    // Получаем сообщения порциями
    for (let batch = 0; batch < maxBatches; batch++) {
      const currentLimit = Math.min(batchSize, limit - batch * batchSize);
      
      try {
        console.log(`[${jobId}] Fetching batch ${batch + 1}/${maxBatches}...`);
        
        const messages = await client.getMessages(channelUsername, {
          limit: currentLimit,
          offsetId: offset + (batch * batchSize),
        });
        
        totalMessages.push(...messages);
        console.log(`[${jobId}] ✓ Batch ${batch + 1}: ${messages.length} messages`);
        
        // Задержка между батчами (3-7 секунд)
        if (batch < maxBatches - 1 && messages.length > 0) {
          const delay = randomDelay(3000, 7000);
          console.log(`[${jobId}] Waiting ${Math.round(delay / 1000)}s before next batch...`);
          await sleep(delay);
        }
        
        if (messages.length < currentLimit) {
          console.log(`[${jobId}] Reached end of channel`);
          break;
        }
        
      } catch (error) {
        if (error.errorMessage === 'FLOOD') {
          const waitTime = error.seconds || 60;
          console.warn(`[${jobId}] ⚠️ FLOOD_WAIT: waiting ${waitTime} seconds...`);
          await sleep(waitTime * 1000);
          batch--;
          continue;
        }
        
        if (error.errorMessage === 'CHANNEL_PRIVATE') {
          console.error(`[${jobId}] ❌ Channel is private or doesn't exist`);
          throw new Error('Channel is private or not accessible');
        }
        
        throw error;
      }
    }

    console.log(`[${jobId}] ✓ Total fetched: ${totalMessages.length} messages`);

    // Обработка сообщений с задержками
    let savedCount = 0;
    let mediaCount = 0;
    
    for (let i = 0; i < totalMessages.length; i++) {
      const msg = totalMessages[i];
      
      try {
        const isAd = detectAdvertising(msg.text);

        const postId = await savePost({
          channel_username: channelUsername,
          message_id: msg.id,
          text: msg.text || '',
          date: msg.date,
          views: msg.views || 0,
          is_ad: isAd,
          job_id: jobId
        });

        savedCount++;
        
        if ((i + 1) % 10 === 0) {
          console.log(`[${jobId}] Progress: ${i + 1}/${totalMessages.length} posts saved`);
        }

        // Извлечение метаданных медиа И генерация ссылки
        if (msg.media) {
          try {
            const mediaMetadata = await extractMediaMetadata(msg.media, msg.id, channelUsername);
            
            await saveMediaMetadata({
              post_id: postId,
              media_type: mediaMetadata.type,
              file_id: mediaMetadata.fileId,
              file_size: mediaMetadata.size,
              mime_type: mediaMetadata.mimeType,
              width: mediaMetadata.width,
              height: mediaMetadata.height,
              duration: mediaMetadata.duration,
              file_url: mediaMetadata.publicUrl,  // Публичная ссылка на медиа
              thumbnail_url: mediaMetadata.thumbnailUrl
            });

            mediaCount++;
          } catch (error) {
            console.error(`[${jobId}] Failed to save media metadata for message ${msg.id}:`, error.message);
          }
        }
        
        // Задержка между постами (0.5-1.5 сек)
        if (i < totalMessages.length - 1) {
          await sleep(randomDelay(500, 1500));
        }
        
      } catch (error) {
        console.error(`[${jobId}] Error processing message ${msg.id}:`, error.message);
      }
    }

    await client.disconnect();
    console.log(`[${jobId}] ✓ Disconnected from Telegram`);
    console.log(`[${jobId}] ✓ Completed: ${savedCount} posts, ${mediaCount} media metadata saved`);
    
    return { 
      parsed: savedCount,
      media_metadata: mediaCount,
      job_id: jobId 
    };
    
  } catch (error) {
    console.error(`[${jobId}] ❌ Fatal error:`, error.message);
    throw error;

  } finally {
    // НЕ закрывайте пул здесь! Он переиспользуется
    // Только логируем статус
    console.log(`[${jobId}] Active connections: ${pool.totalCount}`);
  }
}

module.exports = { parseChannel };
