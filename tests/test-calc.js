/* =========================================================================
 *  test-calc.js — контрольные цифры движка (сверка с Google-таблицей друга)
 *  Запуск: node tests/test-calc.js
 * ========================================================================= */

const path = require('path');
const CALC_DATA = require(path.join(__dirname, '..', 'js', 'data.js'));
global.CALC_DATA = CALC_DATA; // calc.js обращается к глобальной CALC_DATA
const { calculate, hpToKw, kwToHp } = require(path.join(__dirname, '..', 'js', 'calc.js'));

// Фикс-курсы как в таблице на момент сверки
const RATES = {
  cbr: { USD: 78.554, EUR: 89.7558, KRW: 0.0530054, CNY: 10.90 },
  market: { KRW_USDT: 1510, USDT_RUB: 84, EUR_SALE: 94.2, USD_VTB: 82, CNY_VTB: 11.4 },
};

let failed = 0;
function check(label, actual, expected, tol = 1) {
  const ok = Math.abs(actual - expected) <= tol;
  if (!ok) failed++;
  console.log(`${ok ? '✅' : '❌'} ${label}: ${actual.toFixed(2)} (ожидание ${expected}${tol > 1 ? ' ±' + tol : ''})`);
}
function checkTrue(label, cond) {
  if (!cond) failed++;
  console.log(`${cond ? '✅' : '❌'} ${label}`);
}

/* ============ Тест 1 — Корея, ДВС, «менее 3 лет» (контрольный пример листа) ============ */
console.log('\n— Тест 1: Корея ДВС 18.8М₩ + 1.3М + 440к, 2000 см³, 120 кВт, <3 лет —');
const r1 = calculate({
  country: 'kr', isElectric: false, age: '<3',
  volumeCc: 2000, powerKw: 120,
  carPrice: 18800000, deliveryWon: 1300000, dealerWon: 440000,
  commission: 0, extraExpenses: 0,
  expenses: [
    { key: 'broker', value: 120000 },
    { key: 'rf_logistics', value: 265000 },
  ],
}, { rates: RATES });

check('Корейский НДС 9% (₩)', r1.foreign.vat, 1848600);
check('Возврат 40% НДС (₩)', r1.foreign.refund, 739440);
check('К оплате (₩)', r1.foreign.pay, 19800560);
check('Расходы Корея (₽)', r1.carCostRub, 1101488, 1);
check('Таможенная стоимость (₽)', r1.customsValueRub, 1088731, 1);
check('Пошлина (₽)', r1.duty, 628291, 1);           // 3.5 €/см³ × 2000 × 89.7558
check('Сбор за оформление (₽)', r1.customsFee, 4924);
check('Пошлина + сбор (₽) = лист 633 215', r1.duty + r1.customsFee, 633215, 1);
check('Утильсбор (₽) = лист 900 000', r1.utilFee, 900000);
checkTrue('Утиль-ловушка: льгота НЕ применена (120 кВт ≈ 163 л.с. > 160)', !r1.utilPreferentialApplied);
check('ИТОГО (₽) = лист 3 019 703', r1.grandTotal, 3019703, 1);

/* ============ Тест 2 — Европа, ДВС, «менее 3 лет» (фикс бага юаня) ============ */
console.log('\n— Тест 2: Европа 20 000 €, 1 авто, 1500 см³, 150 л.с., <3 лет —');
const r2 = calculate({
  country: 'eu', isElectric: false, age: '<3',
  volumeCc: 1500, powerHp: 150,
  carPrice: 20000, carCount: 1,
  commission: 0, extraExpenses: 0,
  expenses: [
    { key: 'broker', value: 95000 },
    { key: 'forwarding', value: 135000 },
    { key: 'export', value: 15000 },
    { key: 'rf_logistics', value: 0 },
  ],
}, { rates: RATES });

