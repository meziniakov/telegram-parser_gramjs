const { sleep, randomDelay } = require('./utils');

// Функция для проверки и дополнения граничных сгруппированных сообщений
async function ensureBoundaryGroupsComplete(client, channelUsername, messages, jobId) {
  const grouped = messages.filter((m) => m.groupedId);

  console.log(`All messages count: ${messages.length}, grouped count: ${grouped.length}`);
  // console.log(`View text of grouped messages: ${grouped.map((m) => m.message).join(' | ')}`);

  if (grouped.length === 0) {
    return [];
  }

  // Сортируем по ID
  grouped.sort((a, b) => a.id - b.id);

  const firstGroupId = grouped[0].groupedId.toString();
  const lastGroupId = grouped[grouped.length - 1].groupedId.toString();

  const additionalMessages = [];

  // Проверяем первую группу (может быть обрезана сверху)
  const firstGroupMessages = grouped.filter((m) => m.groupedId.toString() === firstGroupId);
  const firstMinId = Math.min(...firstGroupMessages.map((m) => m.id));

  console.log(`[${jobId}] Checking first group ${firstGroupId} starting from ID ${firstMinId}`);

  try {
    // Загружаем несколько сообщений перед первым в группе
    const before = await client.getMessages(channelUsername, {
      minId: firstMinId - 10,
      maxId: firstMinId + 1,
      limit: 10,
    });

    for (const msg of before) {
      if (msg.groupedId && msg.groupedId.toString() === firstGroupId && msg.id < firstMinId) {
        console.log(`[${jobId}] ✓ Found earlier message ${msg.id} in first group`);
        additionalMessages.push(msg);
      }
    }

    await sleep(randomDelay(1000, 2000));
  } catch (error) {
    console.error(`[${jobId}] Failed to check first group:`, error.message);
  }

  // Проверяем последнюю группу (может быть обрезана снизу)
  if (lastGroupId !== firstGroupId) {
    const lastGroupMessages = grouped.filter((m) => m.groupedId.toString() === lastGroupId);
    const lastMaxId = Math.max(...lastGroupMessages.map((m) => m.id));

    console.log(`[${jobId}] Checking last group ${lastGroupId} ending at ID ${lastMaxId}`);

    try {
      // Загружаем несколько сообщений после последнего в группе
      const after = await client.getMessages(channelUsername, {
        minId: lastMaxId - 1,
        maxId: lastMaxId + 10,
        limit: 10,
      });

      for (const msg of after) {
        if (msg.groupedId && msg.groupedId.toString() === lastGroupId && msg.id > lastMaxId) {
          console.log(`[${jobId}] ✓ Found later message ${msg.id} in last group`);
          additionalMessages.push(msg);
        }
      }
    } catch (error) {
      console.error(`[${jobId}] Failed to check last group:`, error.message);
    }
  }

  return additionalMessages;
}

module.exports = { ensureBoundaryGroupsComplete };
