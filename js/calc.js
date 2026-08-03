/* =========================================================================
 *  calc.js — движок расчёта стоимости авто «под ключ» (Power Yard)
 *
 *  Страны: Корея, Европа, Китай.
 *  Матрица: страна × режим таможни × валюта.
 *    Режимы: phys_rf (физлицо РФ, ЕТС), jur (юрлицо, коммерческий импорт),
 *            phys_kg (через Киргизию, ручная растаможка),
 *            manual_belka (через Беларусь, ручная растаможка).
 *  Плюс режим CIF СПб (цена уже с доставкой) и финансирование (рассрочка).
 *
 *  Принципы:
 *    – ТАМОЖЕННАЯ СТОИМОСТЬ — по курсу ЦБ РФ (юрлицо: ЦБ+3%).
 *    – РЕАЛЬНЫЙ ПЛАТЁЖ — по рыночному курсу (Корея ₩→USDT→₽, Европа €×продажа,
 *      Китай $/¥ по курсу ВТБ).
 *    – Утильсбор = базовая ставка × коэффициент из таблицы (льгота — только физлицо РФ).
 *
 *  Контрольные примеры (физлицо РФ) сверены с таблицей заказчика:
 *    Корея 2000 см³/120 кВт/<3 лет → пошлина+сбор 633 215 ₽, итого 3 019 703 ₽.
 * ========================================================================= */

/* --- Вспомогательные конвертеры л.с. <-> кВт --- */
function hpToKw(hp) { return hp * 0.7355; }
function kwToHp(kw) { return kw / 0.7355; }

/* --- Поиск коэффициента утильсбора ---
 * Льготный коэффициент (0.17/0.26 → 3400/5200) применяется, если мощность ≤ порога
 * (160 л.с. ДВС / 80 л.с. EV) И не задан skipPreferential (юрлицо льготу не получает). */