check('Фрахт (€)', r2.foreign.freight, 5900);
check('Стоимость до РФ (€)', r2.foreign.foreign, 25900);
check('Платёж за авто (₽) по 94.2', r2.carCostRub, 2439780);
check('Таможенная стоимость (₽) по ЦБ EUR', r2.customsValueRub, 2324675, 1);
check('Пошлина (₽): 48% (брекет ≤42 300 €)', r2.duty, 1115844, 1);
check('Сбор за оформление (₽)', r2.customsFee, 13541);
check('Утильсбор льготный (150 л.с. ≤ 160)', r2.utilFee, 3400);
checkTrue('Утиль-ловушка: льгота применена', r2.utilPreferentialApplied);
check('ИТОГО (₽)', r2.grandTotal, 2439780 + 1115844 + 13541 + 3400 + 95000 + 135000 + 15000, 2);

/* ============ Тест 3 — Корея, электрокар до 3 лет ============ */
console.log('\n— Тест 3: Корея электрокар 30М₩ + 1.3М + 440к, 150 кВт, <3 лет —');
const r3 = calculate({
  country: 'kr', isElectric: true, age: '<3',
  volumeCc: 0, powerKw: 150,
  carPrice: 30000000, deliveryWon: 1300000, dealerWon: 440000,
  commission: 0, extraExpenses: 0,
  expenses: [],
}, { rates: RATES });

check('Таможенная стоимость (₽)', r3.customsValueRub, 31740000 * 0.0530054, 1);
check('Пошлина 15% (₽)', r3.duty, 0.15 * 31740000 * 0.0530054, 1);
check('Акциз (₽): 200 ед. × 613', r3.excise, 122600);
check('НДС 22% (₽)', r3.vat, 0.22 * (31740000 * 0.0530054 * 1.15 + 122600), 1);
check('Сбор (₽)', r3.customsFee, 13541);
check('Утиль EV (₽): коэф. 109.68', r3.utilFee, 2193600);
checkTrue('Утиль-ловушка EV: 150 кВт ≈ 204 л.с. > 80', !r3.utilPreferentialApplied);

/* ============ Тест 4 — граничные случаи ============ */
console.log('\n— Тест 4: границы —');
// 160 л.с. ровно → льгота; 161 → полный
const b1 = calculate({ country: 'eu', age: '<3', volumeCc: 1600, powerHp: 160, carPrice: 10000, carCount: 1, expenses: [] }, { rates: RATES });
const b2 = calculate({ country: 'eu', age: '<3', volumeCc: 1600, powerHp: 161, carPrice: 10000, carCount: 1, expenses: [] }, { rates: RATES });
check('160 л.с. → льготный утиль', b1.utilFee, 3400);
checkTrue('161 л.с. → полный утиль (>3400)', b2.utilFee > 3400);
check('161 л.с. (118.4 кВт), 1600 см³, <3 лет → коэф. 45 → 900 000', b2.utilFee, 900000);

// EV порог 80 л.с.
const b3 = calculate({ country: 'kr', isElectric: true, age: '>3', powerHp: 80, carPrice: 10000000, deliveryWon: 0, dealerWon: 0, expenses: [] }, { rates: RATES });
const b4 = calculate({ country: 'kr', isElectric: true, age: '>3', powerHp: 81, carPrice: 10000000, deliveryWon: 0, dealerWon: 0, expenses: [] }, { rates: RATES });
check('EV 80 л.с. старше 3 лет → льготный утиль 5200', b3.utilFee, 5200);
checkTrue('EV 81 л.с. → полный утиль', b4.utilFee > 5200);

// Фрахт ЕС: 1 авто ↔ 2+
const f1 = calculate({ country: 'eu', age: '<3', volumeCc: 1000, powerHp: 100, carPrice: 10000, carCount: 2, expenses: [] }, { rates: RATES });
check('Фрахт 2+ авто (€)', f1.foreign.freight, 5100);

