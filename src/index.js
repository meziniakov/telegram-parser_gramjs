const express = require('express');
const { parseChannel } = require('./parser');
const { Pool } = require('pg');

const app = express();
app.use(express.json());

// Создаем pool для проверки подключения
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

// Базовый healthcheck
app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'telegram-parser' });
});

// Проверка подключения к БД
app.get('/health/db', async (req, res) => {
  try {
    const client = await pool.connect();
    
    // Простой запрос для проверки
    const result = await client.query('SELECT NOW() as current_time, version() as pg_version');
    
    client.release();
    
    res.json({
      status: 'ok',
      database: 'connected',
      timestamp: result.rows[0].current_time,
      postgresql_version: result.rows[0].pg_version,
      pool_info: {
        total_connections: pool.totalCount,
        idle_connections: pool.idleCount,
        waiting_requests: pool.waitingCount
      }
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      database: 'disconnected',
      error: error.message,
      details: {
        code: error.code,
        host: error.hostname || 'unknown'
      }
    });
  }
});

// Проверка существования таблиц
app.get('/health/tables', async (req, res) => {
  try {
    const client = await pool.connect();
    
    // Проверяем наличие нужных таблиц
    const tablesQuery = `
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND table_name IN ('posts', 'media_files')
    `;
    
    const result = await client.query(tablesQuery);
    client.release();
    
    const existingTables = result.rows.map(row => row.table_name);
    const requiredTables = ['posts', 'media_files'];
    const missingTables = requiredTables.filter(t => !existingTables.includes(t));
    
    res.json({
      status: missingTables.length === 0 ? 'ok' : 'warning',
      existing_tables: existingTables,
      missing_tables: missingTables,
      message: missingTables.length === 0 
        ? 'All required tables exist' 
        : 'Some tables are missing'
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      error: error.message
    });
  }
});

app.post('/api/parse', async (req, res) => {
  try {
    const { 
      channel_username, 
      limit = 50, 
      offset = 0,
      download_media = true 
    } = req.body;

    // Валидация
    if (!channel_username) {
      return res.status(400).json({ 
        status: 'error',
        error: 'channel_username required' 
      });
    }

    // Генерируем job_id
    const jobId = Date.now().toString();
    
    // Отвечаем сразу
    res.json({ 
      status: 'processing', 
      job_id: jobId,
      channel: channel_username,
      message: 'Parsing started'
    });

    // Запускаем парсинг асинхронно
    parseChannel(channel_username, limit, offset, download_media, jobId)
      .then(result => {
        console.log(`✓ Parsing completed for ${channel_username}:`, result);
      })
      .catch(err => {
        console.error(`✗ Parsing failed for ${channel_username}:`, err.message);
      });

  } catch (error) {
    res.status(500).json({ 
      status: 'error',
      error: error.message 
    });
  }
});

// Endpoint для проверки статуса парсинга
app.get('/api/status/:job_id', async (req, res) => {
  const { job_id } = req.params;
  
  try {
    const client = await pool.connect();
    
    // Подсчитываем посты по job_id
    const result = await client.query(
      'SELECT COUNT(*) as count FROM posts WHERE job_id = $1',
      [job_id]
    );
    
    client.release();
    
    const count = parseInt(result.rows[0].count);
    
    res.json({ 
      job_id,
      status: count > 0 ? 'completed' : 'processing',
      posts_parsed: count
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      error: error.message
    });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Parser service running on port ${PORT}`);
});
