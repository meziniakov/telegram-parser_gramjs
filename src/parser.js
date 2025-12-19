const { sleep, randomDelay } = require('./lib/utils');
const { processSingleMessage } = require('./lib/processSingleMessage');
const { processGroupedMessages } = require('./lib/processGroupedMessages');
const { ensureBoundaryGroupsComplete } = require('./lib/ensureBoundaryGroupsComplete');
const {
  getTelegramClient,
  initTelegramClient,
  disconnectTelegramClient,
} = require('./telegramClient');
const { updateJobProgress, getJobStats } = require('../jobManager');
const { createProxyAgent } = require('../proxyManager');
const { waitForActiveUploads, cleanupS3Client } = require('./s3Client');

/**
 * Парсинг канала с поддержкой resume и proxy
 */
async function parseChannelResumable(channelUsername, options = {}) {
  const {
    limit = 100,
    offset = 0,
    downloadMedia = false,
    // fetchDirectUrls = false,
    jobId,
    batchSize = 50,
    startFromMessageId = null, // Для resume
    proxy = null,
  } = options;

  // Настройка клиента с proxy
  const clientOptions = {
    connectionRetries: 5,
    floodSleepThreshold: 300,
    useWSS: false,
    autoReconnect: true,
  };

  if (proxy) {
    const agent = createProxyAgent(proxy);
    clientOptions.proxy = agent;
    console.log(`[${jobId}] Using proxy: ${proxy}`);
  }

  try {
    // Инициализируем клиент один раз
    await initTelegramClient();
    const client = getTelegramClient();

    // ВАЖНО: Определяем cleanChannelName в начале
    const cleanChannelName = channelUsername.replace(/^@/, '');

    // Обновляем статус задания
    await updateJobProgress(jobId, { status: 'running' });

    // Если указан startFromMessageId, начинаем с него
    const effectiveOffset = startFromMessageId || offset;

    // Добавляем запас для граничных групп
    // const fetchLimit = limit + 10;
    const fetchLimit = limit;

    const totalMessages = [];
    const maxBatches = Math.ceil(fetchLimit / batchSize);
    let currentOffsetId = effectiveOffset;

    // Получение сообщений порциями
    for (let batch = 0; batch < maxBatches; batch++) {
      const currentLimit = Math.min(batchSize, fetchLimit - batch * batchSize);

      try {
        console.log(
          `[${jobId}] Fetching batch ${batch + 1}/${maxBatches} from offset ${currentOffsetId}...`
        );

        const messages = await client.getMessages(cleanChannelName, {
          limit: currentLimit,
          offsetId: currentOffsetId,
        });

        if (messages.length === 0) {
          console.log(`[${jobId}] No more messages to fetch`);
          break;
        }

        totalMessages.push(...messages);
        console.log(`[${jobId}] ✓ Batch ${batch + 1}: ${messages.length} messages`);

        // Обновляем offset для следующей порции
        currentOffsetId = messages[messages.length - 1].id;

        // Сохраняем прогресс после каждого батча
        await updateJobProgress(jobId, {
          totalMessages: totalMessages.length,
          nextOffsetId: currentOffsetId,
        });

        if (batch < maxBatches - 1) {
          const delay = randomDelay(3000, 7000);
          console.log(`[${jobId}] Waiting ${Math.round(delay / 1000)}s...`);
          await sleep(delay);
        }

        if (messages.length < currentLimit) {
          console.log(`[${jobId}] Reached end of channel`);
          break;
        }
      } catch (error) {
        if (error.errorMessage === 'FLOOD') {
          const waitTime = error.seconds || 60;
          console.warn(`[${jobId}] ⚠️ FLOOD_WAIT: ${waitTime}s`);

          // Сохраняем текущий прогресс перед ожиданием
          await updateJobProgress(jobId, {
            status: 'paused',
            nextOffsetId: currentOffsetId,
            lastError: `FLOOD_WAIT: ${waitTime}s`,
          });

          await sleep(waitTime * 1000);

          await updateJobProgress(jobId, { status: 'running' });
          batch--;
          continue;
        }

        throw error;
      }
    }

    console.log(`[${jobId}] ✓ Fetched: ${totalMessages.length} messages`);

    // Проверка граничных групп
    const additionalMessages = await ensureBoundaryGroupsComplete(
      client,
      cleanChannelName,
      totalMessages,
      jobId
    );

    if (additionalMessages.length > 0) {
      totalMessages.push(...additionalMessages);
      totalMessages.sort((a, b) => b.id - a.id);
    }

    // Группировка сообщений
    const messageGroups = new Map();
    const standaloneMessages = [];

    for (const msg of totalMessages) {
      if (msg.groupedId) {
        const groupId = msg.groupedId.toString();
        if (!messageGroups.has(groupId)) {
          messageGroups.set(groupId, []);
        }
        messageGroups.get(groupId).push(msg);
      } else {
        standaloneMessages.push(msg);
      }
    }

    console.log(
      `[${jobId}] Grouped: ${standaloneMessages.length} standalone, ${messageGroups.size} albums`
    );

    // Обработка сообщений
    let processedPosts = 0;
    let savedCount = 0;
    let mediaCount = 0;

    // 1. Обработка отдельных сообщений
    for (const msg of standaloneMessages) {
      if (processedPosts >= limit) {
        console.log(`[${jobId}] Reached post limit (${limit}), stopping`);
        break;
      }

      try {
        const result = await processSingleMessage(
          client,
          msg,
          cleanChannelName,
          jobId,
          downloadMedia
        );

        savedCount += result.savedPosts;
        mediaCount += result.savedMedia;
        processedPosts++;

        // Обновляем прогресс каждые 10 постов
        if (processedPosts % 10 === 0) {
          await updateJobProgress(jobId, {
            processedMessages: processedPosts,
            lastMessageId: msg.id,
            nextOffsetId: msg.id,
          });
        }

        await sleep(randomDelay(500, 1500));
      } catch (error) {
        console.error(`[${jobId}] Error processing message ${msg.id}:`, error.message);

        // Увеличиваем счетчик ошибок
        const stats = await getJobStats(jobId);
        await updateJobProgress(jobId, {
          errorCount: (stats?.error_count || 0) + 1,
          lastError: error.message,
        });
      }
    }

    // 2. Обработка сгруппированных сообщений (альбомов)
    for (const [groupId, messages] of messageGroups.entries()) {
      if (processedPosts >= limit) {
        break;
      }

      try {
        const result = await processGroupedMessages(
          client,
          messages,
          cleanChannelName,
          jobId,
          downloadMedia
        );

        savedCount += result.savedPosts;
        mediaCount += result.savedMedia;
        processedPosts++;

        const firstMsg = messages.sort((a, b) => a.id - b.id)[0];

        // Обновляем прогресс каждые 10 постов
        if (processedPosts % 10 === 0) {
          await updateJobProgress(jobId, {
            processedMessages: processedPosts,
            lastMessageId: firstMsg.id,
            nextOffsetId: firstMsg.id,
          });
        }

        await sleep(randomDelay(500, 1500));
      } catch (error) {
        console.error(`[${jobId}] Error processing group ${groupId}:`, error.message);

        const stats = await getJobStats(jobId);
        // Увеличиваем счетчик ошибок
        await updateJobProgress(jobId, {
          errorCount: (stats?.error_count || 0) + 1,
          lastError: error.message,
        });
      }
    }

    // Финальное обновление
    await updateJobProgress(jobId, {
      status: 'completed',
      processedMessages: processedPosts,
      completedAt: new Date(),
    });

    console.log(`[${jobId}] ✓ Completed: ${savedCount} posts, ${mediaCount} media`);

    return {
      parsed: savedCount,
      media_metadata: mediaCount,
      job_id: jobId,
    };
  } catch (error) {
    console.error(`[${jobId}] ❌ Fatal error:`, error.message);

    // Сохраняем ошибку
    await updateJobProgress(jobId, {
      status: 'failed',
      lastError: error.message,
    });

  } finally {
    // Отключаемся при завершении
    try {
      await waitForActiveUploads(30000); // если используете S3
      await cleanupS3Client(); // если используете S3
      await disconnectTelegramClient();
      console.log(`[${jobId}] Cleanup completed`);
    } catch (e) {
      console.error(`[${jobId}] Error during cleanup:`, e.message);
    }
    
    // ВАЖНО: явно завершаем процесс
    process.exit(0);
  }
}

