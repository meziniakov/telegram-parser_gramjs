const { S3Client } = require('@aws-sdk/client-s3');

let s3ClientInstance = null;
// Трекинг активных загрузок для graceful shutdown
let activeUploads = 0;

// Функция для инициализации S3 клиента
function initS3Client() {
  if (s3ClientInstance) {
    return s3ClientInstance;
  }

  // Проверяем наличие необходимых переменных окружения
  if (!process.env.S3_ACCESS_KEY || !process.env.S3_SECRET_KEY) {
    throw new Error('S3 credentials not found in environment variables');
  }

  s3ClientInstance = new S3Client({
    endpoint: process.env.S3_ENDPOINT,
    region: process.env.S3_REGION,
    credentials: {
      accessKeyId: `${process.env.TENANT_ID}:${process.env.KEY_ID}`,
      secretAccessKey: process.env.KEY_SECRET,
    },
    forcePathStyle: true, // Для S3-совместимых хранилищ
    maxAttempts: 3, // Количество повторных попыток при ошибках
    requestHandler: {
      // Настройки connection pool
      connectionTimeout: 30000, // 30 секунд
      socketTimeout: 30000,
    },
  });

  console.log('S3 client initialized');
  return s3ClientInstance;
}

// Функция для получения существующего клиента
function getS3Client() {
  if (!s3ClientInstance) {
    return initS3Client();
  }
  return s3ClientInstance;
}

// Функция для "очистки" S3 клиента
async function cleanupS3Client() {
  if (s3ClientInstance) {
    // AWS SDK v3 автоматически управляет connection pool
    // Но мы можем вызвать destroy() для немедленного закрытия соединений
    try {
      s3ClientInstance.destroy();
      console.log('S3 client destroyed');
    } catch (error) {
      console.error('Error destroying S3 client:', error.message);
    } finally {
      s3ClientInstance = null;
    }
  }
}

// Ожидание завершения всех активных загрузок
async function waitForActiveUploads(timeoutMs = 30000) {
  if (activeUploads === 0) return true;

  console.log(`Waiting for ${activeUploads} active uploads to complete...`);

  const startTime = Date.now();
  while (activeUploads > 0) {
    if (Date.now() - startTime > timeoutMs) {
      console.warn(`Timeout waiting for uploads. ${activeUploads} uploads still active.`);
      return false;
    }
    await new Promise(resolve => setTimeout(resolve, 500));
  }

  console.log('All uploads completed');
  return true;
}

// Получение конфигурации bucket
function getS3Config() {
  return {
    bucket: process.env.S3_BUCKET,
    endpoint: process.env.S3_ENDPOINT,
    region: process.env.S3_REGION,
  };
}

module.exports = {
  initS3Client,
  getS3Client,
  cleanupS3Client,
  getS3Config,
  waitForActiveUploads
};
