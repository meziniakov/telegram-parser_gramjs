const express = require('express');
const { parseChannelResumable } = require('./parser');
const {
  createParsingJob,
  getPendingJob,
  getJobStats,
  getChannelJobs,
  updateJobProgress,
} = require('../jobManager');
const { pool } = require('./database');

const app = express();
app.use(express.json());

// Middleware для логирования
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} ${req.method} ${req.path}`);
  next();
});

// Middleware для проверки API ключа
const authenticateApiKey = (req, res, next) => {
  const apiKey = req.headers['x-api-key'];

  if (!apiKey || apiKey !== process.env.API_KEY) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  next();
};

// Применить ко всем маршрутам
app.use('/api', authenticateApiKey);

/**
 * POST /api/parse/start
 * Запуск парсинга канала
 */
app.post('/api/parse/start', async (req, res) => {
  try {
    const {
      channel,
      limit = 100,
      batchSize = 50,
      downloadMedia = false,
      offsetId = 0,
      proxy = null,
      resume = false,
      sinceMessageId = 0,
    } = req.body;

    if (!channel) {
      return res.status(400).json({ error: 'Channel is required' });
    }

    let job;
    let startFromMessageId = null;

    // Проверяем существующее задание
    if (resume) {
      job = await getPendingJob(channel);

      if (job) {
        startFromMessageId = job.next_offset_id;
        console.log(`Resuming job ${job.job_id} from message ${startFromMessageId}`);
      } else {
        job = await createParsingJob(channel, {
          batchSize,
          downloadMedia,
          startFromId: offsetId,
          metadata: { proxy },
        });
      }
    } else {
      job = await createParsingJob(channel, {
        batchSize,
        downloadMedia,
        startFromId: offsetId || sinceMessageId,
        metadata: { proxy },
      });
    }

    // Запускаем парсинг асинхронно
    parseChannelResumable(channel, {
      limit,
      offset: startFromMessageId || offsetId,
      downloadMedia,
      fetchDirectUrls: true,
      jobId: job.job_id,
      batchSize,
      startFromMessageId,
      proxy,
      sinceMessageId,
    }).catch((error) => {
      console.error(`Job ${job.job_id} failed:`, error.message);
      updateJobProgress(job.job_id, {
        status: 'failed',
        lastError: error.message,
      });
    });

    res.json({
      success: true,
      job_id: job.job_id,
      message: 'Parsing started',
      status: 'running',
    });
  } catch (error) {
    console.error('Start parsing error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/parse/pause
 * Приостановка парсинга
 */
app.post('/api/parse/pause', async (req, res) => {
  try {
    const { job_id } = req.body;

    if (!job_id) {
      return res.status(400).json({ error: 'job_id is required' });
    }

    const updated = await updateJobProgress(job_id, {
      status: 'paused',
    });

    if (!updated) {
      return res.status(404).json({ error: 'Job not found' });
    }

    res.json({
      success: true,
      message: 'Job paused',
      job_id,
    });
  } catch (error) {
    console.error('Pause error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/parse/status/:job_id
 * Получение статуса задания
 */
app.get('/api/parse/status/:job_id', async (req, res) => {
  try {
    const { job_id } = req.params;

    const stats = await getJobStats(job_id);

    if (!stats) {
      return res.status(404).json({ error: 'Job not found' });
    }

    res.json({
      success: true,
      job: {
        job_id: stats.job_id,
        channel: stats.channel_username,
        status: stats.status,
        progress: {
          processed: stats.processed_messages,
          total: stats.total_messages,
          percentage: stats.progress_percentage,
        },
        next_offset: stats.next_offset_id,
        errors: stats.error_count,
        last_error: stats.last_error,
        duration_seconds: Math.round(stats.duration_seconds),
        started_at: stats.started_at,
        completed_at: stats.completed_at,
      },
    });
  } catch (error) {
    console.error('Status error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/parse/jobs/:channel
 * Получение всех заданий для канала
 */
app.get('/api/parse/jobs/:channel', async (req, res) => {
  try {
    const { channel } = req.params;
    const limit = parseInt(req.query.limit) || 20;

    const jobs = await getChannelJobs(channel, limit);

    res.json({
      success: true,
      channel,
      count: jobs.length,
      jobs: jobs.map((j) => ({
        job_id: j.job_id,
        status: j.status,
        progress: {
          processed: j.processed_messages,
          total: j.total_messages,
          percentage: j.progress_percentage,
        },
        errors: j.error_count,
        duration_seconds: Math.round(j.duration_seconds),
        started_at: j.started_at,
      })),
    });
  } catch (error) {
    console.error('Jobs list error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/stats/channel/:channel
 * Статистика по каналу из БД
 */
app.get('/api/stats/channel/:channel', async (req, res) => {
  try {
    const { channel } = req.params;

    const query = `
      SELECT 
        COUNT(DISTINCT p.id) as total_posts,
        COUNT(DISTINCT m.id) as total_media,
        COUNT(DISTINCT CASE WHEN p.is_ad THEN p.id END) as ad_posts,
        MIN(p.date) as first_post_date,
        MAX(p.date) as last_post_date,
        MIN(p.external_id) as first_external_id,
        MAX(p.external_id) as last_external_id,
        SUM(p.views) as total_views
      FROM posts p
      LEFT JOIN media m ON m.post_id = p.id
      WHERE p.channel_username = $1
    `;

    const result = await pool.query(query, [channel]);
    const stats = result.rows[0];

    res.json({
      success: true,
      channel,
      stats: {
        total_posts: parseInt(stats.total_posts),
        total_media: parseInt(stats.total_media),
        ad_posts: parseInt(stats.ad_posts),
        total_views: parseInt(stats.total_views),
        first_post_date: stats.first_post_date,
        last_post_date: stats.last_post_date,
        first_external_id: parseInt(stats.first_external_id),
        last_external_id: parseInt(stats.last_external_id),
      },
    });
  } catch (error) {
    console.error('Channel stats error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/health
 * Проверка работоспособности API
 */
app.get('/api/health', async (req, res) => {
  try {
    // Проверка БД
    await pool.query('SELECT 1');

    res.json({
      success: true,
      status: 'healthy',
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      status: 'unhealthy',
      error: error.message,
    });
  }
});

// Запуск сервера
const PORT = process.env.PORT || 3000;

const server = app.listen(PORT, () => {
  console.log(`\n🚀 API Server running on http://localhost:${PORT}`);
  console.log(`\nAvailable endpoints:`);
  console.log(`  POST   /api/parse/start       - Start parsing`);
  console.log(`  POST   /api/parse/pause       - Pause job`);
  console.log(`  GET    /api/parse/status/:id  - Get job status`);
  console.log(`  GET    /api/parse/jobs/:ch    - Get channel jobs`);
  console.log(`  GET    /api/stats/channel/:ch - Get channel stats`);
  console.log(`  GET    /api/health            - Health check\n`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received, closing server...');
  server.close(() => {
    pool.end();
    console.log('Server closed');
    process.exit(0);
  });
});

module.exports = app;
