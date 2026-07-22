/* =========================================================================
 *  calc.js — движок расчёта стоимости авто «под ключ» (Киндер: Корея + Европа)
 *
 *  Логика перенесена из Google-таблицы «Киндер Калькулятор» и сверена
 *  на контрольном примере (Корея, 2000 см³, 120 кВт, <3 лет):
 *    пошлина + сбор = 633 215 ₽, утиль 900 000 ₽, итого 3 019 703 ₽ — как в листе.
 *
 *  Ключевые принципы:
 *    – ТАМОЖЕННАЯ СТОИМОСТЬ считается по курсу ЦБ РФ (для пошлины/НДС).
 *    – РЕАЛЬНЫЙ ПЛАТЁЖ за авто считается по рыночному курсу:
 *        Корея — воны → USDT → ₽ (курсы KRW_USDT / USDT_RUB),
 *        Европа — € × курс «евро продажа» (EUR_SALE).
 *    – Утильсбор = базовая ставка × коэффициент из таблицы (объём+мощность+возраст).
 *
 *  Отличия от исходной таблицы (сознательные исправления):
 *    1. Лист «Европа» считал таможенную стоимость по курсу ЮАНЯ (остаток от
 *       китайского шаблона) и держал ставку 2.5 €/см³ / 54% / сбор 2 462 ₽
 *       захардкоженными. Здесь: таможенная стоимость по курсу ЦБ EUR,
 *       брекеты пошлины и сбора — полноценные формулы.
 *    2. Корея: в листе процентная пошлина бралась от базы С дилерскими
 *       расходами, а брекет выбирался по базе БЕЗ них. Здесь единая база:
 *       (цена + доставка + дилерские) × курс ЦБ KRW. На контрольном примере
 *       итог совпадает с листом.
 * ========================================================================= */

/* --- Вспомогательные конвертеры л.с. <-> кВт --- */
function hpToKw(hp) { return hp * 0.7355; }
function kwToHp(kw) { return kw / 0.7355; }

/* --- Поиск коэффициента утильсбора ---
 * Льготный коэффициент (0.17/0.26 → 3400/5200) применяется, если мощность ≤ порога
 * (160 л.с. для ДВС, 80 л.с. для электрокара). Выше порога — по таблице двс/эл. */
function findUtilCoef(cfg, isElectric, volumeCc, powerKw, powerHp, isOlderThan3) {
  const pref = cfg.utilPreferentialCoef || { new: 0.17, old: 0.26 };
  const thrHp = isElectric
    ? (cfg.utilPreferentialHp ? cfg.utilPreferentialHp.ev : 80)
    : (cfg.utilPreferentialHp ? cfg.utilPreferentialHp.ice : 160);

  // льготный утиль — мощность в пределах порога (включительно)
  if (powerHp <= thrHp) return isOlderThan3 ? pref.old : pref.new;

  // выше порога — детальная таблица коэффициентов.
  // ищем по НИЖНЕЙ границе мощности (устойчиво к округлению кВт и стыкам диапазонов)
  if (isElectric) {
    const cand = cfg.utilEv.filter(r => powerKw >= r.kMin);
    const row = cand.length ? cand[cand.length - 1] : cfg.utilEv[cfg.utilEv.length - 1];
    return isOlderThan3 ? row.cOld : row.cNew;
  }
  // объёмную группу выбираем по НИЖНЕЙ границе (наибольший vMin ≤ объёма) —
  // устойчиво к дробным объёмам в зазорах целочисленных полос (2000.5 и т.п.)
  let targetVMin = cfg.utilIce[0].vMin;
  cfg.utilIce.forEach(r => { if (volumeCc >= r.vMin && r.vMin >= targetVMin) targetVMin = r.vMin; });
  const band = cfg.utilIce.filter(r => r.vMin === targetVMin);
  const cand = band.filter(r => powerKw >= r.kMin);
  const row = (cand.length ? cand[cand.length - 1] : band[band.length - 1])
           || cfg.utilIce[cfg.utilIce.length - 1];
  return isOlderThan3 ? row.cOld : row.cNew;
}

/* --- Таможенный сбор за оформление (по таможенной стоимости в ₽) --- */
function findCustomsFee(cfg, customsValueRub) {
  const row = cfg.customsFee.find(r => customsValueRub <= r.valMaxRub);
  return row ? row.fee : cfg.customsFee[cfg.customsFee.length - 1].fee;
}

/* --- Расчёт пошлины (и сопутствующих платежей) ---
 * Возвращает { duty, excise, vat, customsFee, total, method } */