// Старше 3 лет: 2500 см³, 3-5 лет → 3.0 €/см³
const a1 = calculate({ country: 'eu', age: '3-5', volumeCc: 2500, powerHp: 150, carPrice: 15000, carCount: 1, expenses: [] }, { rates: RATES });
check('3–5 лет, 2500 см³: 3.0 €/см³', a1.duty, 3.0 * 2500 * RATES.cbr.EUR, 1);
// 5-7 лет → 5.0 €/см³
const a2 = calculate({ country: 'eu', age: '5-7', volumeCc: 2500, powerHp: 150, carPrice: 15000, carCount: 1, expenses: [] }, { rates: RATES });
check('5–7 лет, 2500 см³: 5.0 €/см³', a2.duty, 5.0 * 2500 * RATES.cbr.EUR, 1);

// Дробный объём в зазоре полос utilIce не должен «проваливаться» в максимальный коэффициент (регресс-тест)
const frac1 = calculate({ country: 'eu', age: '<3', volumeCc: 2000, powerHp: 200, carPrice: 15000, carCount: 1, expenses: [] }, { rates: RATES });
const frac2 = calculate({ country: 'eu', age: '<3', volumeCc: 2000.5, powerHp: 200, carPrice: 15000, carCount: 1, expenses: [] }, { rates: RATES });
check('2000.5 см³ → та же группа, что 2000 (нет провала в макс. коэф.)', frac2.utilFee, frac1.utilFee, 0.01);
// мощность 200 л.с. — выше льготного порога 160, чтобы дойти до таблицы коэффициентов
const frac3 = calculate({ country: 'eu', age: '<3', volumeCc: 3500.7, powerHp: 200, carPrice: 15000, carCount: 1, expenses: [] }, { rates: RATES });
const frac3int = calculate({ country: 'eu', age: '<3', volumeCc: 3500, powerHp: 200, carPrice: 15000, carCount: 1, expenses: [] }, { rates: RATES });
const frac4 = calculate({ country: 'eu', age: '<3', volumeCc: 3501, powerHp: 200, carPrice: 15000, carCount: 1, expenses: [] }, { rates: RATES });
check('3500.7 см³ → та же группа, что 3500 (по нижней границе)', frac3.utilCoef, frac3int.utilCoef, 0.001);
checkTrue('3501 см³ → следующая группа (коэф. отличается от 3500.7)', frac3.utilCoef !== frac4.utilCoef);

// Конвертер мощности
check('hpToKw(163.15) ≈ 120 кВт', hpToKw(163.15), 120, 0.05);
check('kwToHp(110.32) ≈ 150 л.с.', kwToHp(110.325), 150, 0.01);

// Этапы оплаты: сумма этапов = итого
const sumStages = r1.stages.reduce((s, st) => s + st.value, 0);
check('Тест 1: сумма этапов = ИТОГО', sumStages, r1.grandTotal, 0.01);

const sumStages2 = (r) => r.stages.reduce((s, st) => s + st.value, 0);

/* ============ Тест 5 — Корея ЮРЛИЦО (большой объём, малая мощность → skipPreferential) ============ */
console.log('\n— Тест 5: Корея юрлицо, 3200 см³, 150 л.с., <3 лет —');
const jurIn = {
  country: 'kr', customsMode: 'jur', isElectric: false, age: '<3',
  volumeCc: 3200, powerHp: 150,
  carPrice: 18800000, deliveryWon: 1300000, dealerWon: 440000,
  commission: 0, extraExpenses: 0, expenses: [],
};
const r5 = calculate(jurIn, { rates: RATES });
const sumWon5 = 18800000 + 1300000 + 440000;
const cv5 = sumWon5 * RATES.cbr.KRW * 1.03;               // таможенная стоимость юрлица (ЦБ×1.03)
const units5 = hpToKw(150) / 0.75;                        // ≈ 147.1 ≤ 150 → ставка 64 ₽
const excise5 = 64 * units5;
check('Тамож. стоимость юрлица = база×ЦБ×1.03', r5.customsValueRub, cv5, 1);
check('Пошлина 15%', r5.duty, 0.15 * cv5, 1);
check('Акциз (64 × units, т.к. 147 л.с. ≤ 150)', r5.excise, excise5, 1);
check('НДС 22% на (СТ+пошлина+акциз)', r5.vat, 0.22 * (cv5 + 0.15 * cv5 + excise5), 1);
// 3200 см³ → группа 3001-3500; 150 л.с. = 110.3 кВт → полоса 95.62-117.68 → cNew 129.2
check('Утиль юрлица = полный (коэф. 129.2), БЕЗ льготы', r5.utilFee, 20000 * 129.2, 1);
const r5phys = calculate({ ...jurIn, customsMode: 'phys_rf' }, { rates: RATES });
check('Сравнение: физлицо РФ на том же авто → льготный утиль 3400', r5phys.utilFee, 3400);
checkTrue('Юрлицо утиль > физлицо (skipPreferential работает)', r5.utilFee > r5phys.utilFee);
check('Тест 5: Σ этапов = ИТОГО', sumStages2(r5), r5.grandTotal, 0.01);

