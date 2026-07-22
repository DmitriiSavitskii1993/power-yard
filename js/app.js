/* =========================================================================
 *  app.js — логика интерфейса Mini App Power Yard (Корея + Европа)
 * ========================================================================= */
const tg = window.Telegram && window.Telegram.WebApp ? window.Telegram.WebApp : null;
const inTelegram = !!(tg && tg.initData !== undefined && tg.platform && tg.platform !== 'unknown');

// Адрес бэкенда бота (Render). Пусто → отправка через t.me/share.
const BACKEND_URL = 'https://power-yard-bot.onrender.com';

/* --- фирменные цвета Power Yard (кнопка Telegram, PNG-рендер) --- */
const BRAND_COLOR = '#CD003E';  // красный акцент
const BRAND_DARK  = '#161616';  // чёрный (подытоги секций в PNG на белом фоне)

/* --- состояние --- */
const state = {
  country: 'kr',
  isElectric: false,
  powerUnit: 'hp',
  logisticsCity: '',    // город доставки по РФ (к строке «Логистика по РФ»)
};

function currentPreset() { return cfg.expensePresets[state.country]; }

const CUR = { kr: '₩', eu: '€' };
const PRICE_PLACEHOLDER = { kr: '18800000', eu: '20000' };

/* все коммерческие курсы (вводятся 1 раз в день, запоминаются) */
const ALL_RATE_FIELDS = [
  { key: 'KRW_USDT', label: '₩ за 1 USDT' },
  { key: 'USDT_RUB', label: 'USDT → ₽' },
  { key: 'EUR_SALE', label: '€ продажа, ₽' },
];

/* --- утилиты --- */
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => Array.from(document.querySelectorAll(sel));
const num = (el) => { const v = parseFloat(($(el).value || '').toString().replace(',', '.')); return isNaN(v) ? 0 : v; };
const fmt = (n) => Math.round(n).toLocaleString('ru-RU') + ' ₽';
const fmtNum = (n) => Math.round(n).toLocaleString('ru-RU');

let cfg = buildConfig();
let lastResult = null;
let currentExpenseItems = [];

/* --- логотип для шапки картинки расчёта (встроен как data URI в js/logo.js) --- */
let brandLogo = null, brandLogoReady = false;
function preloadBrandLogo() {
  if (typeof window === 'undefined' || !window.BRAND_LOGO) return;
  const img = new Image();
  img.onload = () => { brandLogo = img; brandLogoReady = true; };
  img.src = window.BRAND_LOGO; // data URI → canvas не «портится» (toBlob работает)
}

/* --- экранирование значения для HTML-атрибута (город вводится вручную) --- */
const escapeAttr = (s) => String(s == null ? '' : s)
  .replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/* =================== ПОСЛЕДНИЕ ВВЕДЁННЫЕ ДАННЫЕ (по странам) ===================
 * Запоминаем по каждой стране: возраст, объём, мощность (+ед.), цену, доставку и
 * дилерские (Корея), кол-во авто (Европа), комиссию, доп. расходы, город логистики.
 * Храним в localStorage и дублируем в Telegram CloudStorage. */
const LAST_INPUTS_KEY   = 'kinder_last_inputs_v1'; // localStorage
const LAST_INPUTS_CLOUD = 'kinder_last_inputs_v1'; // Telegram CloudStorage

function getLastInputs() {
  try { return JSON.parse(localStorage.getItem(LAST_INPUTS_KEY)) || {}; }
  catch (e) { return {}; }
}
function saveLastInputs(obj) {
  try { localStorage.setItem(LAST_INPUTS_KEY, JSON.stringify(obj)); } catch (e) {}
  if (cloudAvailable()) {
    try { tg.CloudStorage.setItem(LAST_INPUTS_CLOUD, JSON.stringify(obj), function () {}); } catch (e) {}
  }
}
function loadLastInputsFromCloud() {
  return new Promise(function (resolve) {
    if (!cloudAvailable()) { resolve(null); return; }
    try {
      tg.CloudStorage.getItem(LAST_INPUTS_CLOUD, function (err, val) {
        if (err || !val) { resolve(null); return; }
        try { resolve(JSON.parse(val)); } catch (e) { resolve(null); }
      });
    } catch (e) { resolve(null); }
  });
}

/* собрать текущие поля формы в объект для текущей страны */
function captureInputs() {
  return {
    age: $('#age') ? $('#age').value : '',
    volumeCc: $('#volume') ? $('#volume').value : '',
    power: $('#power') ? $('#power').value : '',
    powerUnit: state.powerUnit,
    carPrice: $('#carPrice') ? $('#carPrice').value : '',
    deliveryWon: $('#deliveryWon') ? $('#deliveryWon').value : '',
    dealerWon: $('#dealerWon') ? $('#dealerWon').value : '',
    carCount: $('#carCount') ? $('#carCount').value : '1',
    commission: $('#commission') ? $('#commission').value : '',
    extraExpenses: $('#extraExpenses') ? $('#extraExpenses').value : '',
    city: $('#logCity') ? $('#logCity').value : (state.logisticsCity || ''),
  };
}
/* сохранить текущие поля под текущую страну */
function persistInputs() {
  const all = getLastInputs();
  all[state.country] = captureInputs();
  saveLastInputs(all);
}
/* подставить сохранённые поля в форму (форма уже отрисована для текущей страны) */
function applyFieldInputs(saved) {
  saved = saved || {};
  if (saved.age && $('#age')) {
    const opt = Array.prototype.some.call($('#age').options, o => o.value === saved.age);
    if (opt) $('#age').value = saved.age;
  }
  if ($('#volume'))   $('#volume').value   = saved.volumeCc != null ? saved.volumeCc : '';
  if ($('#power'))    $('#power').value     = saved.power != null ? saved.power : '';
  if ($('#carPrice')) $('#carPrice').value  = saved.carPrice != null ? saved.carPrice : '';
  if ($('#commission'))    $('#commission').value    = saved.commission != null ? saved.commission : '';
  if ($('#extraExpenses')) $('#extraExpenses').value = saved.extraExpenses != null ? saved.extraExpenses : '';
  if (state.country === 'kr') {
    // Корея: доставка и дилерские — дефолты из данных, если не вводились
    $('#deliveryWon').value = (saved.deliveryWon != null && saved.deliveryWon !== '')
      ? saved.deliveryWon : cfg.korea.defaultDeliveryWon;
    $('#dealerWon').value = (saved.dealerWon != null && saved.dealerWon !== '')
      ? saved.dealerWon : cfg.korea.defaultDealerWon;
    updateKrVatInfo();
  } else {
    if ($('#carCount')) $('#carCount').value = saved.carCount || '1';
    updateFreightEu();
  }
}
/* загрузить сохранённые поля выбранной страны в состояние + форму */
function loadInputsFor(country) {
  const saved = getLastInputs()[country] || {};
  state.logisticsCity = saved.city || '';
  state.powerUnit = saved.powerUnit || 'hp';
  return saved;
}

