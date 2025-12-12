const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

async function savePost(postData) {
  const query = `
    INSERT INTO posts (channel_username, message_id, text, date, views, is_ad, job_id)
    VALUES ($1, $2, $3, $4, $5, $6, $7)
    ON CONFLICT (message_id) DO UPDATE 
    SET views = EXCLUDED.views
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
    console.error('Error saving post:', error);
    throw error;
  }
}

async function saveMedia(mediaData) {
  const query = `
    INSERT INTO media_files (post_id, media_type, file_url, file_size)
    VALUES ($1, $2, $3, $4)
    RETURNING id
  `;
  
  try {
    const result = await pool.query(query, [
      mediaData.post_id,
      mediaData.media_type,
      mediaData.file_url,
      mediaData.file_size
    ]);
    return result.rows[0].id;
  } catch (error) {
    console.error('Error saving media:', error);
    throw error;
  }
}

module.exports = { savePost, saveMedia };