/* ============ Тест 6 — Китай, ручная растаможка через КГ ($) ============ */
console.log('\n— Тест 6: Китай phys_kg, $20000, плечи 1000/1800, ТО $1500 —');
const r6 = calculate({
  country: 'cn', customsMode: 'phys_kg', currency: 'USD', isElectric: false, age: '<3',
  volumeCc: 2000, powerHp: 150, carPrice: 20000,
  leg1: 1000, leg2: 1800, manualCustoms: 1500, manualTransit: 0,
  commission: 0, extraExpenses: 0,
  expenses: [{ key: 'broker', value: 100000 }, { key: 'rf_logistics', value: 0 }],
}, { rates: RATES });
check('Ручной режим: пошлина = 0', r6.duty, 0);
check('Ручной режим: НДС = 0', r6.vat, 0);
// утильсбор РФ платится при ввозе даже через КГ/Белку; 150 л.с. ≤ 160 → льгота 3400
check('Ручной режим: утиль по мощности (150 л.с. → льгота 3400)', r6.utilFee, 3400);
check('Растаможка ТО (₽) = 1500 × USD_VTB', r6.manualCustomsRub, 1500 * 82, 1);
check('Логистика (плечи 2800 × USD_VTB)', r6.manualLogisticsRub, 2800 * 82, 1);
check('Авто (₽) = 20000 × USD_VTB', r6.carCostRub, 20000 * 82, 1);
const exp6 = 20000 * 82 + 1500 * 82 + 2800 * 82 + 3400 + 100000; // + утиль
check('ИТОГО = авто + ТО + логистика + утиль + расходы РФ', r6.grandTotal, exp6, 1);
check('Тест 6: Σ этапов = ИТОГО', sumStages2(r6), r6.grandTotal, 0.01);

/* ============ Тест 7 — Китай, $ vs ¥ (курс ВТБ) ============ */
console.log('\n— Тест 7: Китай физлицо РФ, $20000 vs ¥145000 —');
const r7usd = calculate({ country: 'cn', customsMode: 'phys_rf', currency: 'USD', age: '<3', volumeCc: 2000, powerHp: 150, carPrice: 20000, leg1: 0, leg2: 0, expenses: [] }, { rates: RATES });
const r7cny = calculate({ country: 'cn', customsMode: 'phys_rf', currency: 'CNY', age: '<3', volumeCc: 2000, powerHp: 150, carPrice: 145000, leg1: 0, leg2: 0, expenses: [] }, { rates: RATES });
check('Китай $: авто = 20000 × USD_VTB', r7usd.carCostRub, 20000 * 82, 1);
check('Китай ¥: авто = 145000 × CNY_VTB', r7cny.carCostRub, 145000 * 11.4, 1);
check('Китай $: тамож. стоимость = 20000 × ЦБ$', r7usd.customsValueRub, 20000 * 78.554, 1);
check('Китай ¥: тамож. стоимость = 145000 × ЦБ¥', r7cny.customsValueRub, 145000 * 10.90, 1);