/* ============================ ИНИЦИАЛИЗАЦИЯ ============================ */
function init() {
  if (tg) {
    tg.ready(); tg.expand();
    // фирменный тёмный фон шапки/подложки Telegram под стиль Power Yard
    try { tg.setHeaderColor('#161616'); tg.setBackgroundColor('#161616'); } catch (e) {}
  }
  const saved0 = loadInputsFor(state.country);   // город / ед. мощности в state до рендера формы
  renderCountry();
  renderRatesPanel();
  bindEvents();
  applyFieldInputs(saved0);                       // подставить последние введённые поля
  syncPowerUnit();
  loadCbr();
  preloadBrandLogo();
  setupMainButton();
  setupKeyboardDone();
  setupEnterToCalc();
  hydrateFromCloud();   // подтянуть сохранённые курсы/настройки/поля из облака Telegram
}

/* подсветить активную единицу мощности (л.с./кВт) по состоянию */
function syncPowerUnit() {
  $$('.unit').forEach(x => x.classList.toggle('active', x.dataset.unit === state.powerUnit));
}

/* расчёт по нажатию Enter в любом поле ввода + авто-копирование полной картинки */
function setupEnterToCalc() {
  $('#screenCalc').addEventListener('keydown', async (e) => {
    if (e.key !== 'Enter') return;
    if (e.target && e.target.tagName === 'INPUT') {
      e.preventDefault();
      if (e.target.blur) e.target.blur();
      // расчёт и сразу в буфер картинкой с полным расчётом (с этапами оплаты).
      // Enter — пользовательский жест, поэтому запись в буфер обмена разрешена.
      if (onCalculate()) await copyCalcImage(true);
    }
  });
}

/* Курсы/настройки сохраняются в CloudStorage Telegram (переживают очистку кэша
   WebView и синхронизируются между устройствами). Подтягиваем и перерисовываем. */
async function hydrateFromCloud() {
  try {
    const cloud = await loadOverridesFromCloud();
    if (cloud) {
      mergeCloudOverrides(cloud);
      cfg = buildConfig();
      renderRatesPanel();
      renderExpenses();
    }
  } catch (e) {}
  // последние введённые поля из облака (локальные правки этой сессии — приоритетнее)
  try {
    const inputsCloud = await loadLastInputsFromCloud();
    if (!inputsCloud) return;
    const localBefore = getLastInputs();
    const hadLocal = !!localBefore[state.country];
    const merged = Object.assign({}, inputsCloud, localBefore);
    try { localStorage.setItem(LAST_INPUTS_KEY, JSON.stringify(merged)); } catch (e) {}
    if (!hadLocal) {
      const saved = loadInputsFor(state.country);
      renderExpenses();         // обновить город в строке логистики
      applyFieldInputs(saved);
      syncPowerUnit();
    }
  } catch (e) {}
}

/* --- кнопка «Рассчитать» --- */
function setupMainButton() {
  if (inTelegram) {
    try { tg.MainButton.setParams({ color: BRAND_COLOR, text_color: '#ffffff' }); } catch (e) {}
    tg.MainButton.setText('Рассчитать стоимость').show();
    tg.MainButton.onClick(onCalculate);
  } else {
    // в браузере — обычная кнопка
    const btn = document.createElement('button');
    btn.className = 'calc-btn';
    btn.textContent = 'Рассчитать стоимость';
    btn.addEventListener('click', onCalculate);
    $('#screenCalc').appendChild(btn);
  }
}

/* --- загрузка курсов ЦБ --- */
async function loadCbr() {
  const cache = getCbrCache();
  if (cache) showCbrStatus(cache);
  try {
    const fresh = await fetchCbr();
    cfg = buildConfig();
    showCbrStatus(fresh);
  } catch (e) {
    if (!cache) $('#cbrStatus').textContent = 'Курсы ЦБ: не удалось загрузить, используются сохранённые';
  }
}
function showCbrStatus(c) {
  const d = c.date ? new Date(c.date).toLocaleDateString('ru-RU') : '';
  $('#cbrStatus').textContent =
    `Курсы ЦБ ${d}: $ ${c.rates.USD} · € ${c.rates.EUR} · ₩1000 ${(c.rates.KRW * 1000).toFixed(2)}`;
}

/* ============================ РЕНДЕР ФОРМЫ ============================ */
function renderCountry() {
  const isKr = state.country === 'kr';
  // вкладки
  $$('#countryTabs .seg').forEach(b => b.classList.toggle('active', b.dataset.country === state.country));
  // валютная подпись и плейсхолдер цены
  $('#curLabel1').textContent = CUR[state.country];
  $('#carPrice').placeholder = PRICE_PLACEHOLDER[state.country];
  // Корея: доставка + дилерские + строка НДС; Европа: кол-во авто + фрахт
  $('#fieldDeliveryWon').classList.toggle('hidden', !isKr);
  $('#fieldDealerWon').classList.toggle('hidden', !isKr);
  $('#krVatInfo').classList.toggle('hidden', !isKr);
  $('#fieldCarCount').classList.toggle('hidden', isKr);
  $('#fieldFreight').classList.toggle('hidden', isKr);
  // объём — скрыт для электрокара
  $('#fieldVolume').classList.toggle('hidden', state.isElectric);
  // возраст
  renderAgeOptions();
  // Европа: подставить фрахт; Корея: обновить строку НДС
  if (isKr) updateKrVatInfo(); else updateFreightEu();
  // расходы по РФ из пресета
  renderExpenses();
}