function calcDutyBlock(cfg, p) {
  const cbrEur = cfg.rates.cbr.EUR;
  const customsFee = findCustomsFee(cfg, p.customsValueRub);

  // --- Электрокар: пошлина 15% + акциз + НДС 22% (СТП, 2026) ---
  if (p.isElectric) {
    const duty   = cfg.evDutyPercent * p.customsValueRub;
    // акциз: НК РФ ст.193 — ставка за 0.75 кВт, база = мощность(кВт) / 0.75
    const exciseUnits = p.powerKw / 0.75;
    const exRow  = cfg.exciseEv.find(r => exciseUnits <= r.unitMax) || cfg.exciseEv[cfg.exciseEv.length - 1];
    const excise = exRow.rub * exciseUnits;
    const vat    = cfg.evVatPercent * (p.customsValueRub + duty + excise);
    return {
      duty, excise, vat, customsFee,
      total: duty + excise + vat + customsFee,
      method: `Электрокар: пошлина ${(cfg.evDutyPercent * 100).toFixed(0)}% + акциз + НДС ${(cfg.evVatPercent * 100).toFixed(0)}%`,
    };
  }

  // --- Менее 3 лет: max(% от стоимости, €/см³) ---
  if (p.age === '<3') {
    const b = cfg.dutyUnder3.find(r => p.customsValueEur <= r.valMaxEur)
           || cfg.dutyUnder3[cfg.dutyUnder3.length - 1];
    const byPercent = b.percent * p.customsValueRub;
    const byCc      = b.eurPerCc * p.volumeCc * cbrEur;
    const duty = Math.max(byPercent, byCc);
    return {
      duty, excise: 0, vat: 0, customsFee,
      total: duty + customsFee,
      method: byPercent >= byCc
        ? `${(b.percent * 100).toFixed(0)}% от стоимости`
        : `${b.eurPerCc} €/см³`,
    };
  }

  // --- Старше 3 лет: только ставка €/см³ по возрасту и объёму ---
  const tbl = cfg.dutyOver3[p.age] || cfg.dutyOver3['3-5'];
  const b = tbl.find(r => p.volumeCc <= r.ccMax) || tbl[tbl.length - 1];
  const duty = b.eurPerCc * p.volumeCc * cbrEur;
  return {
    duty, excise: 0, vat: 0, customsFee,
    total: duty + customsFee,
    method: `${b.eurPerCc} €/см³`,
  };
}

/* =========================================================================
 *  Главная функция расчёта
 *  input = {
 *    country: 'kr' | 'eu',
 *    isElectric: bool,
 *    age: '<3'|'3-5'|'5-7'|'>7'  (для EV: '<3'|'>3'),
 *    volumeCc, powerKw | powerHp,
 *    carPrice,          // Корея: цена у дилера (₩); Европа: цена авто (€)
 *    deliveryWon,       // Корея: доставка по Корее + фрахт (₩)
 *    dealerWon,         // Корея: дилерские расходы (₩)
 *    carCount,          // Европа: 1 | 2  (фрахт 5900 € за 1 авто / 5100 € при консолидации)
 *    commission,        // комиссия компании, ₽ (ручное поле)
 *    extraExpenses,     // доп. расходы, ₽ (ручное поле)
 *    expenses: [{key, label, short, value}],  // расходы по РФ, ₽
 *    logisticsCity,
 *  }
 *  cfg = { ...CALC_DATA, rates }  (с применёнными переопределениями)
 * ========================================================================= */