function findUtilCoef(cfg, isElectric, volumeCc, powerKw, powerHp, isOlderThan3, skipPreferential) {
  const pref = cfg.utilPreferentialCoef || { new: 0.17, old: 0.26 };
  const thrHp = isElectric
    ? (cfg.utilPreferentialHp ? cfg.utilPreferentialHp.ev : 80)
    : (cfg.utilPreferentialHp ? cfg.utilPreferentialHp.ice : 160);

  // льготный утиль — мощность в пределах порога (для юрлица льгота отключена)
  if (!skipPreferential && powerHp <= thrHp) return isOlderThan3 ? pref.old : pref.new;

  // выше порога (или юрлицо) — детальная таблица коэффициентов.
  if (isElectric) {
    const cand = cfg.utilEv.filter(r => powerKw >= r.kMin);
    const row = cand.length ? cand[cand.length - 1] : cfg.utilEv[cfg.utilEv.length - 1];
    return isOlderThan3 ? row.cOld : row.cNew;
  }
  // объёмную группу выбираем по НИЖНЕЙ границе (устойчиво к дробным объёмам в зазорах)
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

/* --- Пошлина ФИЗЛИЦА РФ (ЕТС): электро 15%+акциз+НДС22%; <3 лет max(%,€/см³); >3 €/см³ ---
 * Возвращает { duty, excise, vat, customsFee, total, method } */
function calcDutyBlock(cfg, p) {
  const cbrEur = cfg.rates.cbr.EUR;
  const customsFee = findCustomsFee(cfg, p.customsValueRub);

  if (p.isElectric) {
    const duty   = cfg.evDutyPercent * p.customsValueRub;
    const exciseUnits = p.powerKw / 0.75; // НК РФ ст.193 — ставка за 0.75 кВт
    const exRow  = cfg.exciseEv.find(r => exciseUnits <= r.unitMax) || cfg.exciseEv[cfg.exciseEv.length - 1];
    const excise = exRow.rub * exciseUnits;
    const vat    = cfg.evVatPercent * (p.customsValueRub + duty + excise);
    return {
      duty, excise, vat, customsFee,
      total: duty + excise + vat + customsFee,
      method: `Электрокар: пошлина ${(cfg.evDutyPercent * 100).toFixed(0)}% + акциз + НДС ${(cfg.evVatPercent * 100).toFixed(0)}%`,
    };
  }

  if (p.age === '<3') {
    const b = cfg.dutyUnder3.find(r => p.customsValueEur <= r.valMaxEur)
           || cfg.dutyUnder3[cfg.dutyUnder3.length - 1];
    const byPercent = b.percent * p.customsValueRub;
    const byCc      = b.eurPerCc * p.volumeCc * cbrEur;
    const duty = Math.max(byPercent, byCc);
    return {
      duty, excise: 0, vat: 0, customsFee,
      total: duty + customsFee,
      method: byPercent >= byCc ? `${(b.percent * 100).toFixed(0)}% от стоимости` : `${b.eurPerCc} €/см³`,
    };
  }

  const tbl = cfg.dutyOver3[p.age] || cfg.dutyOver3['3-5'];
  const b = tbl.find(r => p.volumeCc <= r.ccMax) || tbl[tbl.length - 1];
  const duty = b.eurPerCc * p.volumeCc * cbrEur;
  return { duty, excise: 0, vat: 0, customsFee, total: duty + customsFee, method: `${b.eurPerCc} €/см³` };
}

/* --- Пошлина ЮРЛИЦА (коммерческий импорт): пошлина 15% + акциз + НДС 22% + утиль + сбор.
 *     Таможенная стоимость = база × (курс ЦБ × (1 + cbrMarkup)). --- */
function calcJurBlock(cfg, p) {
  const j = cfg.jur || { dutyPercent: 0.15, cbrMarkup: 0.03, vatPercent: 0.22 };
  const customsValueRub = p.customsValueRubBase * (1 + j.cbrMarkup); // ×1.03
  const duty = j.dutyPercent * customsValueRub;                      // 15%
  const units = p.powerKw / 0.75;                                    // акциз для ДВС И электро
  const exRow = cfg.exciseEv.find(r => units <= r.unitMax) || cfg.exciseEv[cfg.exciseEv.length - 1];
  const excise = exRow.rub * units;
  const vat = j.vatPercent * (customsValueRub + duty + excise);      // 22%
  const utilCoef = findUtilCoef(cfg, p.isElectric, p.volumeCc, p.powerKw, p.powerHp, p.isOlderThan3, true); // без льготы
  const utilFee = cfg.utilBase * utilCoef;
  const customsFee = findCustomsFee(cfg, customsValueRub);
  return {
    duty, excise, vat, customsFee, utilFee, utilCoef, customsValueRub,
    total: duty + excise + vat + utilFee + customsFee,
    method: `Юрлицо: пошлина ${(j.dutyPercent * 100).toFixed(0)}% + акциз + НДС ${(j.vatPercent * 100).toFixed(0)}% (ЦБ×${(1 + j.cbrMarkup).toFixed(2)})`,
  };
}

/* --- Курсы для реального платежа (payRate) и таможенной стоимости (cbrRate) --- */
function resolveRates(cfg, country, currency) {
  const m = cfg.rates.market, cbr = cfg.rates.cbr;
  let payRate, cbrRate;
  const usdPay = m.USD_VTB, eurPay = m.EUR_SALE;
  if (country === 'kr') {
    if (currency === 'USD') { payRate = m.USDT_RUB;              cbrRate = cbr.USD; }
    else                    { payRate = m.USDT_RUB / m.KRW_USDT; cbrRate = cbr.KRW; } // ₩→USDT→₽
  } else if (country === 'eu') {
    payRate = m.EUR_SALE; cbrRate = cbr.EUR;
  } else if (country === 'ge') {
    payRate = m.USD_VTB; cbrRate = cbr.USD; // Грузия: закуп/логистика в $
  } else { // cn
    if (currency === 'CNY') { payRate = m.CNY_VTB; cbrRate = cbr.CNY; }
    else                    { payRate = m.USD_VTB; cbrRate = cbr.USD; }
  }
  return { payRate, cbrRate, usdPay, eurPay };
}

/* --- Страновой блок: реальный платёж + база таможенной стоимости (по ЦБ, без наценки юрлица) ---
 * Возвращает { carCostRub, customsValueRubBase, foreignLogisticsRub, detail } */
function computeForeign(cfg, input, rates) {
  const price = Number(input.carPrice) || 0;
  if (input.country === 'kr') {
    const delivery = Number(input.deliveryWon) || 0;
    const dealer = Number(input.dealerWon) || 0;
    const sum = price + delivery + dealer;
    const korVat = (input.korVatPercent != null ? input.korVatPercent : cfg.korea.vatPercent);
    const refundPct = (input.korRefundPercent != null ? input.korRefundPercent : cfg.korea.vatRefundPercent);
    const vat = sum * korVat;
    const refund = vat * refundPct;
    return {
      carCostRub: (sum - refund) * rates.payRate,
      customsValueRubBase: sum * rates.cbrRate,
      foreignLogisticsRub: 0,
      detail: { sum, korVat, vat, refund, refundPct, pay: sum - refund, delivery, dealer },
    };
  }
  if (input.country === 'eu') {
    const carCount = Number(input.carCount) || 1;
    // фрахт: ручной ввод переопределяет автодефолт по количеству авто
    const freight = (input.freightEur != null && input.freightEur !== '')
      ? Number(input.freightEur)
      : (carCount === 1 ? cfg.europe.freightSingleEur : cfg.europe.freightGroupEur);
    const foreign = price + freight;
    return {
      carCostRub: foreign * rates.payRate,
      customsValueRubBase: foreign * rates.cbrRate,
      foreignLogisticsRub: 0,
      detail: { freight, foreign, carCount },
    };
  }
  if (input.country === 'ge') {
    // Грузия: закуп $ + логистика до РФ $ (входит в таможенную стоимость)
    const logistics = Number(input.geLogistics) || 0;
    return {
      carCostRub: price * rates.payRate,
      customsValueRubBase: price * rates.cbrRate + logistics * rates.cbrRate,
      foreignLogisticsRub: logistics * rates.payRate,
      detail: { logistics },
    };
  }
  // cn — два плеча логистики в валюте цены ($ или ¥)
  const leg1 = Number(input.leg1) || 0, leg2 = Number(input.leg2) || 0;
  const isCif = !!input.isCif;
  const legsRub = isCif ? 0 : (leg1 + leg2) * rates.payRate;
  const customsBase = isCif
    ? price * rates.cbrRate
    : price * rates.cbrRate + (leg1 + leg2) * rates.cbrRate; // CIF-база: + доставка по ЦБ той же валюты
  return {
    carCostRub: price * rates.payRate,
    customsValueRubBase: customsBase,
    foreignLogisticsRub: legsRub,
    detail: { leg1, leg2, isCif, legsRub },
  };
}

/* =========================================================================
 *  Главная функция расчёта
 *  input = {
 *    country: 'kr'|'eu'|'cn', currency, customsMode, isCif,
 *    isElectric, age, volumeCc, powerKw|powerHp,
 *    carPrice, deliveryWon, dealerWon, korVatPercent, carCount, leg1, leg2,
 *    manualCustoms, manualTransit,           // ручная растаможка (КГ/Белка)
 *    financingEnabled, financingMonths,
 *    commission, extraExpenses, expenses, logisticsCity,
 *  }
 * ========================================================================= */
function calculate(input, cfg) {
  cfg = cfg || {};
  cfg = Object.assign({}, CALC_DATA, cfg);
  cfg.rates = cfg.rates || CALC_DATA.defaultRates;

  // мощность/объём/возраст
  let powerKw = input.powerKw, powerHp = input.powerHp;
  if (powerKw == null && powerHp != null) powerKw = hpToKw(powerHp);
  if (powerHp == null && powerKw != null) powerHp = kwToHp(powerKw);
  powerKw = powerKw || 0; powerHp = powerHp || 0;
  const volumeCc = input.volumeCc || 0;
  const isOlderThan3 = input.age !== '<3';
  // тип авто: ДВС / параллельный гибрид → расчёт по объёму (ДВС);
  //           электрокар / последовательный гибрид → спец. схема (15%+акциз+НДС, утиль ЭЛ)
  const carType = input.carType || (input.isElectric ? 'electric' : 'ice');
  const isElectric = (carType === 'electric' || carType === 'hybrid_serial');

  const country = input.country;
  const currency = input.currency || (country === 'kr' ? 'KRW' : country === 'eu' ? 'EUR' : 'USD');
  const mode = input.customsMode || 'phys_rf';
  const isManual = (mode === 'phys_kg' || mode === 'manual_belka');
  const rates = resolveRates(cfg, country, currency);

  // --- страновой блок ---
  const F = computeForeign(cfg, input, rates);
  let carCostRub = F.carCostRub;
  let foreignLogisticsRub = F.foreignLogisticsRub;

  // --- диспетчер режима таможни ---
  let cb; // {duty,excise,vat,customsFee,utilFee,utilCoef,total,method,customsValueRub, manual?, manualCustomsRub?, manualLogisticsRub?}
  if (isManual) {
    // Белка: € (ТО + логистика); КГ: $ (ТО + транзит) + плечи Китая
    const modePayRate = (mode === 'manual_belka') ? rates.eurPay : rates.usdPay;
    const moCustoms = (Number(input.manualCustoms) || 0) * modePayRate;
    let moLogistics = (Number(input.manualTransit) || 0) * modePayRate;
    if (mode === 'manual_belka') carCostRub = (Number(input.carPrice) || 0) * rates.payRate; // без фрахта
    if (country === 'cn' || country === 'ge') moLogistics += foreignLogisticsRub; // плечи Китая / логистика Грузии
    foreignLogisticsRub = 0; // свёрнуто в moLogistics
    cb = {
      manual: true, manualCustomsRub: moCustoms, manualLogisticsRub: moLogistics,
      duty: 0, excise: 0, vat: 0, customsFee: 0, utilFee: 0, utilCoef: 0,
      customsValueRub: 0, total: moCustoms + moLogistics, method: 'Ручная растаможка',
    };
  } else if (mode === 'jur') {
    cb = calcJurBlock(cfg, {
      customsValueRubBase: F.customsValueRubBase,
      isElectric, volumeCc, powerKw, powerHp, isOlderThan3,
    });
  } else { // phys_rf — без изменений (регрессия)
    const customsValueRub = F.customsValueRubBase;
    const customsValueEur = customsValueRub / cfg.rates.cbr.EUR;
    const d = calcDutyBlock(cfg, { isElectric, age: input.age, volumeCc, powerHp, powerKw, customsValueRub, customsValueEur });
    const utilCoef = findUtilCoef(cfg, isElectric, volumeCc, powerKw, powerHp, isOlderThan3);
    const utilFee = cfg.utilBase * utilCoef;
    cb = { ...d, utilFee, utilCoef, customsValueRub, total: d.total + utilFee };
  }

  // --- утиль-ловушка (только физлицо РФ; юрлицо льготу не получает, ручные — без утиля) ---
  const _prefCoef = cfg.utilPreferentialCoef || { new: 0.17, old: 0.26 };
  const _prefHp = cfg.utilPreferentialHp || { ice: 160, ev: 80 };
  const utilThresholdHp = isElectric ? _prefHp.ev : _prefHp.ice;
  const hasUtilTrap = (mode === 'phys_rf');
  const utilPreferentialApplied = powerHp <= utilThresholdHp;
  const utilPreferentialFee = cfg.utilBase * (isOlderThan3 ? _prefCoef.old : _prefCoef.new);

  // --- расходы по РФ (логистику по РФ выносим отдельной строкой) ---
  const allExpenses = input.expenses || [];
  const logisticsItem = allExpenses.find(e => e && e.key === 'rf_logistics');
  const logistics = logisticsItem ? (Number(logisticsItem.value) || 0) : 0;
  const logisticsCity = (input.logisticsCity || '').trim();
  const expenses = allExpenses.filter(e => !(e && e.key === 'rf_logistics'));
  const expensesSum = expenses.reduce((s, e) => s + (Number(e.value) || 0), 0);

  const commission = Number(input.commission) || 0;
  const extraExpenses = Number(input.extraExpenses) || 0;

  // --- комиссия платёжного агента: % от инвойса за авто (цена × курс оплаты) ---
  const agentDefault = (cfg.paymentAgent && cfg.paymentAgent.percent) || 0.02;
  const agentPercent = input.agentEnabled
    ? (input.agentPercent != null ? Number(input.agentPercent) : agentDefault)
    : 0;
  const invoiceRub = (Number(input.carPrice) || 0) * rates.payRate;
  const agentFee = agentPercent * invoiceRub;

  // --- финансирование (рассрочка): +2%/мес от суммы под ключ (включая комиссию агента) ---
  const finPct = (cfg.financing && cfg.financing.percentPerMonth) || 0.02;
  const months = input.financingEnabled ? (Number(input.financingMonths) || 0) : 0;
  const base = carCostRub + foreignLogisticsRub + cb.total + expensesSum + logistics + commission + extraExpenses + agentFee;
  const financing = finPct * months * base;
  const grandTotal = base + financing;

  // --- этапы оплаты (mode-aware; Σ этапов === grandTotal) ---
  let stages;
  if (isManual) {
    stages = [
      { label: 'Депозит (р/с)', short: 'Депозит', value: commission },
      { label: 'Оплата за авто (инвойс)', short: 'Авто (инвойс)', value: carCostRub },
      { label: 'Растаможка (ТО)', short: 'Растаможка', value: cb.manualCustomsRub },
      { label: 'Логистика / транзит и расходы' + (logisticsCity ? ' — ' + logisticsCity : ''),
        short: 'Логистика+расходы', value: cb.manualLogisticsRub + expensesSum + logistics },
      { label: 'Доп. расходы', short: 'Доп. расходы', value: extraExpenses },
    ];
  } else {
    stages = [
      { label: 'Депозит (р/с)', short: 'Депозит', value: commission },
      { label: 'Оплата за авто (инвойс)', short: 'Авто (инвойс)', value: carCostRub },
      { label: 'Пошлина / тамож. сбор / утиль (квитанция)', short: 'Пошлина/утиль', value: cb.total },
      { label: 'Остальные платежи и вывоз' + (logisticsCity ? ' — ' + logisticsCity : ''),
        short: 'Остальное+вывоз', value: expensesSum + logistics + foreignLogisticsRub },
      { label: 'Доп. расходы', short: 'Доп. расходы', value: extraExpenses },
    ];
  }
  if (agentFee > 0) stages.push({ label: `Комиссия платёжного агента (${(agentPercent * 100).toFixed(1).replace('.0', '')}%)`, short: 'Комиссия агента', value: agentFee });
  if (financing > 0) stages.push({ label: `Финансирование (${months} мес × ${(finPct * 100).toFixed(0)}%)`, short: 'Финансирование', value: financing });

  return {
    input: { ...input, powerKw, powerHp, volumeCc, currency, customsMode: mode },
    country, currency, customsMode: mode, isManual, isCif: !!input.isCif,
    carType, isElectric,   // isElectric — итоговый флаг расчёта (учитывает гибриды)
    carCostRub,
    foreignLogisticsRub,
    customsValueRub: cb.customsValueRub,
    foreign: F.detail,               // страновые детали (kr/eu/cn) для рендера
    // таможенные платежи
    duty: cb.duty, dutyMethod: cb.method, excise: cb.excise, vat: cb.vat,
    customsFee: cb.customsFee, utilFee: cb.utilFee, utilCoef: cb.utilCoef,
    manual: !!cb.manual, manualCustomsRub: cb.manualCustomsRub || 0, manualLogisticsRub: cb.manualLogisticsRub || 0,
    customsTotal: cb.total,
    // утиль-ловушка
    hasUtilTrap, utilThresholdHp, utilPreferentialApplied, utilPreferentialFee,
    // расходы РФ
    expenses, expensesSum, logistics, logisticsCity,
    commission, extraExpenses,
    // комиссия платёжного агента
    agentFee, agentPercent,
    // финансирование
    financing, financingMonths: months, grandTotalBeforeFinancing: base,
    grandTotal,
    stages,
  };
}

// экспорт
if (typeof window !== 'undefined') {
  window.calculate = calculate;
  window.hpToKw = hpToKw;
  window.kwToHp = kwToHp;
  window.resolveRates = resolveRates;
  window.calcJurBlock = calcJurBlock;
  window.computeForeign = computeForeign;
}
if (typeof module !== 'undefined') module.exports = { calculate, hpToKw, kwToHp, resolveRates, calcJurBlock, computeForeign, findUtilCoef };