/* панель «Курсы на сегодня» — все коммерческие курсы, сохраняются сразу при вводе */
function renderRatesPanel() {
  $('#rateList').innerHTML = ALL_RATE_FIELDS.map(f =>
    `<label>${f.label}<input type="text" inputmode="decimal" data-mrate="${f.key}" value="${String(cfg.rates.market[f.key]).replace('.', ',')}"></label>`
  ).join('');
  updateRateSummary();
}
function updateRateSummary() {
  const m = cfg.rates.market;
  $('#rateSummary').textContent = `₩/USDT ${m.KRW_USDT} · USDT ${m.USDT_RUB} ₽ · € ${m.EUR_SALE} ₽`;
}

/* Европа: фрахт по количеству авто (5 900 € за одиночное авто / 5 100 € при консолидации) */
function updateFreightEu() {
  const cnt = $('#carCount') ? Number($('#carCount').value) || 1 : 1;
  $('#freightEur').value = cnt === 1 ? cfg.europe.freightSingleEur : cfg.europe.freightGroupEur;
}

/* Корея: живая строка «НДС 9% · возврат 40% · к оплате» под полями цены */
function updateKrVatInfo() {
  const el = $('#krVatInfo');
  if (!el || state.country !== 'kr') return;
  const sum = num('#carPrice') + num('#deliveryWon') + num('#dealerWon');
  if (!sum) { el.textContent = 'НДС Кореи 9% и возврат 40% посчитаются автоматически.'; return; }
  const vat = sum * cfg.korea.vatPercent;
  const refund = vat * cfg.korea.vatRefundPercent;
  el.innerHTML = `НДС Кореи 9%: <b>${fmtNum(vat)} ₩</b> · возврат 40%: <b>−${fmtNum(refund)} ₩</b> · к оплате: <b>${fmtNum(sum - refund)} ₩</b>`;
}

function renderAgeOptions() {
  const opts = state.isElectric ? CALC_DATA.ageOptionsEv : CALC_DATA.ageOptions;
  $('#age').innerHTML = opts.map(o => `<option value="${o.id}">${o.label}</option>`).join('');
}

function renderExpenses() {
  const preset = currentPreset();
  const items = preset.items.slice();
  currentExpenseItems = items;
  const box = $('#expenseList');
  box.innerHTML = items.map((it, i) => {
    const row = `
    <div class="exp-item">
      <span class="exp-label">${it.label}</span>
      <input type="number" inputmode="numeric" data-exp="${i}" value="${it.value}">
    </div>`;
    // под «Логистика по РФ» — поле города доставки
    if (it.key === 'rf_logistics') {
      return row + `
    <div class="exp-item exp-city">
      <span class="exp-label">↳ Город доставки</span>
      <input type="text" id="logCity" inputmode="text" placeholder="напр. Москва" value="${escapeAttr(state.logisticsCity)}">
    </div>`;
    }
    return row;
  }).join('');
}

/* ============================ СОБЫТИЯ ============================ */
function bindEvents() {
  $$('#countryTabs .seg').forEach(b => b.addEventListener('click', () => {
    if (b.dataset.country === state.country) return;
    persistInputs();                            // сохранить поля уходящей страны
    state.country = b.dataset.country;
    haptic('light');
    const saved = loadInputsFor(state.country); // город / ед. мощности в state
    renderCountry();
    applyFieldInputs(saved);                     // подставить поля выбранной страны
    syncPowerUnit();
    hideResult();
  }));

  $('#isElectric').addEventListener('change', (e) => {
    state.isElectric = e.target.checked;
    // официальный расчёт акциза/утиля для EV — от кВт; для ДВС привычнее л.с.
    state.powerUnit = e.target.checked ? 'kw' : 'hp';
    syncPowerUnit();
    renderCountry();
    persistInputs();
    hideResult();
  });

  // Корея: живая строка НДС при вводе цены/доставки/дилерских
  ['#carPrice', '#deliveryWon', '#dealerWon'].forEach(sel => {
    $(sel).addEventListener('input', () => { if (state.country === 'kr') updateKrVatInfo(); });
  });

  // Европа: фрахт по количеству авто
  $('#carCount').addEventListener('change', () => {
    updateFreightEu();
    persistInputs();
    hideResult();
  });

  // панель «Курсы на сегодня»: сворачивание + сохранение сразу при вводе
  $('#rateToggle').addEventListener('click', () => {
    const open = $('#rateBody').classList.toggle('hidden');
    $('#rateChevron').textContent = open ? '▸' : '▾';
  });
  $('#rateList').addEventListener('change', (e) => {
    if (!e.target.dataset || e.target.dataset.mrate == null) return;
    const v = parseFloat((e.target.value || '').toString().replace(',', '.'));
    if (isNaN(v)) return;
    cfg.rates.market[e.target.dataset.mrate] = v;
    patchOverrides({ rates: { market: { [e.target.dataset.mrate]: v } } });
    updateRateSummary();
    haptic('light');
  });

  $$('.unit').forEach(u => u.addEventListener('click', () => {
    state.powerUnit = u.dataset.unit;
    syncPowerUnit();
    persistInputs();
  }));

  // запоминать последние введённые поля
  $('#screenCalc').addEventListener('change', (e) => {
    const t = e.target;
    if (t && t.matches && t.matches('#age, #volume, #power, #carPrice, #deliveryWon, #dealerWon, #carCount, #commission, #extraExpenses, #logCity')) {
      if (t.id === 'logCity') state.logisticsCity = t.value;
      persistInputs();
    }
  });
  // город логистики — держать state в синхроне (переживает перерисовку списка расходов)
  $('#expenseList').addEventListener('input', (e) => {
    if (e.target && e.target.id === 'logCity') state.logisticsCity = e.target.value;
  });

  // действия с расчётом (короткая версия — до этапов, полная — внизу)
  $('#result').addEventListener('click', async (e) => {
    if (!e.target.closest || !lastResult) return;
    const copyBtn = e.target.closest('#btnCopyShort, #btnCopyFull');
    const shareBtn = e.target.closest('#btnShareShort, #btnShareFull');
    if (copyBtn) {
      await copyCalcImage(copyBtn.id === 'btnCopyFull');
    }
    if (shareBtn) {
      const full = shareBtn.id === 'btnShareFull';
      haptic('medium');
      shareToChat(buildCopyText(lastResult, full), buildShareText(lastResult, full));
    }
  });

  // настройки
  $('#btnSettings').addEventListener('click', openSettings);
  $('#btnBack').addEventListener('click', closeSettings);
  $('#btnSaveSettings').addEventListener('click', saveSettings);
  $('#btnResetSettings').addEventListener('click', () => {
    if (confirm('Сбросить все ручные настройки к значениям по умолчанию?')) {
      resetOverrides(); cfg = buildConfig(); fillSettings(); renderCountry(); renderRatesPanel();
      toast('Сброшено');
    }
  });
  $('#btnRefreshCbr').addEventListener('click', async () => {
    try { const f = await fetchCbr(); cfg = buildConfig(); fillSettings(); showCbrStatus(f); toast('Курсы ЦБ обновлены'); }
    catch (e) { toast('Не удалось обновить курсы'); }
  });
}

