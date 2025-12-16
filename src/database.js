require('dotenv').config();

const { Pool } = require('pg');

const pool = new Pool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  ssl: false,
  max: 20,
   idleTimeoutMillis: 60000,           // Увеличено до 60 сек
  connectionTimeoutMillis: 30000,     // Увеличено до 30 сек
  statement_timeout: 30000,           // Таймаут запроса 30 сек
  query_timeout: 30000,               // Таймаут запроса 30 сек
});

async function savePost(postData) {
  const query = `
    INSERT INTO posts (channel_username, message_id, text, date, views, is_ad, job_id)
    VALUES ($1, $2, $3, $4, $5, $6, $7)
    ON CONFLICT (message_id) DO UPDATE 
    SET views = EXCLUDED.views, text = EXCLUDED.text
    RETURNING id
  `;
  
  try {
    const result = await pool.query(query, [
      postData.channel_username,
      postData.message_id,
      postData.text,
      postData.date,
      postData.views,
      postData.is_ad,
      postData.job_id
    ]);
    return result.rows[0].id;
  } catch (error) {
    console.error('Error saving post:', error.message);
    throw error;
  }
}

async function saveMediaMetadata(mediaData, retries = 3) {
  // Конвертируем file_id в строку
  const fileId = mediaData.file_id ? String(mediaData.file_id) : null;
  
  const query = `
    INSERT INTO media_files (
      post_id, media_type, file_id, file_url, direct_url, file_size, 
      mime_type, width, height, duration, thumbnail_url
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
    ON CONFLICT (post_id, file_id) 
    DO UPDATE SET 
      file_url = EXCLUDED.file_url,
      direct_url = EXCLUDED.direct_url,
      thumbnail_url = EXCLUDED.thumbnail_url
    RETURNING id
  `;
  
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const result = await pool.query(query, [
        mediaData.post_id,
        mediaData.media_type || 'unknown',
        fileId,  // Используем строковый file_id
        mediaData.file_url,
        mediaData.direct_url,
        mediaData.file_size,
        mediaData.mime_type,
        mediaData.width,
        mediaData.height,
        mediaData.duration,
        mediaData.thumbnail_url
      ]);
      
      return result.rows.length > 0 ? result.rows[0].id : null;
      
    } catch (error) {
      console.error(`Error saving media (attempt ${attempt}/${retries}):`, error.message);
      
      // Если это проблема с constraint - не повторяем
      if (error.message.includes('constraint')) {
        console.warn(`Skipping media for post ${mediaData.post_id} - constraint issue`);
        return null;
      }
      
      if (
        error.message.includes('timeout') || 
        error.message.includes('Connection terminated') ||
        error.code === 'ECONNRESET' ||
        error.code === 'ETIMEDOUT'
      ) {
        if (attempt < retries) {
          console.log(`Retrying in 2 seconds...`);
          await new Promise(resolve => setTimeout(resolve, 2000));
          continue;
        }
      }
      
      // Не бросаем ошибку, просто возвращаем null
      console.warn(`Failed to save media metadata: ${error.message}`);
      return null;
    }
  }
}

// ВАЖНО: Экспортируйте ВСЕ функции
module.exports = { 
  pool, 
  savePost, 
  saveMediaMetadata 
};