/**
 * Парсинг канала без resume и proxy
 */
async function parseChannel(channelUsername, limit, offset, downloadMedia, jobId, fetchDirectUrls) {
  console.log(`[${jobId}] Starting safe parse: ${channelUsername}`);
  console.log(
    `[${jobId}] Limit: ${limit}, Download media: ${downloadMedia}, Fetch direct urls: ${fetchDirectUrls}`
  );

  try {
    // Инициализируем клиент один раз
    await initTelegramClient();
    const client = getTelegramClient();

    // ВАЖНО: Определяем cleanChannelName в начале
    const cleanChannelName = channelUsername.replace(/^@/, '');

    // Получаем информацию о канале для построения ссылок
    const entity = await client.getEntity(cleanChannelName);
    const channelId = entity.id;

    console.log(`[${jobId}] ✓ Channel ID: ${channelId}`);

    // Добавляем небольшой запас
    // const fetchLimit = limit + 10;
    const fetchLimit = limit + 0;
    console.log(`[${jobId}] Requested limit: ${limit}, fetching: ${fetchLimit} (with buffer)`);

    // Безопасный размер батча
    const batchSize = 50;
    const totalMessages = [];
    const maxBatches = Math.ceil(fetchLimit / batchSize);

    // Получаем сообщения порциями
    for (let batch = 0; batch < maxBatches; batch++) {
      const currentLimit = Math.min(batchSize, fetchLimit - batch * batchSize);

      try {
        console.log(`[${jobId}] Fetching batch ${batch + 1}/${maxBatches}...`);

        const messages = await client.getMessages(channelUsername, {
          limit: currentLimit,
          offsetId: offset + batch * batchSize,
        });

        console.log(`[${jobId}] ✓ Total messages: ${JSON.stringify({ messages })}`);

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

    // Проверяем граничные группы
    const additionalMessages = await ensureBoundaryGroupsComplete(
      client,
      channelUsername,
      totalMessages,
      jobId
    );

    if (additionalMessages.length > 0) {
      totalMessages.push(...additionalMessages);
      totalMessages.sort((a, b) => b.id - a.id);
    }

    // Группируем сообщения по groupedId
    const messageGroups = new Map();
    const standaloneMessages = [];

    for (const msg of totalMessages) {
      if (msg.groupedId) {
        // console.log(`[${jobId}] Message ${msg.id} is part of grouped album - ${JSON.stringify(msg)}`);
        // Это часть альбома
        const groupId = msg.groupedId.toString();
        if (!messageGroups.has(groupId)) {
          messageGroups.set(groupId, []);
        }
        messageGroups.get(groupId).push(msg);
      } else {
        // Отдельное сообщение
        standaloneMessages.push(msg);
      }
    }

    console.log(
      `[${jobId}] Found ${standaloneMessages.length} standalone messages and ${messageGroups.size} grouped albums`
    );

    // Обрабатываем с учетом лимита ПОСТОВ (не сообщений)
    let processedPosts = 0;
    let savedCount = 0;
    let mediaCount = 0;

    // 1. Обработка отдельных сообщений
    for (const msg of standaloneMessages) {
      if (processedPosts >= limit) {
        console.log(`[${jobId}] Reached post limit (${limit}), stopping`);
        break;
      }

      try {
        const result = await processSingleMessage(
          client,
          msg,
          cleanChannelName,
          jobId,
          downloadMedia
        );
        savedCount += result.savedPosts;
        mediaCount += result.savedMedia;
        processedPosts++;

        await sleep(randomDelay(500, 1500));
      } catch (error) {
        console.error(`[${jobId}] Error:`, error.message);
      }
    }

    // 2. Обработка сгруппированных сообщений (альбомов)
    for (const [groupId, messages] of messageGroups.entries()) {
      if (processedPosts >= limit) {
        console.log(`[${jobId}] Reached post limit (${limit}), stopping`);
        break;
      }

      try {
        const result = await processGroupedMessages(
          client,
          messages,
          cleanChannelName,
          jobId,
          downloadMedia
        );
        savedCount += result.savedPosts;
        mediaCount += result.savedMedia;
        processedPosts++;

        await sleep(randomDelay(500, 1500));
      } catch (error) {
        console.error(`[${jobId}] Error processing group ${groupId}:`, error.message);
      }
    }

    console.log(`[${jobId}] ✓ Completed: ${savedCount} posts, ${mediaCount} media metadata saved`);

    return {
      parsed: savedCount,
      media_metadata: mediaCount,
      job_id: jobId,
    };
  } catch (error) {
    console.error(`[${jobId}] ❌ Fatal error:`, error.message);

  } finally {
        // Отключаемся при завершении
    try {
      await waitForActiveUploads(30000); // если используете S3
      await cleanupS3Client(); // если используете S3
      await disconnectTelegramClient();
      console.log(`[${jobId}] Cleanup completed`);
    } catch (e) {
      console.error(`[${jobId}] Error during cleanup:`, e.message);
    }
    
    // ВАЖНО: явно завершаем процесс
    process.exit(0);
  }
}

// Обработка выхода (Ctrl+C)
process.on('SIGINT', async () => {
  console.log('\nShutting down...');
  await disconnectTelegramClient();
  process.exit(0);
});

module.exports = { parseChannelResumable, parseChannel };
