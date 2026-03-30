require('dotenv').config();
const { S3Client, HeadBucketCommand, PutObjectCommand } = require('@aws-sdk/client-s3');

// Цвета для вывода
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
};

function log(style, message) {
  console.log(`${colors[style] || ''}${message}${colors.reset}`);
}

async function testS3Connection() {
  log('cyan', '\n=== S3 Connection Test ===\n');

  // Проверка переменных окружения
  log('blue', '1. Checking environment variables...');
  const requiredVars = [
    'S3_ENDPOINT',
    'S3_REGION',
    'S3_BUCKET',
    'TENANT_ID',
    'KEY_ID',
    'KEY_SECRET',
  ];

  const missingVars = requiredVars.filter((v) => !process.env[v]);

  if (missingVars.length > 0) {
    log('red', `   ✗ Missing environment variables: ${missingVars.join(', ')}`);
    return false;
  }

  log('green', '   ✓ All required environment variables found');

  // Вывод конфигурации (скрыто чувствительные данные)
  log('blue', '\n2. Configuration:');
  console.log(`   Endpoint: ${process.env.S3_ENDPOINT}`);
  console.log(`   Region: ${process.env.S3_REGION}`);
  console.log(`   Bucket: ${process.env.S3_BUCKET}`);
  console.log(`   Tenant ID: ${process.env.TENANT_ID}`);
  console.log(`   Key ID: ${process.env.KEY_ID}`);
  console.log(
    `   Key Secret: ${'*'.repeat(Math.max(1, process.env.KEY_SECRET?.length - 4))}${process.env.KEY_SECRET?.slice(-4) || 'NOT SET'}`
  );

  // Инициализация S3 клиента
  log('blue', '\n3. Initializing S3 client...');
  let s3Client;
  try {
    s3Client = new S3Client({
      endpoint: process.env.S3_ENDPOINT,
      region: process.env.S3_REGION,
      credentials: {
        accessKeyId: `${process.env.TENANT_ID}:${process.env.KEY_ID}`,
        secretAccessKey: process.env.KEY_SECRET,
      },
      forcePathStyle: true,
      maxAttempts: 3,
      requestHandler: {
        connectionTimeout: 30000,
        socketTimeout: 30000,
      },
    });
    log('green', '   ✓ S3 client created successfully');
  } catch (error) {
    log('red', `   ✗ Failed to create S3 client: ${error.message}`);
    return false;
  }

  // Проверка доступа к bucket
  log('blue', '\n4. Checking access to bucket...');
  try {
    const command = new HeadBucketCommand({ Bucket: process.env.S3_BUCKET });
    await s3Client.send(command);
    log('green', `   ✓ Successfully accessed bucket: ${process.env.S3_BUCKET}`);
  } catch (error) {
    log('red', `   ✗ Failed to access bucket: ${error.message}`);
    s3Client.destroy();
    return false;
  }

  // Тест загрузки файла
  log('blue', '\n5. Testing file upload...');
  try {
    const testFileName = `connection-test-${Date.now()}.txt`;
    const testContent = `Test upload at ${new Date().toISOString()}\nEndpoint: ${process.env.S3_ENDPOINT}\n`;

    const uploadCommand = new PutObjectCommand({
      Bucket: process.env.S3_BUCKET,
      Key: testFileName,
      Body: Buffer.from(testContent),
      ContentType: 'text/plain',
    });

    const response = await s3Client.send(uploadCommand);
    log('green', `   ✓ Successfully uploaded test file: ${testFileName}`);
    console.log(`   ETag: ${response.ETag}`);
  } catch (error) {
    log('red', `   ✗ Failed to upload test file: ${error.message}`);
    s3Client.destroy();
    return false;
  }

  // Завершение
  s3Client.destroy();
  log('green', '\n✓ All tests passed! S3 connection is working correctly.\n');
  return true;
}

// Запуск теста
testS3Connection()
  .then((success) => {
    process.exit(success ? 0 : 1);
  })
  .catch((error) => {
    log('red', `\nUnexpected error: ${error.message}`);
    console.error(error);
    process.exit(1);
  });
