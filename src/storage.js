const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
);

async function uploadToStorage(buffer, path, mediaType) {
  try {
    const fileName = `${path}_${Date.now()}.${mediaType === 'photo' ? 'jpg' : 'mp4'}`;
    const bucketName = 'telegram-media';

    const { data, error } = await supabase.storage
      .from(bucketName)
      .upload(fileName, buffer, {
        contentType: mediaType === 'photo' ? 'image/jpeg' : 'video/mp4',
        upsert: false
      });

    if (error) {
      console.error('Supabase upload error:', error);
      throw error;
    }

    // Получаем публичный URL
    const { data: urlData } = supabase.storage
      .from(bucketName)
      .getPublicUrl(fileName);

    return urlData.publicUrl;
  } catch (error) {
    console.error('Error uploading to storage:', error);
    throw error;
  }
}

module.exports = { uploadToStorage };