function calculate(input, cfg) {
  cfg = cfg || {};
  cfg = Object.assign({}, CALC_DATA, cfg);
  cfg.rates = cfg.rates || CALC_DATA.defaultRates;

  // --- мощность: нормализуем кВт/л.с. ---
  let powerKw = input.powerKw, powerHp = input.powerHp;
  if (powerKw == null && powerHp != null) powerKw = hpToKw(powerHp);
  if (powerHp == null && powerKw != null) powerHp = kwToHp(powerKw);
  powerKw = powerKw || 0; powerHp = powerHp || 0;

  const volumeCc = input.volumeCc || 0;
  const isOlderThan3 = input.age !== '<3';
  const carPrice = Number(input.carPrice) || 0;

  // --- страна: реальный платёж и таможенная стоимость ---
  let carCostRub, customsValueRub, customsValueEur;
  let koreanVatWon = 0, vatRefundWon = 0, payWon = 0, sumWon = 0;
  let freightEur = 0, foreignEur = 0;
  const carCount = Number(input.carCount) || 1;

  if (input.country === 'kr') {
    const deliveryWon = Number(input.deliveryWon) || 0;
    const dealerWon = Number(input.dealerWon) || 0;
    sumWon = carPrice + deliveryWon + dealerWon;
    // корейский НДС 9% и его частичный возврат (40%) при экспорте
    koreanVatWon = sumWon * cfg.korea.vatPercent;
    vatRefundWon = koreanVatWon * cfg.korea.vatRefundPercent;
    payWon = sumWon - vatRefundWon;
    // реальный платёж: воны → USDT → рубли
    carCostRub = payWon / cfg.rates.market.KRW_USDT * cfg.rates.market.USDT_RUB;
    // таможенная стоимость: ЕДИНАЯ база (цена + доставка + дилерские) × курс ЦБ ₩
    customsValueRub = sumWon * cfg.rates.cbr.KRW;
    customsValueEur = customsValueRub / cfg.rates.cbr.EUR;
  } else { // 'eu'
    freightEur = carCount === 1 ? cfg.europe.freightSingleEur : cfg.europe.freightGroupEur;
    foreignEur = carPrice + freightEur;
    // реальный платёж: € × курс «евро продажа»
    carCostRub = foreignEur * cfg.rates.market.EUR_SALE;
    // таможенная стоимость по курсу ЦБ EUR (фикс бага листа: там был курс юаня)
    customsValueRub = foreignEur * cfg.rates.cbr.EUR;
    customsValueEur = foreignEur;
  }

  // --- пошлина / акциз / НДС / сбор ---
  const duty = calcDutyBlock(cfg, {
    isElectric: !!input.isElectric,
    age: input.age,
    volumeCc, powerHp, powerKw,
    customsValueRub, customsValueEur,
  });

  // --- утильсбор ---
  const utilCoef = findUtilCoef(cfg, !!input.isElectric, volumeCc, powerKw, powerHp, isOlderThan3);
  const utilFee = cfg.utilBase * utilCoef;
  // порог льготного утиля + «сколько был бы льготный» — для предупреждения в UI («утиль-ловушка»)
  const _prefCoef = cfg.utilPreferentialCoef || { new: 0.17, old: 0.26 };
  const _prefHp = cfg.utilPreferentialHp || { ice: 160, ev: 80 };
  const utilThresholdHp = input.isElectric ? _prefHp.ev : _prefHp.ice;
  const utilPreferentialApplied = powerHp <= utilThresholdHp;
  const utilPreferentialFee = cfg.utilBase * (isOlderThan3 ? _prefCoef.old : _prefCoef.new);

  // --- расходы по РФ (логистику по РФ выносим отдельной строкой) ---
  const allExpenses = input.expenses || [];
  const logisticsItem = allExpenses.find(e => e && e.key === 'rf_logistics');
  const logistics = logisticsItem ? (Number(logisticsItem.value) || 0) : 0;
  const logisticsCity = (input.logisticsCity || '').trim();
  const expenses = allExpenses.filter(e => !(e && e.key === 'rf_logistics')); // услуги без логистики
  const expensesSum = expenses.reduce((s, e) => s + (Number(e.value) || 0), 0);

  // --- комиссия компании и доп. расходы — ручные поля ---
  const commission = Number(input.commission) || 0;
  const extraExpenses = Number(input.extraExpenses) || 0;

  // суммарные платежи государству (пошлина+акциз+НДС+сбор+утиль)
  const customsTotal = duty.total + utilFee;
  // все расходы по РФ (таможня + услуги + логистика)
  const rfExpenses = customsTotal + expensesSum + logistics;
  // итого «под ключ»
  const grandTotal = carCostRub + rfExpenses + commission + extraExpenses;

  return {
    input: { ...input, powerKw, powerHp, volumeCc },
    carCostRub,
    customsValueRub,
    customsValueEur,
    // Корея: детали для рендера
    sumWon,
    koreanVatWon,
    vatRefundWon,
    payWon,
    // Европа: детали для рендера
    freightEur,
    foreignEur,
    carCount,
    duty: duty.duty,
    dutyMethod: duty.method,
    excise: duty.excise,
    vat: duty.vat,
    customsFee: duty.customsFee,
    utilFee,
    utilCoef,
    utilThresholdHp,           // порог льготного утиля, л.с. (160 ДВС / 80 EV)
    utilPreferentialApplied,   // попал ли под льготу (мощность ≤ порога)
    utilPreferentialFee,       // сколько был бы утиль при льготе (для показа переплаты)
    customsTotal,        // всё, что уходит на таможне
    expenses,            // услуги по РФ без логистики
    expensesSum,
    logistics,           // логистика по РФ (вынесена отдельно)
    logisticsCity,       // город доставки по РФ
    commission,
    extraExpenses,
    rfExpenses,
    grandTotal,
    // этапы оплаты (как на листе «Корея»; без двойного учёта логистики)
    stages: [
      { label: 'Депозит (р/с)', short: 'Депозит', value: commission },
      { label: input.country === 'kr'
          ? 'Оплата за авто по Корее (инвойс)'
          : 'Оплата за авто + фрахт (инвойс)',
        short: 'Авто (инвойс)', value: carCostRub },
      { label: 'Пошлина / тамож. сбор / утиль (квитанция)', short: 'Пошлина/утиль',
        value: duty.duty + duty.customsFee + utilFee + duty.excise + duty.vat },
      { label: 'Остальные платежи и вывоз (физ. карта/счёт)'
          + (logisticsCity ? ' — ' + logisticsCity : ''),
        short: 'Остальное+вывоз', value: expensesSum + logistics },
      { label: 'Оплата в ТК (физ. карта)', short: 'Оплата в ТК', value: extraExpenses },
    ],
  };
}

// экспорт
if (typeof window !== 'undefined') {
  window.calculate = calculate;
  window.hpToKw = hpToKw;
  window.kwToHp = kwToHp;
}
if (typeof module !== 'undefined') module.exports = { calculate, hpToKw, kwToHp };