/* плавающая кнопка «свернуть клавиатуру» — появляется при фокусе на поле ввода */
function setupKeyboardDone() {
  const btn = $('#kbDone');
  if (!btn) return;
  const vv = window.visualViewport;
  const reposition = () => {
    if (!vv) return;
    const gap = window.innerHeight - vv.height - vv.offsetTop; // высота клавиатуры
    btn.style.bottom = Math.max(12, gap + 10) + 'px';
  };
  document.addEventListener('focusin', (e) => {
    if (e.target && e.target.matches && e.target.matches('input')) {
      btn.classList.remove('hidden');
      reposition();
    }
  });
  document.addEventListener('focusout', () => {
    setTimeout(() => {
      const a = document.activeElement;
      if (!a || !a.matches || !a.matches('input')) btn.classList.add('hidden');
    }, 150);
  });
  if (vv) { vv.addEventListener('resize', reposition); vv.addEventListener('scroll', reposition); }
  // не забирать фокус у поля при нажатии
  btn.addEventListener('mousedown', (e) => e.preventDefault());
  btn.addEventListener('touchstart', (e) => e.preventDefault(), { passive: false });
  btn.addEventListener('click', () => {
    if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
    btn.classList.add('hidden');
  });
}

function haptic(style) { try { if (tg) tg.HapticFeedback.impactOccurred(style); } catch (e) {} }
function toast(msg) { if (tg && tg.showPopup) { try { tg.showPopup({ message: msg }); return; } catch(e){} } alert(msg); }

/* ============================ РАСЧЁТ ============================ */
function onCalculate() {
  haptic('medium');
  // свернуть клавиатуру, чтобы не мешала смотреть результат
  if (document.activeElement && document.activeElement.blur) document.activeElement.blur();

  // применить и сохранить коммерческие курсы, введённые на главном экране
  const ratePatch = { rates: { market: {} } };
  $$('#rateList [data-mrate]').forEach(el => {
    const v = parseFloat((el.value || '').toString().replace(',', '.'));
    if (!isNaN(v)) { cfg.rates.market[el.dataset.mrate] = v; ratePatch.rates.market[el.dataset.mrate] = v; }
  });
  if (Object.keys(ratePatch.rates.market).length) patchOverrides(ratePatch);

  const expenses = $$('#expenseList [data-exp]').map((el, i) => ({
    key: (currentExpenseItems[i] || {}).key,
    label: (currentExpenseItems[i] || {}).label || '',
    short: (currentExpenseItems[i] || {}).short || (currentExpenseItems[i] || {}).label || '',
    value: parseFloat(el.value) || 0,
  }));

  const powerVal = num('#power');
  const input = {
    country: state.country,
    isElectric: state.isElectric,
    age: $('#age').value,
    volumeCc: state.isElectric ? 0 : num('#volume'),
    powerHp: state.powerUnit === 'hp' ? powerVal : null,
    powerKw: state.powerUnit === 'kw' ? powerVal : null,
    carPrice: num('#carPrice'),
    deliveryWon: state.country === 'kr' ? num('#deliveryWon') : 0,
    dealerWon: state.country === 'kr' ? num('#dealerWon') : 0,
    carCount: state.country === 'eu' ? (Number($('#carCount').value) || 1) : 1,
    commission: num('#commission'),
    extraExpenses: num('#extraExpenses'),
    expenses,
    logisticsCity: ($('#logCity') ? $('#logCity').value : (state.logisticsCity || '')).trim(),
  };

  if (!input.carPrice) { toast('Укажите цену авто'); return; }
  if (!state.isElectric && !input.volumeCc) { toast('Укажите объём двигателя'); return; }
  if (!powerVal) { toast('Укажите мощность двигателя'); return; }

  persistInputs();   // запомнить последние введённые поля для этой страны
  const r = calculate(input, cfg);
  renderResult(r);
  return true;       // расчёт выполнен (используется для авто-копирования по Enter)
}

/* родительный падеж страны + флаг для подзаголовка */
const COUNTRY_GEN = { kr: 'Корее 🇰🇷', eu: 'Европе 🇪🇺' };
const COUNTRY_UP = { kr: 'КОРЕЕ', eu: 'ЕВРОПЕ' };
const FLAGS = { kr: '🇰🇷', eu: '🇪🇺' };

/* строка курса для экрана */
function rateDisplay(c, m) {
  if (c === 'kr') return `₩/USDT ${m.KRW_USDT} · USDT ${m.USDT_RUB} ₽`;
  if (c === 'eu') return `€ = ${m.EUR_SALE} ₽`;
  return '';
}
/* строка курса для копирования (компактная) */
function rateCopy(c, m) {
  if (c === 'kr') return `₩/USDT ${m.KRW_USDT}·${m.USDT_RUB}₽`;
  if (c === 'eu') return `€=${m.EUR_SALE}₽`;
  return '';
}