/* ============ Тест 8 — CIF СПб (плечи не считаются) ============ */
console.log('\n— Тест 8: Китай CIF СПб —');
const r8cif = calculate({ country: 'cn', customsMode: 'phys_rf', currency: 'USD', age: '<3', volumeCc: 2000, powerHp: 150, carPrice: 20000, isCif: true, leg1: 1000, leg2: 1800, expenses: [] }, { rates: RATES });
const r8no = calculate({ country: 'cn', customsMode: 'phys_rf', currency: 'USD', age: '<3', volumeCc: 2000, powerHp: 150, carPrice: 20000, isCif: false, leg1: 1000, leg2: 1800, expenses: [] }, { rates: RATES });
check('CIF: логистика (плечи) = 0', r8cif.foreignLogisticsRub, 0);
check('CIF: тамож. стоимость = только цена × ЦБ$', r8cif.customsValueRub, 20000 * 78.554, 1);
checkTrue('non-CIF: плечи добавлены в логистику', r8no.foreignLogisticsRub > 0);
check('non-CIF: тамож. стоимость = цена + плечи (по ЦБ$)', r8no.customsValueRub, (20000 + 2800) * 78.554, 1);
checkTrue('non-CIF итог больше CIF (на логистику)', r8no.grandTotal > r8cif.grandTotal);

/* ============ Тест 9 — Финансирование +2%/мес ============ */
console.log('\n— Тест 9: финансирование 6 мес —');
const r9base = calculate({ country: 'eu', customsMode: 'phys_rf', age: '<3', volumeCc: 1500, powerHp: 150, carPrice: 20000, carCount: 1, expenses: [] }, { rates: RATES });
const r9fin = calculate({ country: 'eu', customsMode: 'phys_rf', age: '<3', volumeCc: 1500, powerHp: 150, carPrice: 20000, carCount: 1, financingEnabled: true, financingMonths: 6, expenses: [] }, { rates: RATES });
check('Финансирование = 2% × 6 × база', r9fin.financing, 0.02 * 6 * r9base.grandTotal, 1);
check('ИТОГО с финансированием = база × 1.12', r9fin.grandTotal, r9base.grandTotal * 1.12, 1);
check('Тест 9: Σ этапов = ИТОГО', sumStages2(r9fin), r9fin.grandTotal, 0.01);

/* ============ Тест 10 — явная регрессия (новые параметры инертны на legacy-пути) ============ */
console.log('\n— Тест 10: регрессия Тест-1 с явными currency/customsMode —');
const r10 = calculate({
  country: 'kr', currency: 'KRW', customsMode: 'phys_rf', isElectric: false, age: '<3',
  volumeCc: 2000, powerKw: 120, carPrice: 18800000, deliveryWon: 1300000, dealerWon: 440000,
  commission: 0, extraExpenses: 0,
  expenses: [{ key: 'broker', value: 120000 }, { key: 'rf_logistics', value: 265000 }],
}, { rates: RATES });
check('Регрессия: тот же ИТОГО 3 019 703', r10.grandTotal, 3019703, 1);
check('Регрессия: Σ этапов = ИТОГО', sumStages2(r10), r10.grandTotal, 0.01);

/* ============ Тест 11 — Грузия, физлицо РФ ($ + логистика $) ============ */
console.log('\n— Тест 11: Грузия физлицо РФ, $20000 + логистика $1000, 2000 см³, 150 л.с., <3 лет —');
const r11 = calculate({
  country: 'ge', customsMode: 'phys_rf', currency: 'USD', age: '<3',
  volumeCc: 2000, powerHp: 150, carPrice: 20000, geLogistics: 1000,
  commission: 0, extraExpenses: 0,
  expenses: [{ key: 'broker', value: 100000 }, { key: 'rf_logistics', value: 0 }],
}, { rates: RATES });
check('Грузия: авто = 20000 × USD_VTB', r11.carCostRub, 20000 * 82, 1);
check('Грузия: логистика = 1000 × USD_VTB', r11.foreignLogisticsRub, 1000 * 82, 1);
check('Грузия: тамож. стоимость = (20000+1000) × ЦБ$', r11.customsValueRub, 21000 * 78.554, 1);
checkTrue('Грузия: пошлина считается (ЕТС, > 0)', r11.duty > 0);
check('Тест 11: Σ этапов = ИТОГО', sumStages2(r11), r11.grandTotal, 0.01);

