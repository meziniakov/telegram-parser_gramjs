const converter = {
  а: 'a',
  б: 'b',
  в: 'v',
  г: 'g',
  д: 'd',
  е: 'e',
  ё: 'e',
  ж: 'zh',
  з: 'z',
  и: 'i',
  й: 'y',
  к: 'k',
  л: 'l',
  м: 'm',
  н: 'n',
  о: 'o',
  п: 'p',
  р: 'r',
  с: 's',
  т: 't',
  у: 'u',
  ф: 'f',
  х: 'h',
  ц: 'c',
  ч: 'ch',
  ш: 'sh',
  щ: 'sch',
  ь: '',
  ы: 'y',
  ъ: '',
  э: 'e',
  ю: 'yu',
  я: 'ya',
};

function translit(word) {
  word = word.toLowerCase();

  let answer = '';
  for (let i = 0; i < word.length; ++i) {
    if (converter[word[i]] == undefined) {
      answer += word[i];
    } else {
      answer += converter[word[i]];
    }
  }

  answer = answer.replace(/[^-0-9a-z]/g, '-');
  answer = answer.replace(/[-]+/g, '-');
  answer = answer.replace(/^\-|-$/g, '');
  return answer;
}

// Построим обратную мапу: транслит -> буква
const reversed = Object.entries(converter).reduce((acc, [rus, lat]) => {
  if (lat && !acc[lat]) {
    acc[lat] = rus;
  }
  return acc;
}, {});

// Сортируем по убыванию длины транслит-ключа, чтобы обрабатывать сначала длинные: "sch", потом "sh", потом "s"
const sortedKeys = Object.keys(reversed).sort((a, b) => b.length - a.length);

/**
 * Обратный транслит
 */
function reverseTranslit(input) {
  let output = '';
  let i = 0;

  while (i < input.length) {
    let matched = false;

    for (const key of sortedKeys) {
      if (input.startsWith(key, i)) {
        output += reversed[key];
        i += key.length;
        matched = true;
        break;
      }
    }

    if (!matched) {
      output += input[i]; // если символ не найден — просто добавляем
      i++;
    }
  }

  return output;
}

module.exports = { translit, reverseTranslit };