function renderResult(r) {
  const c = r.input.country;
  const m = cfg.rates.market;
  const cur = CUR[c];
  const rfBlock = r.expensesSum + r.commission + r.extraExpenses;

  const evRows = r.input.isElectric ? `
    <div class="row sub"><span class="k">Акциз (${Math.round(r.input.powerKw)} кВт)</span><span class="v">${fmt(r.excise)}</span></div>
    <div class="row sub"><span class="k">НДС ${Math.round(cfg.evVatPercent * 100)}%</span><span class="v">${fmt(r.vat)}</span></div>` : '';

  const expRows = r.expenses.filter(e => e.value > 0).map(e =>
    `<div class="row sub"><span class="k">${e.label}</span><span class="v">${fmt(e.value)}</span></div>`).join('');

  // s.label 4-го этапа содержит город (пользовательский ввод) — экранируем перед вставкой в innerHTML
  const stageRows = r.stages.filter(s => s.value > 0).map((s, i) =>
    `<div class="row"><span class="k">${i + 1}) ${escapeAttr(s.label)}</span><span class="v">${fmt(s.value)}</span></div>`).join('');

  // --- «утиль-ловушка»: предупреждение о пороге мощности (главный водораздел стоимости в 2026) ---
  const powerHpR = Math.round(r.input.powerHp || 0);
  let utilFlag = '';
  if (r.utilThresholdHp) {
    if (r.utilPreferentialApplied) {
      utilFlag = `<div class="util-flag" style="margin:4px 0 8px;padding:8px 10px;border-radius:8px;border-left:3px solid #27ae60;background:rgba(39,174,96,.10);font-size:12.5px;line-height:1.4">✅ <b>${powerHpR} л.с.</b> — в пределах льготного порога ${r.utilThresholdHp} л.с. Утильсбор льготный: <b style="color:#27ae60">${fmt(r.utilFee)}</b>.</div>`;
    } else {
      const overpay = Math.max(0, r.utilFee - r.utilPreferentialFee);
      utilFlag = `<div class="util-flag" style="margin:4px 0 8px;padding:8px 10px;border-radius:8px;border-left:3px solid #e74c3c;background:rgba(231,76,60,.10);font-size:12.5px;line-height:1.4">⚠️ <b>${powerHpR} л.с.</b> — выше льготного порога <b>${r.utilThresholdHp} л.с.</b> Утиль ${fmt(r.utilFee)} вместо льготных ${fmt(r.utilPreferentialFee)}. Переплата по утилю ≈ <b style="color:#e74c3c">${fmt(overpay)}</b>. Авто ≤${r.utilThresholdHp} л.с. попадает под льготу.</div>`;
    }
  }

  // --- страновой блок «расходы за границей» ---
  let foreignRows = '';
  if (c === 'kr') {
    foreignRows = `
    <div class="row sub"><span class="k">Цена авто</span><span class="v">${fmtNum(r.input.carPrice)} ${cur}</span></div>
    <div class="row sub"><span class="k">Доставка по Корее + фрахт</span><span class="v">${fmtNum(r.input.deliveryWon)} ${cur}</span></div>
    <div class="row sub"><span class="k">Дилерские расходы</span><span class="v">${fmtNum(r.input.dealerWon)} ${cur}</span></div>
    <div class="row sub"><span class="k">НДС Кореи ${Math.round(cfg.korea.vatPercent * 100)}%</span><span class="v">${fmtNum(r.koreanVatWon)} ${cur}</span></div>
    <div class="row sub"><span class="k">Возврат ${Math.round(cfg.korea.vatRefundPercent * 100)}% НДС</span><span class="v">−${fmtNum(r.vatRefundWon)} ${cur}</span></div>
    <div class="row sub"><span class="k">К оплате</span><span class="v">${fmtNum(r.payWon)} ${cur}</span></div>
    <div class="row sub"><span class="k">Курс</span><span class="v">${rateDisplay(c, m)}</span></div>
    <div class="row sub"><span class="k">В рублях (итого)</span><span class="v">${fmt(r.carCostRub)}</span></div>`;
  } else {
    foreignRows = `
    <div class="row sub"><span class="k">Цена авто</span><span class="v">${fmtNum(r.input.carPrice)} ${cur}</span></div>
    <div class="row sub"><span class="k">Фрахт (${r.carCount === 1 ? '1 авто' : 'консолидация'})</span><span class="v">${fmtNum(r.freightEur)} ${cur}</span></div>
    <div class="row sub"><span class="k">Курс</span><span class="v">${rateDisplay(c, m)}</span></div>
    <div class="row sub"><span class="k">В рублях (итого)</span><span class="v">${fmt(r.carCostRub)}</span></div>`;
  }

  $('#result').innerHTML = `
    <div class="total">
      <div class="label">ИТОГО «под ключ»</div>
      <div class="value">${fmt(r.grandTotal)}</div>
    </div>

    <div class="sec-head"><span>Расходы по ${COUNTRY_GEN[c]}</span><span class="sec-sum">${fmt(r.carCostRub)}</span></div>
    ${foreignRows}

    <div class="sec-head"><span>Таможенные платежи</span><span class="sec-sum">${fmt(r.customsTotal)}</span></div>
    <div class="row sub"><span class="k">Пошлина и таможенный сбор <span class="method-tag">(${r.dutyMethod})</span></span><span class="v">${fmt(r.duty + r.customsFee)}</span></div>
    ${evRows}
    <div class="row sub"><span class="k">Утильсбор (коэф. ${r.utilCoef})</span><span class="v">${fmt(r.utilFee)}</span></div>
    ${utilFlag}

    <div class="sec-head"><span>Услуги и расходы по РФ</span><span class="sec-sum">${fmt(rfBlock)}</span></div>
    ${expRows}
    <div class="row sub"><span class="k">Комиссия компании</span><span class="v">${fmt(r.commission)}</span></div>
    ${r.extraExpenses > 0 ? `<div class="row sub"><span class="k">Доп. расходы</span><span class="v">${fmt(r.extraExpenses)}</span></div>` : ''}
    ${r.logistics > 0 ? `
    <div class="sec-head"><span>🚚 Логистика по РФ${r.logisticsCity ? ' — ' + escapeAttr(r.logisticsCity) : ''}</span><span class="sec-sum">${fmt(r.logistics)}</span></div>` : ''}

    <div class="row grand"><span class="k">ИТОГО под ключ</span><span class="v">${fmt(r.grandTotal)}</span></div>

    <div class="actions-cap">Без этапов оплаты:</div>
    <div class="result-actions">
      <button class="copy-btn" id="btnCopyShort">📋 Копировать</button>
      <button class="copy-btn send-btn" id="btnShareShort">📤 В чат</button>
    </div>

    <div class="section-title">Этапы оплаты</div>
    ${stageRows}

    <div class="actions-cap">Полный расчёт (с этапами):</div>
    <div class="result-actions">
      <button class="copy-btn" id="btnCopyFull">📋 Копировать</button>
      <button class="copy-btn send-btn" id="btnShareFull">📤 В чат</button>
    </div>
  `;
  lastResult = r;
  $('#result').classList.remove('hidden');
  $('#result').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

/* --- строки расчёта с разметкой (kind) — общий источник для текста и картинки ---
 * kind: title | div | divh | head (подытог секции) | item | grand (итого) | blank */
function buildTableLines(r, withStages) {
  const ageShort = { '<3': '<3 лет', '3-5': '3-5 лет', '5-7': '5-7 лет', '>7': '>7 лет', '>3': '>3 лет' };
  const ageLabel = ageShort[r.input.age] || '';
  const params = r.input.isElectric
    ? `${ageLabel} · ${Math.round(r.input.powerKw)} кВт`
    : `${ageLabel} · ${fmtNum(r.input.volumeCc)} см³ · ${Math.round(r.input.powerHp)} л.с.`;

  const money = (n) => fmtNum(n).replace(/ /g, ' ') + ' ₽';
  const c = r.input.country;
  const mk = cfg.rates.market;
  const cur = CUR[c];

  // блоки расходов с подытогами
  const sections = [];
  let foreignItems;
  if (c === 'kr') {
    foreignItems = [
      ['  Цена авто', fmtNum(r.input.carPrice) + ' ' + cur],
      ['  Доставка+фрахт', fmtNum(r.input.deliveryWon) + ' ' + cur],
      ['  Дилерские', fmtNum(r.input.dealerWon) + ' ' + cur],
      ['  НДС Кореи 9%', fmtNum(r.koreanVatWon) + ' ' + cur],
      ['  Возврат 40% НДС', '−' + fmtNum(r.vatRefundWon) + ' ' + cur],
      ['  К оплате', fmtNum(r.payWon) + ' ' + cur],
      ['  Курс', rateCopy(c, mk)],
      ['  В рублях', money(r.carCostRub)],
    ];
  } else {
    foreignItems = [
      ['  Цена авто', fmtNum(r.input.carPrice) + ' ' + cur],
      [`  Фрахт (${r.carCount === 1 ? '1 авто' : 'консолид.'})`, fmtNum(r.freightEur) + ' ' + cur],
      ['  Курс', rateCopy(c, mk)],
      ['  В рублях', money(r.carCostRub)],
    ];
  }
  sections.push({ head: ['РАСХОДЫ ПО ' + COUNTRY_UP[c], money(r.carCostRub)], items: foreignItems });

  const customsItems = [['  Пошлина+сбор', money(r.duty + r.customsFee)]];
  if (r.input.isElectric) { customsItems.push(['  Акциз', money(r.excise)]); customsItems.push(['  НДС ' + Math.round(cfg.evVatPercent * 100) + '%', money(r.vat)]); }
  customsItems.push([`  Утиль (${r.utilCoef})`, money(r.utilFee)]);
  sections.push({ head: ['ТАМОЖНЯ', money(r.customsTotal)], items: customsItems });

  const rfItems = r.expenses.filter(e => e.value > 0).map(e => ['  ' + (e.short || e.label), money(e.value)]);
  rfItems.push(['  Комиссия', money(r.commission)]);
  if (r.extraExpenses > 0) rfItems.push(['  Доп. расходы', money(r.extraExpenses)]);
  sections.push({ head: ['РАСХОДЫ ПО РФ', money(r.expensesSum + r.commission + r.extraExpenses)], items: rfItems });

  // логистика по РФ — отдельным подытогом, город отдельной строкой
  if (r.logistics > 0) {
    const logItems = r.logisticsCity ? [['  Город', r.logisticsCity]] : [];
    sections.push({ head: ['ЛОГИСТИКА ПО РФ', money(r.logistics)], items: logItems });
  }

  // линии-разделители на всю ширину таблицы (копируется картинкой, поэтому длина не мешает)
  const W = 30;
  const line = (l, v) => (l.length + v.length + 1 > W) ? l + ' ' + v : l + ' '.repeat(W - l.length - v.length) + v;
  const thin = '─'.repeat(W);
  const heavy = '━'.repeat(W);

  const out = [];
  out.push({ text: '🚗 Power Yard — Расчёт авто', kind: 'title' });
  out.push({ text: `${FLAGS[c]} ${params}`, kind: 'title' });
  sections.forEach(sec => {
    out.push({ text: thin, kind: 'div' });
    out.push({ text: line(sec.head[0], sec.head[1]), kind: 'head' });
    out.push({ text: thin, kind: 'div' });
    sec.items.forEach(([l, v]) => out.push({ text: line(l, v), kind: 'item' }));
  });
  out.push({ text: heavy, kind: 'divh' });
  out.push({ text: line('ИТОГО ПОД КЛЮЧ', money(r.grandTotal)), kind: 'grand' });
  out.push({ text: heavy, kind: 'divh' });

  if (withStages !== false) {
    const stageLines = r.stages.filter(s => s.value > 0)
      .map((s, i) => `${i + 1}) ${s.short || s.label} — ${money(s.value)}`);
    out.push({ text: '', kind: 'blank' });
    out.push({ text: 'Этапы оплаты:', kind: 'item' });
    stageLines.forEach(s => out.push({ text: s, kind: 'item' }));
  }
  return out;
}

/* --- текст расчёта в код-блоке (для копирования текстом / отправки в Telegram) --- */
function buildCopyText(r, withStages) {
  return '```\n' + buildTableLines(r, withStages).map(o => o.text).join('\n') + '\n```';
}

/* --- отправка расчёта в чат ---
 * Если есть бэкенд бота — отправляем отформатированную таблицу (как при копировании)
 * через savePreparedInlineMessage + shareMessage. Иначе — чистый текст через t.me/share. */
async function shareToChat(tableText, shareText) {
  const tbl = tableText.replace(/```/g, '').replace(/^\s+|\s+$/g, ''); // таблица без ```
  if (BACKEND_URL && tg && tg.initData && tg.shareMessage &&
      tg.isVersionAtLeast && tg.isVersionAtLeast('8.0')) {
    try {
      const resp = await fetch(BACKEND_URL.replace(/\/$/, '') + '/prepare', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ initData: tg.initData, text: tbl }),
      });
      const data = await resp.json();
      if (data && data.id) { tg.shareMessage(data.id); return; }
    } catch (e) { /* упадём в запасной вариант ниже */ }
  }
  // запасной вариант: чистый формат через t.me/share
  const url = 'https://t.me/share/url?url=' + encodeURIComponent(shareText);
  if (tg && tg.openTelegramLink) tg.openTelegramLink(url);
  else if (navigator.share) navigator.share({ text: shareText }).catch(() => {});
  else window.open(url, '_blank');
}

