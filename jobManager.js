const { pool } = require('./src/database');

/**
 * Создание нового задания для парсинга
 */
async function createParsingJob(channelUsername, options = {}) {
  const jobId = `${channelUsername}_${Date.now()}`;

  const query = `
    INSERT INTO parsing_jobs (
      channel_username, job_id, batch_size, download_media, 
      next_offset_id, status, metadata
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7)
    RETURNING *
  `;

  const result = await pool.query(query, [
    channelUsername,
    jobId,
    options.batchSize || 50,
    options.downloadMedia || false,
    options.startFromId || 0,
    'pending',
    JSON.stringify(options.metadata || {}),
  ]);

  return result.rows[0];
}

/**
 * Получение активного или последнего задания для канала
 */
async function getLatestJob(channelUsername) {
  const query = `
    SELECT * FROM parsing_jobs
    WHERE channel_username = $1
    ORDER BY started_at DESC
    LIMIT 1
  `;

  const result = await pool.query(query, [channelUsername]);
  return result.rows.length > 0 ? result.rows[0] : null;
}

/**
 * Получение незавершенного задания для канала
 */
async function getPendingJob(channelUsername) {
  const query = `
    SELECT * FROM parsing_jobs
    WHERE channel_username = $1 
      AND status IN ('pending', 'running', 'paused')
    ORDER BY started_at DESC
    LIMIT 1
  `;

  const result = await pool.query(query, [channelUsername]);
  return result.rows.length > 0 ? result.rows[0] : null;
}

/**
 * Обновление прогресса задания
 */
async function updateJobProgress(jobId, progress) {
  const updates = [];
  const values = [];
  let paramIndex = 1;

  if (progress.status !== undefined) {
    updates.push(`status = $${paramIndex++}`);
    values.push(progress.status);
  }

  if (progress.totalMessages !== undefined) {
    updates.push(`total_messages = $${paramIndex++}`);
    values.push(progress.totalMessages);
  }

  if (progress.processedMessages !== undefined) {
    updates.push(`processed_messages = $${paramIndex++}`);
    values.push(progress.processedMessages);
  }

  if (progress.lastMessageId !== undefined) {
    updates.push(`last_message_id = $${paramIndex++}`);
    values.push(progress.lastMessageId);
  }

  if (progress.nextOffsetId !== undefined) {
    updates.push(`next_offset_id = $${paramIndex++}`);
    values.push(progress.nextOffsetId);
  }

  if (progress.errorCount !== undefined) {
    updates.push(`error_count = $${paramIndex++}`);
    values.push(progress.errorCount);
  }

  if (progress.lastError !== undefined) {
    updates.push(`last_error = $${paramIndex++}`);
    values.push(progress.lastError);
  }

  if (progress.completedAt !== undefined) {
    updates.push(`completed_at = $${paramIndex++}`);
    values.push(progress.completedAt);
  }

  if (progress.metadata !== undefined) {
    updates.push(`metadata = $${paramIndex++}`);
    values.push(JSON.stringify(progress.metadata));
  }

  if (updates.length === 0) {
    return null;
  }

  values.push(jobId);

  const query = `
    UPDATE parsing_jobs
    SET ${updates.join(', ')}
    WHERE job_id = $${paramIndex}
    RETURNING *
  `;

  const result = await pool.query(query, values);
  return result.rows.length > 0 ? result.rows[0] : null;
}

/**
 * Получение статистики задания
 */
async function getJobStats(jobId) {
  const query = `
    SELECT 
      j.*,
      EXTRACT(EPOCH FROM (COALESCE(j.completed_at, NOW()) - j.started_at)) as duration_seconds,
      CASE 
        WHEN j.processed_messages > 0 THEN 
          ROUND((j.processed_messages::numeric / NULLIF(j.total_messages, 0) * 100), 2)
        ELSE 0
      END as progress_percentage
    FROM parsing_jobs j
    WHERE j.job_id = $1
  `;

  const result = await pool.query(query, [jobId]);
  return result.rows.length > 0 ? result.rows[0] : null;
}

/**
 * Список всех заданий для канала
 */
async function getChannelJobs(channelUsername, limit = 10) {
  const query = `
    SELECT 
      *,
      EXTRACT(EPOCH FROM (COALESCE(completed_at, NOW()) - started_at)) as duration_seconds,
      CASE 
        WHEN processed_messages > 0 THEN 
          ROUND((processed_messages::numeric / NULLIF(total_messages, 0) * 100), 2)
        ELSE 0
      END as progress_percentage
    FROM parsing_jobs
    WHERE channel_username = $1
    ORDER BY started_at DESC
    LIMIT $2
  `;

  const result = await pool.query(query, [channelUsername, limit]);
  return result.rows;
}

module.exports = {
  createParsingJob,
  getLatestJob,
  getPendingJob,
  updateJobProgress,
  getJobStats,
  getChannelJobs,
};
