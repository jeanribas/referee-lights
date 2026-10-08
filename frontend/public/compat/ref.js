/*
 * Referee Lights — console do árbitro (tela universal).
 * ES3/ES5 escrito à mão, sem build: ver o cabeçalho de rl.js.
 *
 * Mesma lógica da versão React (pages/ref/[judge].tsx até a 1.3.6):
 *  - GOOD LIFT: liga o branco (limpa cartões); tocar de novo desfaz
 *  - cartão: liga o vermelho + cartão; tocar no cartão ativo o remove (e o
 *    vermelho sai junto quando era o último)
 *  - árbitro central: iniciar / pausar / resetar o tempo oficial
 *  - botões desabilitados enquanto não está conectado
 */
(function (window, document, RL) {
  'use strict';

  var data = RL.data;
  var judge = data.judge;
  var roomId = RL.query('roomId');
  var token = RL.query('token');

  var ACTIVE = ['ring-4', 'ring-white/70'];
  var INACTIVE = ['opacity-80'];
  var START_ACTIVE = ['ring-4', 'ring-emerald-300/60'];
  var PAUSE_ACTIVE = ['ring-4', 'ring-amber-200/70'];
  var TONES = {
    connected: { dot: ['bg-emerald-400'], text: ['text-emerald-300'] },
    connecting: { dot: ['bg-amber-400', 'animate-pulse'], text: ['text-amber-200'] },
    disconnected: { dot: ['bg-red-500'], text: ['text-red-300'] }
  };

  function find(scope, name) {
    var all = scope.getElementsByTagName('*');
    var out = [];
    for (var i = 0; i < all.length; i++) {
      if (all[i].getAttribute && all[i].getAttribute('data-rl') === name) out.push(all[i]);
    }
    return out;
  }

  var root = RL.byId('rl-console');
  if (!root) return;

  if (!roomId || !token) {
    root.style.display = 'none';
    RL.byId('rl-missing').style.display = '';
    RL.trackPage(data.locale);
    return;
  }

  var validBtn = find(root, 'valid')[0];
  var cardBtns = find(root, 'card');
  var startBtn = find(root, 'start')[0];
  var pauseBtn = find(root, 'pause')[0];
  var resetBtn = find(root, 'reset')[0];
  var timeEl = find(root, 'time')[0];
  var statusEl = null;
  (function () {
    var spans = root.getElementsByTagName('span');
    for (var i = 0; i < spans.length; i++) {
      if (spans[i].getAttribute('data-connection')) {
        statusEl = spans[i];
        return;
      }
    }
  })();

  var room = null;
  var vote = null;
  var cards = [];
  var running = false;

  function setActive(btn, active, activeClasses) {
    if (!btn) return;
    RL.swapClasses(btn, active ? INACTIVE : activeClasses, active ? activeClasses : INACTIVE);
  }

  function hasCard(card) {
    for (var i = 0; i < cards.length; i++) if (cards[i] === card) return true;
    return false;
  }

  function render() {
    setActive(validBtn, vote === 'white', ACTIVE);
    RL.each(cardBtns, function (btn) {
      var card = Number(btn.getAttribute('data-card'));
      var active = hasCard(card);
      setActive(btn, active, ACTIVE);
      var text = active ? '✓' : btn.getAttribute('data-glyph');
      if (btn.innerHTML !== text) {
        btn.innerHTML = '';
        btn.appendChild(document.createTextNode(text));
      }
    });
    setActive(startBtn, running, START_ACTIVE);
    setActive(pauseBtn, !running, PAUSE_ACTIVE);
  }

  function formatSeconds(seconds) {
    var mins = Math.floor(seconds / 60);
    var secs = seconds % 60;
    return mins + ':' + (secs < 10 ? '0' : '') + secs;
  }

  function renderStatus(status) {
    if (!statusEl) return;
    var tone = TONES[status];
    statusEl.setAttribute('data-connection', status);
    var dot = statusEl.getElementsByTagName('span')[0];
    RL.each(['connected', 'connecting', 'disconnected'], function (s) {
      RL.swapClasses(statusEl, TONES[s].text, []);
      if (dot) RL.swapClasses(dot, TONES[s].dot, []);
    });
    RL.swapClasses(statusEl, [], tone.text);
    if (dot) RL.swapClasses(dot, [], tone.dot);
    // texto: último nó de texto do status
    var last = statusEl.lastChild;
    var label = (data.connection && data.connection[status]) || status;
    if (last && last.nodeType === 3) last.nodeValue = label;
    else statusEl.appendChild(document.createTextNode(label));

    var disabled = status !== 'connected';
    RL.each([validBtn, startBtn, pauseBtn, resetBtn].concat(cardBtns), function (btn) {
      if (btn) btn.disabled = disabled;
    });
  }

  function onState(state) {
    vote = (state.votes && state.votes[judge]) || null;
    cards = (state.cards && state.cards[judge]) || [];
    running = !!state.running;
    if (timeEl) {
      var text = formatSeconds(Math.round((state.timerMs || 0) / 1000));
      if (timeEl.innerHTML !== text) {
        timeEl.innerHTML = '';
        timeEl.appendChild(document.createTextNode(text));
      }
    }
    render();
    if (state.locale) RL.followLocale(state.locale);
  }

  function handleValid() {
    RL.vibrate();
    if (vote === 'white') {
      room.send('ref:vote', { vote: null });
      room.send('ref:card', { card: null });
      return;
    }
    room.send('ref:vote', { vote: 'white' });
    room.send('ref:card', { card: null });
  }

  function toggleCard(card) {
    RL.vibrate();
    if (hasCard(card)) {
      room.send('ref:card', { card: card });
      if (cards.length <= 1) room.send('ref:vote', { vote: null });
      return;
    }
    if (vote !== 'red') room.send('ref:vote', { vote: 'red' });
    room.send('ref:card', { card: card });
  }

  RL.tap(validBtn, handleValid);
  RL.each(cardBtns, function (btn) {
    RL.tap(btn, function () {
      toggleCard(Number(btn.getAttribute('data-card')));
    });
  });
  if (startBtn)
    RL.tap(startBtn, function () {
      RL.vibrate();
      room.send('timer:command', { action: 'start' });
    });
  if (pauseBtn)
    RL.tap(pauseBtn, function () {
      RL.vibrate();
      room.send('timer:command', { action: 'stop' });
    });
  if (resetBtn)
    RL.tap(resetBtn, function () {
      RL.vibrate();
      room.send('timer:command', { action: 'reset' });
    });

  RL.each(find(document, 'footer'), function (box) {
    RL.each(box.getElementsByTagName('a'), function (a) {
      RL.on(a, 'click', function () {
        var href = a.getAttribute('href') || '';
        RL.trackClick(href.indexOf('assist.com.br') > -1 ? 'https://assist.com.br' : href);
      });
    });
  });

  var fit = find(root, 'fit')[0];
  if (fit) RL.fitHeight(fit, data.designHeight);

  room = RL.connect(judge, { role: judge, roomId: roomId, token: token }, {
    status: function (status, error) {
      renderStatus(status);
      RL.lost(status, error);
    },
    state: onState
  });

  RL.wakeLock();
  RL.trackPage(data.locale);
  if (data.sessionScript === 'inline-css') RL.bundleSessionScript();
})(window, document, window.RL);