/* --- текст для ОТПРАВКИ в чат (без код-блока: чистый список, читается в обычном шрифте) --- */
function buildShareText(r, withStages) {
  const c = r.input.country;
  const m = cfg.rates.market;
  const cur = CUR[c];
  const ageShort = { '<3': '<3 лет', '3-5': '3-5 лет', '5-7': '5-7 лет', '>7': '>7 лет', '>3': '>3 лет' };
  const params = r.input.isElectric
    ? `${ageShort[r.input.age] || ''} · ${Math.round(r.input.powerKw)} кВт`
    : `${ageShort[r.input.age] || ''} · ${fmtNum(r.input.volumeCc)} см³ · ${Math.round(r.input.powerHp)} л.с.`;
  const money = (n) => fmtNum(n) + ' ₽';

  let t = `🚗 Power Yard — Расчёт авто\n${FLAGS[c]} ${params}\n\n`;
  t += `📦 Расходы по ${COUNTRY_GEN[c]}: ${money(r.carCostRub)}\n`;
  t += `• Цена авто: ${fmtNum(r.input.carPrice)} ${cur}\n`;
  if (c === 'kr') {
    t += `• Доставка по Корее + фрахт: ${fmtNum(r.input.deliveryWon)} ${cur}\n`;
    t += `• Дилерские расходы: ${fmtNum(r.input.dealerWon)} ${cur}\n`;
    t += `• НДС Кореи 9%: ${fmtNum(r.koreanVatWon)} ${cur}, возврат 40%: −${fmtNum(r.vatRefundWon)} ${cur}\n`;
    t += `• К оплате: ${fmtNum(r.payWon)} ${cur}\n`;
  } else {
    t += `• Фрахт (${r.carCount === 1 ? '1 авто' : 'консолидация'}): ${fmtNum(r.freightEur)} ${cur}\n`;
  }
  t += `• Курс: ${rateCopy(c, m)}\n`;
  t += `• В рублях: ${money(r.carCostRub)}\n`;
  t += `\n🛃 Таможенные платежи: ${money(r.customsTotal)}\n`;
  t += `• Пошлина и таможенный сбор: ${money(r.duty + r.customsFee)}\n`;
  if (r.input.isElectric) { t += `• Акциз: ${money(r.excise)}\n• НДС ${Math.round(cfg.evVatPercent * 100)}%: ${money(r.vat)}\n`; }
  t += `• Утильсбор: ${money(r.utilFee)}\n`;
  t += `\n🇷🇺 Услуги и расходы по РФ: ${money(r.expensesSum + r.commission + r.extraExpenses)}\n`;
  r.expenses.filter(e => e.value > 0).forEach(e => { t += `• ${e.label}: ${money(e.value)}\n`; });
  t += `• Комиссия компании: ${money(r.commission)}\n`;
  if (r.extraExpenses > 0) t += `• Доп. расходы: ${money(r.extraExpenses)}\n`;
  if (r.logistics > 0) t += `\n🚚 Логистика по РФ${r.logisticsCity ? ' (' + r.logisticsCity + ')' : ''}: ${money(r.logistics)}\n`;
  t += `\n💰 ИТОГО ПОД КЛЮЧ: ${money(r.grandTotal)}\n`;
  if (withStages !== false) {
    t += `\nЭтапы оплаты:\n`;
    r.stages.filter(s => s.value > 0).forEach((s, i) => { t += `${i + 1}) ${s.label} — ${money(s.value)}\n`; });
  }
  return t;
}

