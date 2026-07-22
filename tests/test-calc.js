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
  cbr: { USD: 78.554, EUR: 89.7558, KRW: 0.0530054 },
  market: { KRW_USDT: 1510, USDT_RUB: 84, EUR_SALE: 94.2 },
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

check('Корейский НДС 9% (₩)', r1.koreanVatWon, 1848600);
check('Возврат 40% НДС (₩)', r1.vatRefundWon, 739440);
check('К оплате (₩)', r1.payWon, 19800560);
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

check('Фрахт (€)', r2.freightEur, 5900);
check('Стоимость до РФ (€)', r2.foreignEur, 25900);
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
check('Фрахт 2+ авто (€)', f1.freightEur, 5100);

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

/* ============ Итог ============ */
console.log(failed === 0 ? '\n🎉 Все тесты пройдены' : `\n💥 Провалено проверок: ${failed}`);
process.exit(failed === 0 ? 0 : 1);
