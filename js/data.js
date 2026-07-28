/* =========================================================================
 *  data.js — справочные данные калькулятора Power Yard (Корея + Европа)
 *  Источник: Google-таблица заказчика (листы Корея / Европа /
 *  База / ДВС ЛП / ЭЛ ЛП). Все значения вынесены сюда, чтобы их можно было
 *  править в одном месте и переопределять через настройки (rates.js / app.js).
 * ========================================================================= */

const CALC_DATA = {

  brand: 'Power Yard',

  /* --- Курсы валют по умолчанию (правятся в настройках / тянутся с ЦБ) --- */
  defaultRates: {
    // ЦБ РФ — используются для расчёта таможенной стоимости (пошлина/НДС)
    cbr: {
      USD: 78.55,
      EUR: 89.76,
      KRW: 0.0530054, // за 1 вону (в таблице 53.0054 за 1000)
      CNY: 10.90,     // за 1 юань (таможенная стоимость Китая при цене в ¥)
    },
    // Рыночные курсы — по ним реально платим за авто
    market: {
      KRW_USDT: 1510, // вон за 1 USDT (Корея: оплата через USDT)
      USDT_RUB: 84,   // ₽ за 1 USDT
      EUR_SALE: 94.2, // ₽ за 1 € (продажа) — реальный платёж за авто из Европы
      USD_VTB: 82,    // ₽ за 1 $ (курс ВТБ) — оплата Китай / КГ
      CNY_VTB: 11.4,  // ₽ за 1 ¥ (курс ВТБ) — оплата Китай
    },
  },

  /* --- Базовая ставка утильсбора (₽). Коэффициент берётся из таблиц ниже --- */
  utilBase: 20000,

  /* --- Льготный утиль: применяется, если мощность не превышает порог (л.с.) --- */
  utilPreferentialHp: { ice: 160, ev: 80 },   // порог мощности, л.с. (включительно)
  utilPreferentialCoef: { new: 0.17, old: 0.26 }, // 3400 / 5200 при ставке 20000

  /* --- Коэффициенты утильсбора для ДВС (объём см³ × мощность кВт × возраст) ---
   * Полная таблица (лист «ДВС ЛП»). coefNew — авто до 3 лет, coefOld — старше 3.
   * util = utilBase × coef. Для обычных авто физлица это 0.17 / 0.26 (3400 / 5200 ₽). */
  utilIce: [
    { vMin:0,    vMax:1000,   kMin:0,      kMax:51.48,  cNew:0.17,  cOld:0.26 },
    { vMin:0,    vMax:1000,   kMin:51.49,  kMax:73.55,  cNew:0.17,  cOld:0.26 },
    { vMin:0,    vMax:1000,   kMin:73.56,  kMax:95.61,  cNew:0.17,  cOld:0.26 },
    { vMin:0,    vMax:1000,   kMin:95.62,  kMax:117.68, cNew:0.17,  cOld:0.26 },
    { vMin:0,    vMax:1000,   kMin:117.69, kMax:139.75, cNew:15.36, cOld:28.44 },
    { vMin:0,    vMax:1000,   kMin:139.76, kMax:161.81, cNew:15.84, cOld:29.28 },
    { vMin:0,    vMax:1000,   kMin:161.82, kMax:183.88, cNew:16.2,  cOld:30.12 },
    { vMin:0,    vMax:1000,   kMin:183.89, kMax:999999, cNew:17.28, cOld:30.12 },
    { vMin:1001, vMax:2000,   kMin:0,      kMax:117.68, cNew:0.17,  cOld:0.26 },
    { vMin:1001, vMax:2000,   kMin:117.69, kMax:139.75, cNew:45,    cOld:74.64 },
    { vMin:1001, vMax:2000,   kMin:139.76, kMax:161.81, cNew:47.64, cOld:79.2 },
    { vMin:1001, vMax:2000,   kMin:161.82, kMax:183.88, cNew:50.52, cOld:83.88 },
    { vMin:1001, vMax:2000,   kMin:183.89, kMax:205.94, cNew:57.12, cOld:91.92 },
    { vMin:1001, vMax:2000,   kMin:205.95, kMax:228,     cNew:64.56, cOld:100.56 },
    { vMin:1001, vMax:2000,   kMin:228.01, kMax:250.07, cNew:72.96, cOld:110.16 },
    { vMin:1001, vMax:2000,   kMin:250.08, kMax:272.13, cNew:83.16, cOld:120.6 },
    { vMin:1001, vMax:2000,   kMin:272.14, kMax:294.2,  cNew:94.8,  cOld:132 },
    { vMin:1001, vMax:2000,   kMin:294.21, kMax:316.26, cNew:108,   cOld:144.6 },
    { vMin:1001, vMax:2000,   kMin:316.27, kMax:338.33, cNew:123.24,cOld:158.4 },
    { vMin:1001, vMax:2000,   kMin:338.34, kMax:367.75, cNew:140.4, cOld:173.4 },
    { vMin:1001, vMax:2000,   kMin:367.76, kMax:999999, cNew:160.08,cOld:189.84 },
    { vMin:2001, vMax:3000,   kMin:0,      kMax:117.68, cNew:0.17,  cOld:0.26 },
    { vMin:2001, vMax:3000,   kMin:117.69, kMax:139.75, cNew:115.34,cOld:172.8 },
    { vMin:2001, vMax:3000,   kMin:139.76, kMax:161.81, cNew:118.2, cOld:175.08 },
    { vMin:2001, vMax:3000,   kMin:161.82, kMax:183.88, cNew:120.12,cOld:177.6 },
    { vMin:2001, vMax:3000,   kMin:183.89, kMax:205.94, cNew:126,   cOld:183 },
    { vMin:2001, vMax:3000,   kMin:205.95, kMax:228,     cNew:131.04,cOld:188.52 },
    { vMin:2001, vMax:3000,   kMin:228.01, kMax:250.07, cNew:136.32,cOld:193.68 },
    { vMin:2001, vMax:3000,   kMin:250.08, kMax:272.13, cNew:141.72,cOld:199.08 },
    { vMin:2001, vMax:3000,   kMin:272.14, kMax:294.2,  cNew:147.48,cOld:204.72 },
    { vMin:2001, vMax:3000,   kMin:294.21, kMax:316.26, cNew:153.36,cOld:210.48 },
    { vMin:2001, vMax:3000,   kMin:316.27, kMax:338.33, cNew:159.48,cOld:216.36 },
    { vMin:2001, vMax:3000,   kMin:338.34, kMax:367.75, cNew:165.84,cOld:222.36 },
    { vMin:2001, vMax:3000,   kMin:367.76, kMax:999999, cNew:172.44,cOld:228.6 },
    { vMin:3001, vMax:3500,   kMin:0,      kMax:117.68, cNew:129.2, cOld:197.81 },
    { vMin:3001, vMax:3500,   kMin:117.69, kMax:139.75, cNew:131.76,cOld:200.04 },
    { vMin:3001, vMax:3500,   kMin:139.76, kMax:161.81, cNew:134.4, cOld:202.2 },
    { vMin:3001, vMax:3500,   kMin:161.82, kMax:183.88, cNew:137.16,cOld:204.36 },
    { vMin:3001, vMax:3500,   kMin:183.89, kMax:205.94, cNew:140.52,cOld:207.24 },
    { vMin:3001, vMax:3500,   kMin:205.95, kMax:228,     cNew:144,   cOld:212.4 },
    { vMin:3001, vMax:3500,   kMin:228.01, kMax:250.07, cNew:151.92,cOld:217.8 },
    { vMin:3001, vMax:3500,   kMin:250.08, kMax:272.13, cNew:160.32,cOld:224.28 },
    { vMin:3001, vMax:3500,   kMin:272.14, kMax:294.2,  cNew:169.2, cOld:231.6 },
    { vMin:3001, vMax:3500,   kMin:294.21, kMax:316.26, cNew:178.44,cOld:237.96 },
    { vMin:3001, vMax:3500,   kMin:316.27, kMax:338.33, cNew:188.28,cOld:245.04 },
    { vMin:3001, vMax:3500,   kMin:338.34, kMax:367.75, cNew:198.6, cOld:252.48 },
    { vMin:3001, vMax:3500,   kMin:367.76, kMax:999999, cNew:209.52,cOld:260.04 },
    { vMin:3501, vMax:999999, kMin:0,      kMax:117.68, cNew:164.53,cOld:216.29 },
    { vMin:3501, vMax:999999, kMin:117.69, kMax:139.75, cNew:167.28,cOld:219.48 },
    { vMin:3501, vMax:999999, kMin:139.76, kMax:161.81, cNew:170.16,cOld:222.84 },
    { vMin:3501, vMax:999999, kMin:161.82, kMax:183.88, cNew:173.04,cOld:226.2 },
    { vMin:3501, vMax:999999, kMin:183.89, kMax:205.94, cNew:176.52,cOld:231.36 },
    { vMin:3501, vMax:999999, kMin:205.95, kMax:228,     cNew:180,   cOld:236.64 },
    { vMin:3501, vMax:999999, kMin:228.01, kMax:250.07, cNew:186.36,cOld:249.6 },
    { vMin:3501, vMax:999999, kMin:250.08, kMax:272.13, cNew:192.88,cOld:263.4 },
    { vMin:3501, vMax:999999, kMin:272.14, kMax:294.2,  cNew:199.68,cOld:277.92 },
    { vMin:3501, vMax:999999, kMin:294.21, kMax:316.26, cNew:206.64,cOld:293.16 },
    { vMin:3501, vMax:999999, kMin:316.27, kMax:338.33, cNew:213.84,cOld:309.36 },
    { vMin:3501, vMax:999999, kMin:338.34, kMax:367.75, cNew:221.28,cOld:326.4 },
    { vMin:3501, vMax:999999, kMin:367.76, kMax:999999, cNew:229.08,cOld:344.28 },
  ],

  /* --- Коэффициенты утильсбора для электрокаров (мощность кВт), ставки 2026 --- */
  utilEv: [
    { kMin:0,      kMax:58.84,  cNew:0.17,   cOld:0.26 },
    { kMin:58.85,  kMax:73.55,  cNew:49.56,  cOld:82.08 },
    { kMin:73.56,  kMax:95.61,  cNew:65.88,  cOld:95.64 },
    { kMin:95.62,  kMax:117.68, cNew:78,     cOld:111.36 },
    { kMin:117.69, kMax:139.75, cNew:92.4,   cOld:129.72 },
    { kMin:139.76, kMax:161.81, cNew:109.68, cOld:151.2 },
    { kMin:161.82, kMax:183.88, cNew:129.96, cOld:176.16 },
    { kMin:183.89, kMax:205.94, cNew:153.96, cOld:205.2 },
    { kMin:205.95, kMax:999999, cNew:182.4,  cOld:239.04 },
  ],

  /* --- Ставки пошлины для авто МЕНЕЕ 3 лет (физлицо, ЕТС) ---
   * Считается от таможенной стоимости в ЕВРО: max(percent×стоимость, eurPerCc×объём).
   * Границы valMaxEur — верхняя граница стоимости в евро для брекета. */
  dutyUnder3: [
    { valMaxEur:8500,    percent:0.54, eurPerCc:2.5 },
    { valMaxEur:16700,   percent:0.48, eurPerCc:3.5 },
    { valMaxEur:42300,   percent:0.48, eurPerCc:5.5 },
    { valMaxEur:84500,   percent:0.48, eurPerCc:7.5 },
    { valMaxEur:169000,  percent:0.48, eurPerCc:15 },
    { valMaxEur:Infinity,percent:0.48, eurPerCc:20 },
  ],

  /* --- Ставки пошлины €/см³ для авто СТАРШЕ 3 лет (по возрасту и объёму) --- */
  dutyOver3: {
    '3-5': [
      { ccMax:1000, eurPerCc:1.5 },
      { ccMax:1500, eurPerCc:1.7 },
      { ccMax:1800, eurPerCc:2.5 },
      { ccMax:2300, eurPerCc:2.7 },
      { ccMax:3000, eurPerCc:3.0 },
      { ccMax:Infinity, eurPerCc:3.6 },
    ],
    // 5–7 лет и старше 7 — ставки выше (одинаковые)
    '5-7': [
      { ccMax:1000, eurPerCc:3.0 },
      { ccMax:1500, eurPerCc:3.2 },
      { ccMax:1800, eurPerCc:3.5 },
      { ccMax:2300, eurPerCc:4.8 },
      { ccMax:3000, eurPerCc:5.0 },
      { ccMax:Infinity, eurPerCc:5.7 },
    ],
    '>7': [
      { ccMax:1000, eurPerCc:3.0 },
      { ccMax:1500, eurPerCc:3.2 },
      { ccMax:1800, eurPerCc:3.5 },
      { ccMax:2300, eurPerCc:4.8 },
      { ccMax:3000, eurPerCc:5.0 },
      { ccMax:Infinity, eurPerCc:5.7 },
    ],
  },

  /* --- Таможенный сбор за оформление (₽) по таможенной стоимости в ₽ ---
   * Ставки 2026: Пост. Правительства РФ № 1637 от 28.11.2024 (ред. № 1638 от 23.10.2025). */
  customsFee: [
    { valMaxRub:200000,    fee:1231 },
    { valMaxRub:450000,    fee:2462 },
    { valMaxRub:1200000,   fee:4924 },
    { valMaxRub:2700000,   fee:13541 },
    { valMaxRub:4200000,   fee:18465 },
    { valMaxRub:5500000,   fee:21344 },
    { valMaxRub:10000000,  fee:49240 },
    { valMaxRub:Infinity,  fee:73860 },
  ],

  /* --- Акциз для электрокаров, ₽ за 0.75 кВт (НК РФ ст.193, ставки 2026) ---
   * База — мощность в «единицах» = кВт / 0.75; границы полос в этих единицах (≈ л.с.). */
  exciseEv: [
    { unitMax:90,        rub:0 },
    { unitMax:150,       rub:64 },
    { unitMax:200,       rub:613 },
    { unitMax:300,       rub:1004 },
    { unitMax:400,       rub:1711 },
    { unitMax:500,       rub:1771 },
    { unitMax:Infinity,  rub:1829 },
  ],
  evDutyPercent: 0.15, // пошлина 15% от таможенной стоимости (электрокар)
  evVatPercent: 0.22,  // НДС 22% (2026)

  /* --- Возрастные категории (для UI) --- */
  ageOptions: [
    { id:'<3',  label:'Менее 3 лет' },
    { id:'3-5', label:'От 3 до 5 лет' },
    { id:'5-7', label:'От 5 до 7 лет' },
    { id:'>7',  label:'Старше 7 лет' },
  ],
  ageOptionsEv: [
    { id:'<3', label:'Электрокар до 3 лет' },
    { id:'>3', label:'Электрокар старше 3 лет' },
  ],

  /* --- Корея: параметры листа «Корея» --- */
  korea: {
    vatPercent: 0.09,        // корейский НДС 9% от (цена + доставка + дилерские)
    vatRefundPercent: 0.40,  // возврат 40% этого НДС при экспорте
    defaultDeliveryWon: 1300000, // «Доставка по Корее и ФРАХТ» (редактируется)
    defaultDealerWon: 440000,    // «Дилерские расходы» (редактируется)
  },

  /* --- Европа: фрахт по количеству авто в контейнере --- */
  europe: {
    freightSingleEur: 5900, // «1 авто»
    freightGroupEur: 5100,  // 2+ авто (консолидация)
  },

  /* --- Китай: дефолтные плечи логистики (в $), правятся на экране --- */
  china: {
    defaultLeg1Usd: 1000,   // Китай → Бишкек, $
    defaultLeg2Usd: 1800,   // Бишкек → СПб, $
  },

  /* --- Юрлицо (коммерческий импорт): пошлина 15% + акциз + НДС 22% + утиль + сбор.
   *     Таможенная стоимость = база × (курс ЦБ × (1 + cbrMarkup)). --- */
  jur: {
    dutyPercent: 0.15,   // ввозная пошлина 15% от таможенной стоимости
    cbrMarkup: 0.03,     // курс ЦБ + 3% для таможенной стоимости юрлица
    vatPercent: 0.22,    // НДС 22%
  },

  /* --- Финансирование (рассрочка): +2% в месяц от суммы «под ключ» --- */
  financing: { percentPerMonth: 0.02 },

  /* --- Дефолты ручной растаможки (через КГ / Белку) --- */
  manualDefaults: {
    kg:    { customs: 0, transit: 0 },   // $ (ТО + транзит) — Корея / Китай через КГ
    belka: { customs: 0, logistics: 0 }, // € (ТО + логистика) — Европа через Белку
  },

  /* --- Валюты оплаты по странам (для выпадающего списка) --- */
  currencyOptions: {
    kr: [ { id:'KRW', sym:'₩' }, { id:'USD', sym:'$' } ],
    eu: [ { id:'EUR', sym:'€' } ],
    cn: [ { id:'USD', sym:'$' }, { id:'CNY', sym:'¥' } ],
  },

  /* --- Схемы растаможки по странам (для выпадающего списка) --- */
  customsModeOptions: {
    kr: [ {id:'phys_rf',label:'Физлицо РФ'}, {id:'phys_kg',label:'Физлицо КГ'}, {id:'jur',label:'Юрлицо (НДС 22%)'} ],
    eu: [ {id:'phys_rf',label:'Физлицо РФ'}, {id:'jur',label:'Юрлицо (НДС 22%)'}, {id:'manual_belka',label:'Через Белку'} ],
    cn: [ {id:'phys_rf',label:'Физлицо РФ'}, {id:'phys_kg',label:'Физлицо КГ'}, {id:'jur',label:'Юрлицо (НДС 22%)'} ],
  },

  /* --- Пресеты расходов по РФ для каждой страны (₽), правятся на экране --- */
  expensePresets: {
    kr: {
      label: 'Корея 🇰🇷',
      currency: 'KRW',
      items: [
        { key:'broker',       label:'Брокерские услуги (СВХ / СБКТС / ЭПТС / ИЛ)', short:'Брокер/СБКТС/ЭПТС', value:120000 },
        { key:'rf_logistics', label:'Логистика Владивосток → СПб', short:'Логистика РФ', value:265000 },
      ],
    },
    eu: {
      label: 'Европа 🇪🇺',
      currency: 'EUR',
      items: [
        { key:'broker',       label:'Брокерские услуги', short:'Брокер', value:95000 },
        { key:'forwarding',   label:'Экспедирование + растарка', short:'Экспед.+растарка', value:135000 },
        { key:'export',       label:'Вывоз с таможни', short:'Вывоз с таможни', value:15000 },
        { key:'rf_logistics', label:'Логистика по РФ', short:'Логистика РФ', value:0 },
      ],
    },
    cn: {
      label: 'Китай 🇨🇳',
      currency: 'USD',
      items: [
        { key:'broker',       label:'Брокер / оформление / СБКТС / ЭПТС', short:'Брокер/СБКТС', value:100000 },
        { key:'rf_logistics', label:'Логистика по РФ', short:'Логистика РФ', value:0 },
      ],
    },
  },
  // Комиссия компании — ручное поле на главном экране (тарифной сетки нет)
};

// Доступ из других файлов (браузер + возможный импорт в боте)
if (typeof window !== 'undefined') window.CALC_DATA = CALC_DATA;
if (typeof module !== 'undefined') module.exports = CALC_DATA;
