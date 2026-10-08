/*
 * Referee Lights — base das telas universais (árbitro e display).
 *
 * Roda em QUALQUER navegador com JavaScript: celular Android antigo, iPhone
 * com iOS velho, navegador de TV que não atualiza. Por isso este arquivo é
 * escrito à mão em ES3/ES5 (var, function, sem arrow/const/let/template/
 * classes/Promise) e é servido como está, sem build. Não use sintaxe nova
 * aqui: o teste `es-check es5 public/compat/*.js` reprova.
 *
 * Conteúdo:
 *  - RL.features: classes no <html> para o CSS de compatibilidade
 *    (no-flexgap, no-cssvars)
 *  - RL.reportError: erros da tela para o servidor (mesmas regras do app)
 *  - RL.connect: cliente mínimo do protocolo do Socket.IO v4 (Engine.IO 4)
 *    por WebSocket e, sem WebSocket (ou se ele falhar), por HTTP (polling)
 *  - RL.lost: aviso global "Sem conexão" (mesmas regras do ConnectionLost)
 *  - RL.wakeLock: tela sempre acesa (Wake Lock ou vídeo, como o useWakeLock)
 *  - RL.trackPage / RL.trackClick
 */
(function (window, document) {
  'use strict';

  var RL = {};
  window.RL = RL;

  /* ---------------- utilidades ---------------- */

  function each(list, fn) {
    for (var i = 0; i < list.length; i++) fn(list[i], i);
  }

  function byId(id) {
    return document.getElementById(id);
  }

  function on(el, ev, fn) {
    if (el.addEventListener) el.addEventListener(ev, fn, false);
    else if (el.attachEvent) el.attachEvent('on' + ev, fn);
  }

  function hasClass(el, c) {
    return (' ' + el.className + ' ').indexOf(' ' + c + ' ') > -1;
  }

  function addClass(el, c) {
    if (!hasClass(el, c)) el.className = el.className ? el.className + ' ' + c : c;
  }

  function removeClass(el, c) {
    el.className = (' ' + el.className + ' ').replace(' ' + c + ' ', ' ').replace(/^\s+|\s+$/g, '');
  }

  /** Troca um conjunto de classes por outro (ex.: estado da conexão). */
  function swapClasses(el, remove, add) {
    var i;
    for (i = 0; i < remove.length; i++) removeClass(el, remove[i]);
    for (i = 0; i < add.length; i++) addClass(el, add[i]);
  }

  function query(name) {
    var re = new RegExp('[?&]' + name + '=([^&#]*)');
    var m = re.exec(window.location.search);
    if (!m) return '';
    try {
      return decodeURIComponent(m[1].replace(/\+/g, ' '));
    } catch (e) {
      return m[1];
    }
  }

  function now() {
    return new Date().getTime();
  }

  function readData() {
    var el = byId('rl-data');
    if (!el) return {};
    try {
      return JSON.parse(el.innerHTML);
    } catch (e) {
      return {};
    }
  }

  RL.each = each;
  RL.byId = byId;
  RL.on = on;
  RL.hasClass = hasClass;
  RL.addClass = addClass;
  RL.removeClass = removeClass;
  RL.swapClasses = swapClasses;
  RL.query = query;
  RL.now = now;
  RL.data = readData();

  /* ---------------- detecção de recursos ---------------- */

  RL.features = (function () {
    var html = document.documentElement;
    var flexGap = false;
    var cssVars = false;
    try {
      cssVars = !!(window.CSS && window.CSS.supports && window.CSS.supports('--a', '0'));
    } catch (e) {
      cssVars = false;
    }
    try {
      var box = document.createElement('div');
      box.style.display = 'flex';
      box.style.flexDirection = 'column';
      box.style.rowGap = '1px';
      box.style.position = 'absolute';
      box.style.visibility = 'hidden';
      box.appendChild(document.createElement('div'));
      box.appendChild(document.createElement('div'));
      (document.body || html).appendChild(box);
      flexGap = box.scrollHeight === 1;
      box.parentNode.removeChild(box);
    } catch (e) {
      flexGap = false;
    }
    if (!flexGap) addClass(html, 'no-flexgap');
    if (!cssVars) addClass(html, 'no-cssvars');
    return { flexGap: flexGap, cssVars: cssVars };
  })();

  /* ---------------- URLs da API ---------------- */

  var LOCAL_HOSTS = { localhost: 1, '127.0.0.1': 1, '0.0.0.0': 1, '::1': 1 };

  /** Mesma regra de lib/config.ts: URL vazia → padrão; localhost → host da página. */
  function resolveBase(envUrl) {
    var loc = window.location;
    if (!envUrl) return RL.data.defaultBase === 'origin'
      ? loc.protocol + '//' + loc.host
      : loc.protocol + '//' + loc.hostname + ':3333';
    var m = /^(https?:)\/\/([^\/:]+)(:\d+)?(.*)$/.exec(envUrl);
    if (!m) return envUrl;
    if (LOCAL_HOSTS[m[2]] && !LOCAL_HOSTS[loc.hostname]) {
      var proto = loc.protocol === 'https:' ? 'https:' : m[1];
      return proto + '//' + loc.hostname + (m[3] || '') + m[4];
    }
    return envUrl;
  }

  RL.apiBase = function () {
    return resolveBase(RL.data.apiUrl).replace(/\/$/, '');
  };
  RL.wsBase = function () {
    return resolveBase(RL.data.wsUrl).replace(/\/$/, '');
  };

  /* ---------------- HTTP ---------------- */

  function xhr(method, url, body, contentType, cb) {
    var req;
    try {
      req = new XMLHttpRequest();
    } catch (e) {
      if (cb) cb(0, '');
      return null;
    }
    var done = false;
    req.onreadystatechange = function () {
      if (req.readyState !== 4 || done) return;
      done = true;
      if (cb) cb(req.status, req.responseText);
    };
    try {
      req.open(method, url, true);
      if (contentType) req.setRequestHeader('Content-Type', contentType);
      req.send(body === undefined ? null : body);
    } catch (e2) {
      if (!done) {
        done = true;
        if (cb) cb(0, '');
      }
    }
    return req;
  }
  RL.xhr = xhr;

  function postJson(path, payload) {
    try {
      xhr('POST', RL.apiBase() + path, JSON.stringify(payload), 'application/json', null);
    } catch (e) {
      /* nunca quebra a tela */
    }
  }

  /* ---------------- erros da tela ---------------- */

  var sentErrors = {};
  var errorCount = 0;

  function currentScreen() {
    var parts = window.location.pathname.split('/');
    var out = [];
    each(parts, function (p) {
      if (p) out.push(p);
    });
    if (out[0] && /^[a-z]{2}-[A-Z]{2}$/.test(out[0])) out.shift();
    return out.slice(0, 2).join('/') || 'home';
  }

  /** Mesmo formato e limites de lib/error-report.ts (10 por página, sem repetir). */
  RL.reportError = function (kind, message, stack) {
    try {
      var key = kind + '|' + message;
      if (sentErrors[key] || errorCount >= 10) return;
      sentErrors[key] = 1;
      errorCount++;
      var room = query('roomId');
      var body = {
        kind: String(kind).slice(0, 64),
        message: String(message).slice(0, 300),
        screen: currentScreen()
      };
      if (stack) body.stack = String(stack).split('\n').slice(0, 6).join('\n').slice(0, 1000);
      if (room) body.roomId = room.slice(0, 16);
      postJson('/client-errors', body);
    } catch (e) {
      /* reportar erro nunca gera outro erro */
    }
  };

  window.onerror = function (message, source, line, col, error) {
    RL.reportError((error && error.name) || 'Error', String(message), error && error.stack);
    return false;
  };

  /* ---------------- métricas de página/clique ---------------- */

  RL.trackPage = function (locale) {
    // só onde o app normal também registra (web; o pacote não tem /track/page)
    if (!RL.data.trackPages) return;
    try {
      if (window.navigator.webdriver) return;
      if (/bot|crawler|spider|crawling|bingpreview|headless|lighthouse/i.test(window.navigator.userAgent)) return;
      var width = window.innerWidth || document.documentElement.clientWidth;
      var device = width < 768 ? 'mobile' : width < 1100 ? 'tablet' : 'desktop';
      var referrer = '';
      var m = /^https?:\/\/([^\/:]+)/.exec(document.referrer || '');
      if (m && m[1] !== window.location.hostname) referrer = m[1];
      postJson('/track/page', { path: window.location.pathname, device: device, locale: locale || '', referrer: referrer });
    } catch (e) {
      /* nunca quebra a tela */
    }
  };

  RL.trackClick = function (url) {
    postJson('/track/click', { url: url });
  };

  /* ---------------- cliente Socket.IO mínimo ---------------- */

  /*
   * Protocolo (Engine.IO 4 / Socket.IO 5), só texto:
   *   engine: 0 open · 1 close · 2 ping · 3 pong · 4 mensagem · 6 noop
   *   socket (dentro do 4): 0 connect · 1 disconnect · 2 evento · 3 ack · 4 connect_error
   *   ex.: "42" + id + '["evento",dados]' ; ack "43" + id + "[resposta]"
   * Polling: vários pacotes por resposta, separados por \x1e.
   */
  function Socket(base) {
    this.base = base;
    this.handlers = {};
    this.acks = {};
    this.ackId = 0;
    this.connected = false;
    this.closedByUser = false;
    this.attempts = 0;
    this.transport = null;
    this.reconnectTimer = null;
    this.preferPolling = !window.WebSocket;
  }

  Socket.prototype.on = function (ev, fn) {
    (this.handlers[ev] = this.handlers[ev] || []).push(fn);
  };

  Socket.prototype.fire = function (ev, a, b) {
    var list = this.handlers[ev];
    if (!list) return;
    for (var i = 0; i < list.length; i++) {
      try {
        list[i](a, b);
      } catch (e) {
        RL.reportError(e.name || 'Error', String(e.message || e), e.stack);
      }
    }
  };

  Socket.prototype.open = function () {
    var self = this;
    self.closedByUser = false;
    var transport = self.preferPolling ? new Polling(self) : new WS(self);
    self.transport = transport;
    transport.start();
  };

  /** Pacote do Engine.IO recebido (já separado). */
  Socket.prototype.onPacket = function (p) {
    var type = p.charAt(0);
    var data = p.slice(1);
    if (type === '0') {
      var info = {};
      try {
        info = JSON.parse(data);
      } catch (e) {
        info = {};
      }
      this.pingTimeoutMs = (info.pingInterval || 25000) + (info.pingTimeout || 20000);
      this.armPingWatch();
      this.transport.sid = info.sid;
      this.transport.send('40');
    } else if (type === '2') {
      this.armPingWatch();
      this.transport.send('3');
    } else if (type === '4') {
      this.onMessage(data);
    } else if (type === '1') {
      this.transport.fail('server close');
    }
  };

  Socket.prototype.armPingWatch = function () {
    var self = this;
    if (self.pingWatch) clearTimeout(self.pingWatch);
    self.pingWatch = setTimeout(function () {
      if (self.transport) self.transport.fail('ping timeout');
    }, self.pingTimeoutMs || 45000);
  };

  Socket.prototype.onMessage = function (msg) {
    var type = msg.charAt(0);
    var rest = msg.slice(1);
    var id = '';
    while (rest && rest.charAt(0) >= '0' && rest.charAt(0) <= '9') {
      id += rest.charAt(0);
      rest = rest.slice(1);
    }
    var payload = null;
    if (rest) {
      try {
        payload = JSON.parse(rest);
      } catch (e) {
        payload = null;
      }
    }
    if (type === '0') {
      this.connected = true;
      this.attempts = 0;
      this.fire('connect');
    } else if (type === '2' && payload && payload.length) {
      this.fire(payload[0], payload[1]);
    } else if (type === '3' && id && this.acks[id]) {
      var cb = this.acks[id];
      delete this.acks[id];
      cb(payload ? payload[0] : null);
    } else if (type === '4') {
      this.transport.fail((payload && payload.message) || 'connect_error');
    } else if (type === '1') {
      this.transport.fail('io server disconnect');
    }
  };

  Socket.prototype.emit = function (ev, payload, ack) {
    if (!this.transport) return;
    var args = payload === undefined ? [ev] : [ev, payload];
    var packet = '42';
    if (ack) {
      var id = String(++this.ackId);
      this.acks[id] = ack;
      packet += id;
    }
    this.transport.send(packet + JSON.stringify(args));
  };

  /** Transporte caiu: avisa e agenda reconexão (atraso crescente, até 5 s). */
  Socket.prototype.onTransportClosed = function (reason, neverOpened) {
    var self = this;
    if (self.pingWatch) clearTimeout(self.pingWatch);
    var wasConnected = self.connected;
    self.connected = false;
    self.transport = null;
    self.acks = {};
    if (wasConnected) self.fire('disconnect', reason);
    else self.fire('connect_error', reason);
    if (self.closedByUser) return;
    // WebSocket que nunca abriu (proxy, navegador com WebSocket quebrado):
    // tenta o HTTP comum a partir daí
    if (neverOpened && !self.preferPolling) self.preferPolling = true;
    self.attempts++;
    var delay = Math.min(5000, 1000 * Math.pow(1.5, self.attempts - 1));
    delay = delay * (0.5 + Math.random() * 0.5) + 250;
    self.reconnectTimer = setTimeout(function () {
      self.reconnectTimer = null;
      if (!self.closedByUser) self.open();
    }, delay);
  };

  Socket.prototype.close = function () {
    this.closedByUser = true;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    if (this.transport) this.transport.stop();
    this.transport = null;
    this.connected = false;
  };

  /* --- WebSocket --- */
  function WS(socket) {
    this.socket = socket;
    this.ws = null;
    this.opened = false;
    this.dead = false;
  }
  WS.prototype.start = function () {
    var self = this;
    var url = self.socket.base.replace(/^http/, 'ws') + '/socket.io/?EIO=4&transport=websocket';
    try {
      self.ws = new window.WebSocket(url);
    } catch (e) {
      self.fail('websocket error', true);
      return;
    }
    self.ws.onopen = function () {
      self.opened = true;
    };
    self.ws.onmessage = function (ev) {
      if (self.dead) return;
      self.socket.onPacket(String(ev.data));
    };
    self.ws.onclose = function () {
      self.fail('transport close');
    };
    self.ws.onerror = function () {
      self.fail('websocket error');
    };
  };
  WS.prototype.send = function (packet) {
    if (this.dead || !this.ws) return;
    try {
      this.ws.send(packet);
    } catch (e) {
      this.fail('transport error');
    }
  };
  WS.prototype.fail = function (reason) {
    if (this.dead) return;
    this.dead = true;
    try {
      if (this.ws) this.ws.close();
    } catch (e) {
      /* já fechado */
    }
    this.socket.onTransportClosed(reason, !this.opened);
  };
  WS.prototype.stop = function () {
    this.dead = true;
    try {
      if (this.ws) this.ws.close();
    } catch (e) {
      /* já fechado */
    }
  };

  /* --- HTTP (long-polling) --- */
  function Polling(socket) {
    this.socket = socket;
    this.sid = null;
    this.dead = false;
    this.queue = [];
    this.sending = false;
    this.pollReq = null;
  }
  Polling.prototype.url = function () {
    var u = this.socket.base + '/socket.io/?EIO=4&transport=polling&t=' + now().toString(36) + Math.floor(Math.random() * 1e6);
    if (this.sid) u += '&sid=' + encodeURIComponent(this.sid);
    return u;
  };
  Polling.prototype.start = function () {
    this.poll();
  };
  Polling.prototype.poll = function () {
    var self = this;
    if (self.dead) return;
    self.pollReq = xhr('GET', self.url(), undefined, null, function (status, text) {
      self.pollReq = null;
      if (self.dead) return;
      if (status !== 200) {
        self.fail('xhr poll error');
        return;
      }
      var packets = String(text).split('\x1e');
      for (var i = 0; i < packets.length; i++) {
        if (packets[i]) self.socket.onPacket(packets[i]);
        if (self.dead) return;
      }
      self.poll();
    });
  };
  Polling.prototype.send = function (packet) {
    if (this.dead) return;
    this.queue.push(packet);
    this.flush();
  };
  Polling.prototype.flush = function () {
    var self = this;
    if (self.sending || !self.queue.length || !self.sid || self.dead) {
      // antes do sid só o handshake pode sair; o resto espera
      if (!self.sid && self.queue.length && !self.sending) {
        setTimeout(function () {
          self.flush();
        }, 50);
      }
      return;
    }
    var body = self.queue.join('\x1e');
    self.queue = [];
    self.sending = true;
    xhr('POST', self.url(), body, 'text/plain;charset=UTF-8', function (status) {
      self.sending = false;
      if (self.dead) return;
      if (status !== 200) {
        self.fail('xhr post error');
        return;
      }
      self.flush();
    });
  };
  Polling.prototype.fail = function (reason) {
    if (this.dead) return;
    this.dead = true;
    try {
      if (this.pollReq) this.pollReq.abort();
    } catch (e) {
      /* já fechado */
    }
    this.socket.onTransportClosed(reason, !this.sid);
  };
  Polling.prototype.stop = function () {
    this.dead = true;
    try {
      if (this.pollReq) this.pollReq.abort();
    } catch (e) {
      /* já fechado */
    }
  };

  RL.Socket = Socket;

  /**
   * Sala: conecta, registra e mantém o estado — mesmo comportamento do
   * useRoomSocket (só envia depois do client:register aceito; erro de
   * registro encerra a conexão; 5 falhas seguidas viram erro reportado).
   */
  RL.connect = function (role, registration, handlers) {
    var socket = new Socket(RL.wsBase());
    var registered = false;
    var failed = 0;
    var room = {
      status: 'disconnected',
      error: null,
      state: null,
      send: function (ev, payload) {
        if (!socket.connected || !registered) return;
        socket.emit(ev, payload);
      }
    };

    function setStatus(s) {
      room.status = s;
      if (handlers.status) handlers.status(s, room.error);
    }

    socket.on('connect', function () {
      failed = 0;
      registered = false;
      registration.host = window.location.hostname;
      socket.emit('client:register', registration, function (res) {
        if (!res || res.error) {
          room.error = (res && res.error) || 'register_failed';
          socket.close();
          setStatus('disconnected');
          return;
        }
        registered = true;
        room.error = null;
        RL.tagSession(registration.roomId, role);
        setStatus('connected');
      });
    });
    socket.on('disconnect', function () {
      registered = false;
      setStatus('disconnected');
    });
    socket.on('connect_error', function (message) {
      room.error = message;
      failed++;
      if (failed === 5) RL.reportError('socket_connect_loop', role + ': ' + message);
      setStatus('disconnected');
    });
    socket.on('state:update', function (snapshot) {
      room.state = snapshot;
      if (handlers.state) handlers.state(snapshot);
    });

    setStatus('connecting');
    socket.open();
    room.socket = socket;
    return room;
  };

  /* ---------------- script de sessão (só onde o app normal também tem) ---------------- */

  var SESSION_SNIPPET = '(function(c,l,a,r,i,t,y){c[a]=c[a]||function(){(c[a].q=c[a].q||[]).push(arguments)};t=l.createElement(r);t.async=1;t.src="https://www.clarity.ms/tag/"+i;y=l.getElementsByTagName(r)[0];y.parentNode.insertBefore(t,y)})(window,document,"clarity","script","w1gy8xnf5m");';

  /** Mesmas tags do lib/session-tags.ts (linha do pacote): sala, tela, alvo. */
  RL.tagSession = function (roomId, role) {
    if (!RL.data.sessionTags) return;
    try {
      var c = window.clarity;
      if (typeof c !== 'function') return;
      c('set', 'room', roomId);
      c('set', 'role', role);
      c('set', 'target', RL.data.bundle ? 'bundle' : 'web');
    } catch (e) {
      /* tags nunca quebram a tela */
    }
  };

  function appendSessionScript() {
    if (byId('microsoft-clarity')) return;
    var s = document.createElement('script');
    s.id = 'microsoft-clarity';
    s.text = SESSION_SNIPPET;
    document.body.appendChild(s);
  }

  /**
   * Pacote: como o useBundleInlineCss do _app — copia cada CSS do mesmo host
   * para um <style> logo depois do <link> (o link fica: nenhuma mudança
   * visual) e só então carrega o script de sessão.
   */
  RL.bundleSessionScript = function () {
    var links = document.getElementsByTagName('link');
    var pending = 0;
    var finished = false;
    function done() {
      if (finished || pending > 0) return;
      finished = true;
      appendSessionScript();
    }
    for (var i = 0; i < links.length; i++) {
      (function (link) {
        if (link.rel !== 'stylesheet') return;
        var href = link.getAttribute('href') || '';
        if (/^[a-z]+:\/\//i.test(href) && href.indexOf(window.location.protocol + '//' + window.location.host) !== 0) return;
        pending++;
        xhr('GET', href, undefined, null, function (status, css) {
          pending--;
          if (status === 200 && css) {
            var base = href.replace(/[^\/]*$/, '');
            css = css.replace(/url\(\s*(['"]?)([^'")]+)\1\s*\)/g, function (m, q, ref) {
              if (/^(data:|https?:|\/|#)/i.test(ref)) return m;
              return 'url(' + q + base + ref + q + ')';
            });
            var style = document.createElement('style');
            style.setAttribute('data-inline-css', href);
            if (link.media) style.media = link.media;
            style.appendChild(document.createTextNode(css));
            link.parentNode.insertBefore(style, link.nextSibling);
          }
          done();
        });
      })(links[i]);
    }
    done();
  };

  /* ---------------- aviso "Sem conexão" ---------------- */

  /** Mesmas regras do components/ConnectionLost.tsx. */
  RL.lost = (function () {
    var timer = null;
    var shown = false;
    var everConnected = false;

    function render(text, withRetry) {
      var box = byId('rl-lost');
      if (!box) return;
      byId('rl-lost-text').innerHTML = '';
      byId('rl-lost-text').appendChild(document.createTextNode(text));
      byId('rl-lost-retry').style.display = withRetry ? '' : 'none';
      box.setAttribute('data-connection-lost', '');
      box.style.display = '';
    }

    function hide() {
      var box = byId('rl-lost');
      if (!box) return;
      box.style.display = 'none';
      box.removeAttribute('data-connection-lost');
    }

    return function update(status, error) {
      var t = RL.data.lost || {};
      var errors = RL.data.errors || {};
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
      if (status === 'connected') {
        everConnected = true;
        shown = false;
        hide();
        return;
      }
      if (error === 'room_not_found') {
        render(t.room, false);
        return;
      }
      if (error && errors[error]) {
        render(errors[error], false);
        return;
      }
      if (shown) {
        render(t.lost, true);
        return;
      }
      hide();
      timer = setTimeout(function () {
        shown = true;
        render(t.lost, true);
      }, everConnected ? 2000 : 6000);
    };
  })();

  /* ---------------- tela sempre acesa ---------------- */

  /** Mesmo comportamento do hooks/useWakeLock.ts: Wake Lock; sem ele, vídeo mudo em loop. */
  RL.wakeLock = function () {
    var sentinel = null;
    var video = null;
    var loop = null;
    var waitingGesture = false;
    var GESTURES = ['pointerdown', 'touchstart', 'mousedown', 'keydown', 'click'];

    function ensureVideo() {
      if (video) return video;
      video = byId('rl-nosleep');
      if (!video || !video.play) return null;
      video.muted = true;
      on(video, 'loadedmetadata', function () {
        if (video.duration <= 1) video.loop = true;
        else
          on(video, 'timeupdate', function () {
            if (video.currentTime > 0.5) video.currentTime = Math.random();
          });
      });
      return video;
    }

    function playVideo(onFail) {
      var v = ensureVideo();
      if (!v) return;
      var result;
      try {
        result = v.play();
      } catch (e) {
        onFail();
        return;
      }
      if (result && typeof result.then === 'function') {
        result.then(function () {
          startLoop();
        }, function () {
          onFail();
        });
      } else {
        startLoop();
      }
    }

    function startLoop() {
      if (loop) clearInterval(loop);
      loop = setInterval(function () {
        try {
          var r = video.play();
          if (r && r['catch']) r['catch'](function () {});
        } catch (e) {
          /* segue tentando */
        }
      }, 15000);
    }

    function retryOnGesture() {
      if (waitingGesture) return;
      waitingGesture = true;
      var handler = function () {
        if (!waitingGesture) return;
        waitingGesture = false;
        playVideo(retryOnGesture);
      };
      each(GESTURES, function (ev) {
        on(document, ev, handler);
      });
    }

    function request() {
      if (sentinel && !sentinel.released) return;
      var nav = window.navigator;
      if (nav.wakeLock && nav.wakeLock.request) {
        try {
          nav.wakeLock.request('screen').then(function (s) {
            sentinel = s;
          }, function () {
            playVideo(retryOnGesture);
          });
          return;
        } catch (e) {
          /* cai no vídeo */
        }
      }
      playVideo(retryOnGesture);
    }

    request();
    on(document, 'visibilitychange', function () {
      if (document.visibilityState === 'visible') request();
    });
    on(window, 'focus', request);
  };

  /* ---------------- idioma da sala ---------------- */

  /** A tela segue o idioma da sala (o admin troca para todas). */
  RL.followLocale = function (target) {
    var current = RL.data.locale;
    var locales = RL.data.locales || [];
    var defaultLocale = RL.data.defaultLocale;
    if (!target || target === current) return;
    var known = false;
    each(locales, function (l) {
      if (l === target) known = true;
    });
    if (!known) return;
    document.cookie = 'NEXT_LOCALE=' + target + '; path=/; max-age=31536000';
    var path = window.location.pathname;
    each(locales, function (l) {
      if (path === '/' + l) path = '/';
      else if (path.indexOf('/' + l + '/') === 0) path = path.slice(l.length + 1);
    });
    var prefix = target === defaultLocale ? '' : '/' + target;
    window.location.replace(prefix + (path === '/' && prefix ? '' : path) + window.location.search);
  };

  /* ---------------- tamanhos com clamp()/cqw em style inline ---------------- */

  var cssSupport = null;
  function modernCss() {
    if (cssSupport === null) {
      try {
        var C = window.CSS;
        cssSupport = !!(C && C.supports && C.supports('width', 'clamp(1px, 1cqw, 2px)') && C.supports('width', 'min(1px, 2px)'));
      } catch (e) {
        cssSupport = false;
      }
    }
    return cssSupport;
  }

  /** Mede o contêiner das unidades cq* (o <main> da tela, sem a escala). */
  function containerBox() {
    var main = document.getElementsByTagName('main')[0];
    var w = window.innerWidth || document.documentElement.clientWidth;
    var h = window.innerHeight || document.documentElement.clientHeight;
    if (main && main.offsetWidth) return { w: main.offsetWidth, h: main.offsetHeight || h };
    return { w: w, h: h };
  }

  /**
   * Avalia clamp/min/max/calc com px, rem, em, vw, vh, vmin, vmax e cq*,
   * devolvendo px. % não dá para saber aqui: devolve null (fica o original).
   */
  function evaluate(expr) {
    var vw = (window.innerWidth || document.documentElement.clientWidth) / 100;
    var vh = (window.innerHeight || document.documentElement.clientHeight) / 100;
    var box = null;
    var rem = 16;
    try {
      rem = parseFloat(window.getComputedStyle(document.documentElement).fontSize) || 16;
    } catch (e) {
      rem = 16;
    }
    var i = 0;
    var src = expr.replace(/\s+/g, ' ');

    function skip() {
      while (src.charAt(i) === ' ') i++;
    }
    function unit(n, u) {
      u = u.toLowerCase();
      if (u === '' || u === 'px') return n;
      if (u === 'rem' || u === 'em') return n * rem;
      if (u === 'vw' || u === 'dvw' || u === 'svw' || u === 'lvw') return n * vw;
      if (u === 'vh' || u === 'dvh' || u === 'svh' || u === 'lvh') return n * vh;
      if (u === 'vmin') return n * Math.min(vw, vh);
      if (u === 'vmax') return n * Math.max(vw, vh);
      if (u === 'cqw' || u === 'cqi') return n * (box || (box = containerBox())).w / 100;
      if (u === 'cqh' || u === 'cqb') return n * (box || (box = containerBox())).h / 100;
      throw new Error('unit ' + u);
    }
    function args() {
      var out = [];
      skip();
      if (src.charAt(i) !== '(') throw new Error('(');
      i++;
      for (;;) {
        out.push(sum());
        skip();
        var c = src.charAt(i++);
        if (c === ')') return out;
        if (c !== ',') throw new Error(',');
      }
    }
    function atom() {
      skip();
      var m = /^(clamp|min|max|calc)\b/i.exec(src.slice(i));
      if (m) {
        i += m[0].length;
        var a = args();
        var f = m[1].toLowerCase();
        if (f === 'calc') return a[0];
        if (f === 'min') return Math.min.apply(Math, a);
        if (f === 'max') return Math.max.apply(Math, a);
        return Math.max(a[0], Math.min(a[1], a[2]));
      }
      if (src.charAt(i) === '(') {
        i++;
        var v = sum();
        skip();
        i++;
        return v;
      }
      var n = /^(-?[\d.]+)([a-z%]*)/i.exec(src.slice(i));
      if (!n) throw new Error('num');
      i += n[0].length;
      return unit(parseFloat(n[1]), n[2]);
    }
    function product() {
      var v = atom();
      for (;;) {
        skip();
        var c = src.charAt(i);
        if (c === '*') {
          i++;
          v *= atom();
        } else if (c === '/') {
          i++;
          v /= atom();
        } else return v;
      }
    }
    function sum() {
      var v = product();
      for (;;) {
        skip();
        var c = src.charAt(i);
        if ((c === '+' || c === '-') && src.charAt(i + 1) === ' ') {
          i++;
          v = c === '+' ? v + product() : v - product();
        } else return v;
      }
    }
    var result = sum();
    skip();
    if (i !== src.length) throw new Error('fim');
    return result;
  }

  /**
   * Valor de style inline com clamp()/cqw (o pacote ES5 do display passa por
   * aqui). Navegador novo: o próprio texto, nada muda. Antigo: o px calculado.
   */
  RL.cssValue = function (value) {
    if (modernCss()) return value;
    try {
      return Math.round(evaluate(value) * 100) / 100 + 'px';
    } catch (e) {
      return value;
    }
  };

  /** Vibração curta ao tocar (como o useHapticFeedback). */
  RL.vibrate = function () {
    try {
      if (window.navigator.vibrate) window.navigator.vibrate([30]);
    } catch (e) {
      /* sem vibração */
    }
  };

  /** Toque/clique sem o atraso de 300 ms dos navegadores antigos. */
  RL.tap = function (el, fn) {
    var touched = false;
    on(el, 'touchend', function (ev) {
      if (el.disabled) return;
      touched = true;
      if (ev.preventDefault) ev.preventDefault();
      fn(ev);
      setTimeout(function () {
        touched = false;
      }, 600);
    });
    on(el, 'click', function (ev) {
      if (touched || el.disabled) return;
      fn(ev);
    });
  };

  /** Escala vertical para caber na tela (como o useViewportScale). */
  RL.fitHeight = function (el, designHeight) {
    function update() {
      var h = window.innerHeight || document.documentElement.clientHeight;
      var s = Math.min(h / designHeight, 1);
      var st = el.style;
      if (s < 1) {
        st.transformOrigin = st.webkitTransformOrigin = 'top left';
        st.transform = st.webkitTransform = 'scale(' + s + ')';
        st.width = 100 / s + '%';
        st.height = 100 / s + 'vh';
      } else {
        st.transformOrigin = st.webkitTransformOrigin = '';
        st.transform = st.webkitTransform = '';
        st.width = '';
        st.height = '';
      }
    }
    update();
    on(window, 'resize', update);
    on(window, 'orientationchange', update);
  };
})(window, document);