/* --- таблица картинкой ---
 * В МАКС/WhatsApp нет моноширинного шрифта, поэтому текстовая таблица съезжает.
 * Рисуем её в PNG (моноширинный шрифт на canvas) — картинка выглядит ровно
 * в любом мессенджере. */
function renderTableToBlob(lines) {
  return new Promise((resolve) => {
    try {
      const scale = Math.min(3, Math.max(2, window.devicePixelRatio || 2));
      const fs = 30, lh = 42, padX = 30, padY = 28;
      const mono = '"SF Mono", Menlo, "DejaVu Sans Mono", "Courier New", ui-monospace, monospace';
      const fontFor = (bold) => `${bold ? 'bold ' : ''}${fs}px ${mono}`;
      // цвет и насыщенность по типу строки (фирменные цвета Power Yard)
      const isBold = (k) => k === 'head' || k === 'grand' || k === 'title';
      const colorFor = (k) =>
        k === 'title' ? BRAND_COLOR :  // заголовок — оранжевым
        k === 'head'  ? BRAND_DARK :   // подытоги секций — красным
        k === 'grand' ? BRAND_COLOR :  // итого под ключ — оранжевым
        k === 'div'   ? '#c2c7cf' :    // тонкие линии — светло-серым
        '#111111';                     // остальное — почти чёрным
      const meas = document.createElement('canvas').getContext('2d');
      let maxW = 0;
      lines.forEach(o => {
        meas.font = fontFor(isBold(o.kind));
        const w = meas.measureText(o.text).width; if (w > maxW) maxW = w;
      });
      const W = Math.ceil(maxW) + padX * 2;
      // чёрная шапка с логотипом Power Yard (если логотип загружен) — над таблицей
      const headerH = (brandLogoReady && brandLogo && brandLogo.width) ? 132 : 0;
      const H = headerH + lines.length * lh + padY * 2;
      const cv = document.createElement('canvas');
      cv.width = Math.round(W * scale);
      cv.height = Math.round(H * scale);
      const ctx = cv.getContext('2d');
      ctx.scale(scale, scale);
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, W, H);
      // шапка: чёрная плашка + логотип по центру, с сохранением пропорций
      if (headerH) {
        ctx.fillStyle = '#000000';
        ctx.fillRect(0, 0, W, headerH);
        const availH = headerH - 32, availW = W - padX * 2;
        const ratio = Math.min(availW / brandLogo.width, availH / brandLogo.height);
        const lw = brandLogo.width * ratio, lhh = brandLogo.height * ratio;
        try { ctx.drawImage(brandLogo, (W - lw) / 2, (headerH - lhh) / 2, lw, lhh); } catch (e) {}
      }
      ctx.textBaseline = 'top';
      lines.forEach((o, i) => {
        ctx.font = fontFor(isBold(o.kind));
        ctx.fillStyle = colorFor(o.kind);
        ctx.fillText(o.text, padX, headerH + padY + i * lh);
      });
      cv.toBlob((b) => resolve(b), 'image/png');
    } catch (e) { resolve(null); }
  });
}

