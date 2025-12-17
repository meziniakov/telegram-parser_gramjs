const { TelegramClient } = require('telegram');
const { StringSession } = require('telegram/sessions');
const input = require('input');

const apiId = parseInt(process.env.TELEGRAM_API_ID);
const apiHash = process.env.TELEGRAM_API_HASH;

(async () => {
  const client = new TelegramClient(new StringSession(''), apiId, apiHash, {
    connectionRetries: 5,
  });

  await client.start({
    phoneNumber: async () => await input.text('Номер телефона: '),
    password: async () => await input.text('Пароль 2FA (если есть): '),
    phoneCode: async () => await input.text('Код из Telegram: '),
    onError: (err) => console.log(err),
  });

  console.log('Session String:');
  console.log(client.session.save());
})();
