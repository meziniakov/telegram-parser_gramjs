const { TelegramClient } = require('telegram');
const { StringSession } = require('telegram/sessions');

let clientInstance = null;
let currentProxyConfig = null;

// Парсим строку прокси в формат GramJS
function parseProxyString(proxyStr) {
  if (!proxyStr) return undefined;

  try {
    const url = new URL(proxyStr);
    const socksType = url.protocol === 'socks4:' ? 4 : 5;

    const config = {
      ip: url.hostname,
      port: parseInt(url.port),
      socksType,
    };

    // socks5 с авторизацией
    if (socksType === 5 && url.username) {
      config.username = decodeURIComponent(url.username);
      config.password = decodeURIComponent(url.password);
    }

    console.log(`[Proxy] Parsed config:`, JSON.stringify(config));
    return config;
  } catch (e) {
    console.error(`[Proxy] Failed to parse proxy string: ${proxyStr}`, e.message);
    return undefined;
  }
}

// Функция для инициализации клиента
async function initTelegramClient(options = {}) {
  if (clientInstance) {
    return clientInstance;
  }

  const session = new StringSession(process.env.TELEGRAM_SESSION || '');

  const proxyConfig = options.proxy ? parseProxyString(options.proxy) : undefined;
  currentProxyConfig = proxyConfig; // Сохраняем конфиг для последующих операций

  clientInstance = new TelegramClient(
    session,
    parseInt(process.env.TELEGRAM_API_ID),
    process.env.TELEGRAM_API_HASH,
    {
      connectionRetries: 5,
      floodSleepThreshold: 300,
      useWSS: false,
      autoReconnect: true,
      requestRetries: 3,
      retryDelay: 2000, // 2 сек между попытками
      ...(proxyConfig ? { proxy: proxyConfig } : {}),
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
function getTelegramClient(options = {}) {
  if (!clientInstance) {
    throw new Error('Telegram client not initialized. Call initTelegramClient() first.');
  }

  // Если нужен другой прокси, пересоздаём клиент
  if (options.proxy) {
    const requestedProxyConfig = parseProxyString(options.proxy);
    if (JSON.stringify(requestedProxyConfig) !== JSON.stringify(currentProxyConfig)) {
      console.warn('[Proxy] Proxy mismatch. Reconnecting with new proxy...');
      return clientInstance; // Пока возвращаем текущий, в будущем можно пересоздать
    }
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