/* --- скопировать текущий расчёт картинкой (с запасным вариантом текстом) ---
 * full=true — полный расчёт с этапами оплаты. */
async function copyCalcImage(full) {
  if (!lastResult) return false;
  // сначала пробуем картинкой (ровно в МАКС/WhatsApp), иначе — текстом
  const okImg = await copyTableAsImage(buildTableLines(lastResult, full));
  if (okImg) {
    haptic('medium');
    toast('✅ Таблица скопирована картинкой — вставьте в чат');
    return true;
  }
  const ok = await copyToClipboard(buildCopyText(lastResult, full));
  haptic(ok ? 'medium' : 'light');
  toast(ok ? '✅ Скопировано — вставьте в чат' : 'Не удалось скопировать');
  return ok;
}

async function copyTableAsImage(lines) {
  if (!window.ClipboardItem || !navigator.clipboard || !navigator.clipboard.write) return false;
  // Safari/iOS принимает Promise<Blob> в ClipboardItem прямо в обработчике клика
  try {
    await navigator.clipboard.write([new ClipboardItem({ 'image/png': renderTableToBlob(lines) })]);
    return true;
  } catch (e) {
    try {
      const blob = await renderTableToBlob(lines);
      if (!blob) return false;
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
      return true;
    } catch (e2) { return false; }
  }
}

/* --- копирование в буфер обмена с запасным вариантом --- */
async function copyToClipboard(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch (e) {
    try {
      const ta = document.createElement('textarea');
      ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
      document.body.appendChild(ta); ta.focus(); ta.select();
      const ok = document.execCommand('copy');
      document.body.removeChild(ta);
      return ok;
    } catch (e2) { return false; }
  }
}

function hideResult() { $('#result').classList.add('hidden'); }

/* ============================ НАСТРОЙКИ ============================ */
function openSettings() { fillSettings(); $('#screenCalc').classList.add('hidden'); $('#screenSettings').classList.remove('hidden'); if (inTelegram) tg.MainButton.hide(); }
function closeSettings() { $('#screenSettings').classList.add('hidden'); $('#screenCalc').classList.remove('hidden'); if (inTelegram) tg.MainButton.show(); }

function fillSettings() {
  $$('[data-rate]').forEach(el => {
    const [grp, key] = el.dataset.rate.split('.');
    el.value = String(cfg.rates[grp][key]).replace('.', ',');
    el.dataset.orig = el.value;   // запомнить исходное — чтобы сохранять только изменённое
  });
  $$('[data-ev]').forEach(el => { el.value = String(cfg[el.dataset.ev]).replace('.', ','); el.dataset.orig = el.value; });
}

function saveSettings() {
  const parseComma = (s) => parseFloat((s || '').toString().replace(',', '.'));
  const patch = { rates: { cbr: {}, market: {} } };
  // Сохраняем только ПОДПРАВЛЕННЫЕ поля. Иначе безусловная запись cbr-полей
  // навсегда «замораживает» курсы ЦБ: overrides применяются поверх свежего кэша ЦБ,
  // и ежедневная автозагрузка перестаёт влиять на расчёт.
  $$('[data-rate]').forEach(el => {
    if (el.value === el.dataset.orig) return;
    const [grp, key] = el.dataset.rate.split('.');
    const v = parseComma(el.value);
    if (!isNaN(v)) patch.rates[grp][key] = v;
  });
  $$('[data-ev]').forEach(el => {
    if (el.value === el.dataset.orig) return;
    const v = parseComma(el.value);
    if (!isNaN(v)) patch[el.dataset.ev] = v;
  });
  patchOverrides(patch);
  cfg = buildConfig();
  renderCountry();      // отразить новые ставки на главном экране
  renderRatesPanel();   // и панель курсов
  toast('Настройки сохранены');
  closeSettings();
}

document.addEventListener('DOMContentLoaded', init);