// Грузия через КГ (ручная) — логистика Грузии сворачивается в логистику режима
const r11kg = calculate({
  country: 'ge', customsMode: 'phys_kg', currency: 'USD', age: '<3',
  volumeCc: 2000, powerHp: 150, carPrice: 20000, geLogistics: 1000,
  manualCustoms: 1500, expenses: [],
}, { rates: RATES });
check('Грузия КГ: пошлина = 0 (ручная)', r11kg.duty, 0);
check('Грузия КГ: логистика включает geLogistics', r11kg.manualLogisticsRub, 1000 * 82, 1);
check('Грузия КГ: утиль плюсуется (150 л.с. → 3400)', r11kg.utilFee, 3400);
checkTrue('Грузия КГ: утиль в customsTotal', r11kg.customsTotal >= 3400);
check('Тест 11кг: Σ этапов = ИТОГО', sumStages2(r11kg), r11kg.grandTotal, 0.01);

/* ============ Тест 12 — Комиссия платёжного агента 2% ============ */
console.log('\n— Тест 12: комиссия агента 2% от инвойса —');
const r12base = calculate({ country: 'cn', customsMode: 'phys_rf', currency: 'USD', age: '<3', volumeCc: 2000, powerHp: 150, carPrice: 20000, leg1: 0, leg2: 0, expenses: [] }, { rates: RATES });
const r12 = calculate({ country: 'cn', customsMode: 'phys_rf', currency: 'USD', age: '<3', volumeCc: 2000, powerHp: 150, carPrice: 20000, leg1: 0, leg2: 0, agentEnabled: true, agentPercent: 0.02, expenses: [] }, { rates: RATES });
check('Комиссия агента = 2% × (цена × USD_VTB)', r12.agentFee, 0.02 * 20000 * 82, 1);
check('ИТОГО с агентом = база + agentFee', r12.grandTotal, r12base.grandTotal + 0.02 * 20000 * 82, 1);
check('Тест 12: Σ этапов = ИТОГО', sumStages2(r12), r12.grandTotal, 0.01);
// агент + финансирование вместе: финансирование считается от base (включая агента)
const r12fin = calculate({ country: 'cn', customsMode: 'phys_rf', currency: 'USD', age: '<3', volumeCc: 2000, powerHp: 150, carPrice: 20000, leg1: 0, leg2: 0, agentEnabled: true, agentPercent: 0.02, financingEnabled: true, financingMonths: 3, expenses: [] }, { rates: RATES });
check('Агент+финанс: Σ этапов = ИТОГО', sumStages2(r12fin), r12fin.grandTotal, 0.01);
checkTrue('Финансирование учитывает комиссию агента в базе', r12fin.financing > 0.02 * 3 * r12base.grandTotal);

/* ============ Тест 13 — Китай: логистика (плечи) в ¥ vs $ ============ */
console.log('\n— Тест 13: Китай плечи в ¥ (курс ВТБ) —');
const r13usd = calculate({ country: 'cn', customsMode: 'phys_rf', currency: 'USD', age: '<3', volumeCc: 2000, powerHp: 150, carPrice: 20000, leg1: 1000, leg2: 1800, expenses: [] }, { rates: RATES });
const r13cny = calculate({ country: 'cn', customsMode: 'phys_rf', currency: 'CNY', age: '<3', volumeCc: 2000, powerHp: 150, carPrice: 145000, leg1: 7000, leg2: 13000, expenses: [] }, { rates: RATES });
check('Китай $: плечи 2800 × USD_VTB', r13usd.foreignLogisticsRub, 2800 * 82, 1);
check('Китай ¥: плечи 20000 × CNY_VTB', r13cny.foreignLogisticsRub, 20000 * 11.4, 1);

