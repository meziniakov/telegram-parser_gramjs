const { TelegramClient } = require('telegram');
const { StringSession } = require('telegram/sessions');

let clientInstance = null;

// Функция для инициализации клиента
async function initTelegramClient() {
  if (clientInstance) {
    return clientInstance;
  }

  const session = new StringSession(process.env.TELEGRAM_SESSION || '');

  clientInstance = new TelegramClient(
    session,
    parseInt(process.env.TELEGRAM_API_ID),
    process.env.TELEGRAM_API_HASH,
    {
      connectionRetries: 5,
      floodSleepThreshold: 300,
      useWSS: false,
      autoReconnect: true,
    }
  );

  console.log('Connecting to Telegram...');
  await clientInstance.connect();

  // Проверяем авторизацию
  if (!(await clientInstance.isUserAuthorized())) {
    console.error('Client is not authorized. Please login first.');
    throw new Error('Not authorized');
  }

  console.log('Successfully connected to Telegram');
  return clientInstance;
}

// Функция для получения существующего клиента
function getTelegramClient() {
  if (!clientInstance) {
    throw new Error('Telegram client not initialized. Call initTelegramClient() first.');
  }
  return clientInstance;
}

// Функция для отключения клиента
async function disconnectTelegramClient() {
  if (clientInstance) {
    await clientInstance.disconnect();
    clientInstance = null;
    console.log('Telegram client disconnected');
  }
}

module.exports = {
  initTelegramClient,
  getTelegramClient,
  disconnectTelegramClient,
};
