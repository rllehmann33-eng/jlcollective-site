/* JL Collective: the small interactive parts of the site.
   The approval demonstration, the three-screen tabs, the fee calculator.
   Hand-written; no framework. Nothing here stores or sends anything. */
(function () {
  'use strict';

  function money(n) { return '$' + n.toLocaleString('en-US'); }
  function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }

  /* 1. The approval demonstration: a proposed change waits for the visitor's decision,
        and every decision is added to a record that is never edited. */
  Array.prototype.forEach.call(document.querySelectorAll('[data-demo]'), function (demo) {
    var status = demo.querySelector('[data-status]');
    var rows = demo.querySelector('[data-rows]');
    var more = demo.querySelector('[data-more]');
    var live = demo.querySelector('[data-live]');
    var approve = demo.querySelector('[data-approve]');
    var decline = demo.querySelector('[data-decline]');
    var again = demo.querySelector('[data-again]');
    if (!status || !rows || !approve || !decline || !again) return;
    var count = 0;

    function now() { return new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }); }

    function decide(approved) {
      var t = now(), word = approved ? 'Approved' : 'Declined';
      demo.setAttribute('data-state', approved ? 'approved' : 'declined');
      status.textContent = word + ' by you at ' + t;
      approve.disabled = true; decline.disabled = true; again.hidden = false;
      var empty = rows.querySelector('.empty'); if (empty) rows.removeChild(empty);
      count += 1;
      var li = el('li', 'fresh');
      li.appendChild(el('span', 'r-no', String(count)));
      li.appendChild(el('span', 'r-what', 'Budget change, $42 to $49 a day'));
      li.appendChild(el('span', 'r-who', word + ' by you, ' + t));
      rows.insertBefore(li, rows.firstChild);            /* newest first; nothing is ever removed */
      if (more) { more.hidden = count <= 3; more.textContent = 'Showing the latest 3 of ' + count + '. Earlier rows stay on the record.'; }
      if (live) live.textContent = word + '. Added to the record as row ' + count + '.';
      again.focus();
    }

    approve.addEventListener('click', function () { decide(true); });
    decline.addEventListener('click', function () { decide(false); });
    again.addEventListener('click', function () {
      demo.setAttribute('data-state', 'waiting');
      status.textContent = 'Waiting for a name';
      approve.disabled = false; decline.disabled = false; again.hidden = true;
      if (live) live.textContent = 'The change is proposed again and waiting for a name.';
      approve.focus();
    });
  });

  /* 2. Three screens behind tabs. Without this script every panel simply shows, one after another. */
  Array.prototype.forEach.call(document.querySelectorAll('[data-tabs]'), function (box) {
    var list = box.querySelector('.viewer-tabs');
    if (!list) return;
    var tabs = Array.prototype.slice.call(list.querySelectorAll('button[aria-controls]'));
    var panels = tabs.map(function (t) { return document.getElementById(t.getAttribute('aria-controls')); });
    if (!tabs.length || panels.some(function (p) { return !p; })) return;
    list.hidden = false;
    list.setAttribute('role', 'tablist');

    function select(i, focus, byVisitor) {
      tabs.forEach(function (t, j) {
        var on = i === j;
        panels[j].classList.toggle('shown', on && !!byVisitor);
        t.setAttribute('role', 'tab');
        t.setAttribute('aria-selected', on ? 'true' : 'false');
        t.tabIndex = on ? 0 : -1;
        panels[j].setAttribute('role', 'tabpanel');
        panels[j].setAttribute('aria-labelledby', t.id);
        panels[j].tabIndex = 0;
        panels[j].hidden = !on;
      });
      if (focus) tabs[i].focus();
    }

    tabs.forEach(function (t, i) {
      t.addEventListener('click', function () { select(i, false, true); });
      t.addEventListener('keydown', function (e) {
        var n = tabs.length, j = null;
        if (e.key === 'ArrowRight') j = (i + 1) % n;
        else if (e.key === 'ArrowLeft') j = (i - 1 + n) % n;
        else if (e.key === 'Home') j = 0;
        else if (e.key === 'End') j = n - 1;
        if (j !== null) { e.preventDefault(); select(j, true, true); }
      });
    });
    select(0, false, false);
  });

  /* 3. The fee calculator: the published bands, nothing else. */
  var STOPS = [500, 750, 1000, 1500, 2000, 2500, 3000, 4000, 5000, 6000, 7500, 10000, 12500, 15000, 20000, 25000, 30000, 40000, 50000, 75000, 100000];
  var BANDS = [[1000, 2499, 900], [2500, 5999, 1250], [6000, 14999, 1750], [15000, 24999, 2500], [25000, 49999, 4000]];
  Array.prototype.forEach.call(document.querySelectorAll('[data-calc]'), function (c) {
    var range = c.querySelector('input[type="range"]');
    var outBudget = c.querySelector('[data-budget]');
    var outFee = c.querySelector('[data-fee]');
    var outBand = c.querySelector('[data-band]');
    if (!range || !outBudget || !outFee || !outBand) return;
    range.min = '0'; range.max = String(STOPS.length - 1); range.step = '1';

    function setFee(main, small) {
      outFee.textContent = main;
      if (small) { outFee.appendChild(document.createTextNode(' ')); outFee.appendChild(el('small', null, small)); }
    }

    function update() {
      var b = STOPS[Math.max(0, Math.min(STOPS.length - 1, parseInt(range.value, 10) || 0))];
      var top = b === STOPS[STOPS.length - 1];
      outBudget.textContent = money(b) + (top ? '+' : '');
      outBudget.appendChild(el('small', null, ' a month'));
      range.setAttribute('aria-valuetext', money(b) + (top ? ' or more' : '') + ' a month');
      if (b < 1000) {
        c.setAttribute('data-kind', 'small');
        setFee('Keep it in-house');
        outBand.textContent = 'Under about $1,000 a month in ad spend, we will usually tell you to keep it in-house.';
        return;
      }
      if (b >= 50000) {
        c.setAttribute('data-kind', 'quote');
        setFee('Quoted flat');
        outBand.textContent = 'At $50,000 a month and above, the proposal quotes one flat number.';
        return;
      }
      for (var i = 0; i < BANDS.length; i++) {
        if (b >= BANDS[i][0] && b <= BANDS[i][1]) {
          c.setAttribute('data-kind', 'band');
          setFee(money(BANDS[i][2]), 'a month');
          outBand.textContent = 'The same fee anywhere from ' + money(BANDS[i][0]) + ' to ' + money(BANDS[i][1]) + ' a month. Never a percentage.';
          return;
        }
      }
    }
    range.addEventListener('input', update);
    update();
  });
})();