/* ============ Тест 14 — Европа: редактируемый фрахт ============ */
console.log('\n— Тест 14: Европа фрахт вручную —');
const r14auto = calculate({ country: 'eu', customsMode: 'phys_rf', age: '<3', volumeCc: 1500, powerHp: 150, carPrice: 20000, carCount: 1, expenses: [] }, { rates: RATES });
const r14man = calculate({ country: 'eu', customsMode: 'phys_rf', age: '<3', volumeCc: 1500, powerHp: 150, carPrice: 20000, carCount: 1, freightEur: 7000, expenses: [] }, { rates: RATES });
check('Европа авто-фрахт (1 авто) = 5900 €', r14auto.foreign.freight, 5900);
check('Европа ручной фрахт = 7000 €', r14man.foreign.freight, 7000);
checkTrue('Ручной фрахт меняет итог', r14man.grandTotal !== r14auto.grandTotal);

/* ============ Тест 15 — типы авто: гибриды (послед. = электро, паралл. = ДВС) ============ */
console.log('\n— Тест 15: типы авто (гибриды) —');
const baseCar = { country: 'eu', customsMode: 'phys_rf', age: '<3', volumeCc: 2000, powerHp: 250, carPrice: 30000, carCount: 1, expenses: [] };
const rIce = calculate({ ...baseCar, carType: 'ice' }, { rates: RATES });
const rHevPar = calculate({ ...baseCar, carType: 'hybrid_parallel' }, { rates: RATES });
const rHevSer = calculate({ ...baseCar, carType: 'hybrid_serial', powerKw: hpToKw(250), powerHp: null }, { rates: RATES });
const rElec = calculate({ ...baseCar, volumeCc: 0, powerKw: hpToKw(250), powerHp: null, carType: 'electric' }, { rates: RATES });
check('Параллельный гибрид считается как ДВС (пошлина = ДВС)', rHevPar.duty, rIce.duty, 1);
checkTrue('Параллельный гибрид: НДС/акциз = 0 (как ДВС)', rHevPar.vat === 0 && rHevPar.excise === 0);
checkTrue('Последовательный гибрид: считается как электро (НДС > 0)', rHevSer.vat > 0 && rHevSer.isElectric === true);
checkTrue('Последовательный гибрид ≈ электрокар по схеме', Math.abs(rHevSer.duty - rElec.duty) < 1);
checkTrue('ДВС: isElectric = false', rIce.isElectric === false);
check('Тест 15: Σ этапов = ИТОГО (послед. гибрид)', sumStages2(rHevSer), rHevSer.grandTotal, 0.01);

/* ============ Тест 16 — редактируемый возврат НДС Кореи ============ */
console.log('\n— Тест 16: возврат НДС Кореи (редактируемый %) —');
const krBase = { country: 'kr', customsMode: 'phys_rf', age: '<3', volumeCc: 2000, powerKw: 120, carPrice: 18800000, deliveryWon: 1300000, dealerWon: 440000, korVatPercent: 0.09, expenses: [] };
const r16def = calculate({ ...krBase, korRefundPercent: 0.40 }, { rates: RATES });
const r16half = calculate({ ...krBase, korRefundPercent: 0.50 }, { rates: RATES });
const sum16 = 18800000 + 1300000 + 440000;
const vat16 = sum16 * 0.09;
check('Возврат 40% = 9% НДС × 40%', r16def.foreign.refund, vat16 * 0.40, 1);
check('Возврат 50% (изменённый)', r16half.foreign.refund, vat16 * 0.50, 1);
check('refundPct прокинут в detail', r16half.foreign.refundPct, 0.50, 0.001);
checkTrue('Больше возврат → меньше платёж за авто', r16half.carCostRub < r16def.carCostRub);

/* ============ Итог ============ */
console.log(failed === 0 ? '\n🎉 Все тесты пройдены' : `\n💥 Провалено проверок: ${failed}`);
process.exit(failed === 0 ? 0 : 1);
