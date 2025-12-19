// Детекция рекламы
function detectAdvertising(text) {
  if (!text) return false;

  // const adKeywords = [
  //   'реклама',
  //   'рекламный',
  //   'рекомендуем',
  //   'рекомендую',
  //   'порекомендовать',
  //   'рады представить',
  //   // 'подписывайся',
  //   'поделиться',
  //   'спонсор',
  //   'sponsor',
  //   'рекламный пост',
  //   '#ad',
  //   '#ads',
  //   '#промо',
  //   '#promo',
  //   'партнерский',
  //   'partnership',
  //   'sponsored',
  //   'при поддержке',
  //   'сотрудничество',
  //   'коммерческий',
  //   'на правах рекламы',
  // ];

  // Целевые фразы, наличие которых указывает на отсутствие рекламы
  const targetedPhrases = [
    'координаты',
    'место на карте',
  ]

  const lowerText = text.toLowerCase();
  // return adKeywords.some((keyword) => lowerText.includes(keyword));

  // Реклама отсутствует, если есть хотя бы одна из целевых фраз
  return !targetedPhrases.some((phrase) => lowerText.includes(phrase));
}
module.exports = { detectAdvertising };
