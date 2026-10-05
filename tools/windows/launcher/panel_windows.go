//go:build windows

package main

import (
	"net/url"
	"path/filepath"
	"runtime"
	"strings"
	"sync"
	"unsafe"

	webview2 "github.com/jchv/go-webview2"
	"golang.org/x/sys/windows"
)

// Painel (/admin) numa janela própria: título e ícone do Referee Lights,
// botão na barra de tarefas, minimizar/maximizar/fechar do Windows. Usa o
// WebView2 (motor do Edge, já presente no Windows 10/11); sem ele, o painel
// abre no navegador como antes. As outras telas (display, timer, legenda,
// árbitros) sempre abrem no navegador padrão.
//
// Fechar (X) pergunta: Sim encerra o Referee Lights; Não esconde a janela
// (o app segue na bandeja, telas continuam conectadas).

var (
	user32             = windows.NewLazySystemDLL("user32.dll")
	procSetWindowLong  = user32.NewProc("SetWindowLongPtrW")
	procCallWindowPro  = user32.NewProc("CallWindowProcW")
	procShowWindow     = user32.NewProc("ShowWindow")
	procSetForeground  = user32.NewProc("SetForegroundWindow")
	procIsWindowVis    = user32.NewProc("IsWindowVisible")
	procIsIconic       = user32.NewProc("IsIconic")
	procLoadImage      = user32.NewProc("LoadImageW")
	procSendMessage    = user32.NewProc("SendMessageW")
	procDestroyWindow  = user32.NewProc("DestroyWindow")
	procGetSysMetrics  = user32.NewProc("GetSystemMetrics")
	procMessageBoxW    = user32.NewProc("MessageBoxW")
	procMonitorFromWin = user32.NewProc("MonitorFromWindow")
	procGetMonitorInfo = user32.NewProc("GetMonitorInfoW")
	procGetDpiForWin   = user32.NewProc("GetDpiForWindow")
)

const (
	gwlpWndProc   = ^uintptr(3) // -4
	wmClose       = 0x0010
	wmSetIcon     = 0x0080
	swHide        = 0
	swRestore     = 9
	swShow        = 5
	imageIcon     = 1
	lrDefaultSize = 0x40
	lrShared      = 0x8000
	smCxSmIcon    = 49
	smCySmIcon    = 50
)

type panelWindow struct {
	mu      sync.Mutex
	app     *App
	view    webview2.WebView
	hwnd    uintptr
	oldProc uintptr
	ready   chan bool
	onQuit  func()
}

var panel *panelWindow

// openPanel mostra a janela (criando na primeira vez). Sem WebView2, abre
// no navegador.
func (a *App) openPanel(onQuit func()) {
	if panel == nil {
		panel = &panelWindow{app: a, ready: make(chan bool, 1), onQuit: onQuit}
		go panel.run()
		if ok := <-panel.ready; !ok {
			a.log.Printf("WebView2 indisponível: painel no navegador")
			panel = nil
			openBrowser(a.adminURL())
		}
		return
	}
	panel.show()
}

func (p *panelWindow) run() {
	// A janela e o laço de mensagens precisam ficar na MESMA thread
	runtime.LockOSThread()
	// Janela reduzida e centralizada (não maximizada): 1440x900, ou 85% da
	// tela se ela for menor. A pessoa maximiza se quiser.
	sw, _, _ := procGetSysMetrics.Call(0) // SM_CXSCREEN
	sh, _, _ := procGetSysMetrics.Call(1) // SM_CYSCREEN
	width, height := uint(1440), uint(900)
	if lim := uint(float64(sw) * 0.85); sw > 0 && width > lim {
		width = lim
	}
	if lim := uint(float64(sh) * 0.85); sh > 0 && height > lim {
		height = lim
	}
	w := webview2.NewWithOptions(webview2.WebViewOptions{
		AutoFocus: true,
		DataPath:  filepath.Join(p.app.paths.Root, "webview"),
		WindowOptions: webview2.WindowOptions{
			Title:  "Referee Lights",
			Width:  width,
			Height: height,
			Center: true,
			IconId: 1, // ícone da classe da janela (barra de tarefas e Alt+Tab)
		},
	})
	if w == nil {
		p.ready <- false
		return
	}
	p.mu.Lock()
	p.view = w
	p.hwnd = uintptr(w.Window())
	p.mu.Unlock()
	p.setIcon()
	p.subclass()

	// Links para fora do painel (display, timer, legenda, árbitros, sites)
	// vão para o navegador padrão; o painel fica onde está.
	_ = w.Bind("rlOpenExternal", func(u string) {
		if parsed, err := url.Parse(u); err == nil && (parsed.Scheme == "http" || parsed.Scheme == "https") {
			// Timer: janela própria do Edge (estreita, altura da tela, à
			// esquerda); se o Edge não abrir, navegador padrão como antes.
			if isTimerURL(parsed) && p.openTimerWindow(parsed.String()) {
				return
			}
			openBrowser(parsed.String())
		}
	})
	w.Init(externalLinksScript)
	w.Navigate(p.app.adminURL())
	procSetForeground.Call(p.hwnd)
	p.ready <- true
	w.Run()
	w.Destroy()
}

const externalLinksScript = `(() => {
  const isPanel = (u) => u.origin === location.origin && u.pathname.replace(/^\/(pt-BR|en-US|es-ES)(?=\/)/, '').startsWith('/admin');
  document.addEventListener('click', (e) => {
    const a = e.target && e.target.closest ? e.target.closest('a[href]') : null;
    if (!a) return;
    const u = new URL(a.getAttribute('href'), location.href);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return;
    if (isPanel(u) && a.target !== '_blank') return;
    e.preventDefault();
    e.stopPropagation();
    window.rlOpenExternal(u.href);
  }, true);
  const open = window.open;
  window.open = (target) => {
    try { window.rlOpenExternal(new URL(String(target), location.href).href); return null; } catch { return open.apply(window, arguments); }
  };
})();`

type monitorInfo struct {
	cbSize    uint32
	rcMonitor windows.Rect
	rcWork    windows.Rect
	dwFlags   uint32
}

// openTimerWindow abre o timer no Edge em modo app, encostado à esquerda da
// área útil do monitor onde está o painel, na altura dela. O Edge mede a
// janela em pixels "lógicos": a área útil (pixels físicos) é convertida pela
// escala do monitor (DPI). Devolve false se não deu para abrir.
func (p *panelWindow) openTimerWindow(target string) bool {
	p.mu.Lock()
	hwnd := p.hwnd
	p.mu.Unlock()
	x, y, height := 0, 0, 0
	const monitorDefaultToNearest = 2
	if mon, _, _ := procMonitorFromWin.Call(hwnd, monitorDefaultToNearest); mon != 0 {
		mi := monitorInfo{cbSize: uint32(unsafe.Sizeof(monitorInfo{}))}
		if ok, _, _ := procGetMonitorInfo.Call(mon, uintptr(unsafe.Pointer(&mi))); ok != 0 {
			dpi := 96
			if procGetDpiForWin.Find() == nil {
				if d, _, _ := procGetDpiForWin.Call(hwnd); d != 0 {
					dpi = int(d)
				}
			}
			scale := func(v int32) int { return int(v) * 96 / dpi }
			x, y = scale(mi.rcWork.Left), scale(mi.rcWork.Top)
			height = scale(mi.rcWork.Bottom - mi.rcWork.Top)
		}
	}
	if height <= 0 {
		sh, _, _ := procGetSysMetrics.Call(1) // SM_CYSCREEN
		height = int(sh)
	}
	args := edgeAppArgs(target, filepath.Join(p.app.paths.Root, "timer-window"), x, y, timerWindowWidth, height)
	quoted := make([]string, len(args))
	for i, a := range args {
		quoted[i] = windows.EscapeArg(a)
	}
	if err := shellOpen("open", "msedge.exe", strings.Join(quoted, " "), windows.SW_SHOWNORMAL); err != nil {
		p.app.log.Printf("timer no Edge: %v (abrindo no navegador padrão)", err)
		return false
	}
	return true
}

func (p *panelWindow) setIcon() {
	var hinst windows.Handle
	_ = windows.GetModuleHandleEx(0, nil, &hinst)
	// go-winres grava o ícone do exe com o ID 1 (MAKEINTRESOURCE(1))
	const iconID = 1
	big, _, _ := procLoadImage.Call(uintptr(hinst), iconID, imageIcon, 0, 0, lrDefaultSize|lrShared)
	cx, _, _ := procGetSysMetrics.Call(smCxSmIcon)
	cy, _, _ := procGetSysMetrics.Call(smCySmIcon)
	small, _, _ := procLoadImage.Call(uintptr(hinst), iconID, imageIcon, cx, cy, lrShared)
	if big != 0 {
		procSendMessage.Call(p.hwnd, wmSetIcon, 1, big)
	}
	if small != 0 {
		procSendMessage.Call(p.hwnd, wmSetIcon, 0, small)
	}
}

// subclass intercepta o X (WM_CLOSE) para perguntar antes de encerrar.
func (p *panelWindow) subclass() {
	cb := windows.NewCallback(func(hwnd, msg, wp, lp uintptr) uintptr {
		if msg == wmClose {
			p.askClose()
			return 0
		}
		r, _, _ := procCallWindowPro.Call(p.oldProc, hwnd, msg, wp, lp)
		return r
	})
	old, _, _ := procSetWindowLong.Call(p.hwnd, gwlpWndProc, cb)
	p.oldProc = old
}

func (p *panelWindow) askClose() {
	t := p.app.t
	text, _ := windows.UTF16PtrFromString(t.ClosePanel)
	title, _ := windows.UTF16PtrFromString("Referee Lights")
	r, _, _ := procMessageBoxW.Call(p.hwnd, uintptr(unsafe.Pointer(text)), uintptr(unsafe.Pointer(title)), mbYesNo|mbIconWarning)
	if r == idYes {
		if p.onQuit != nil {
			go p.onQuit()
		}
		return
	}
	procShowWindow.Call(p.hwnd, swHide)
}

func (p *panelWindow) show() {
	p.mu.Lock()
	hwnd, view := p.hwnd, p.view
	p.mu.Unlock()
	if hwnd == 0 || view == nil {
		return
	}
	view.Dispatch(func() {
		vis, _, _ := procIsWindowVis.Call(hwnd)
		iconic, _, _ := procIsIconic.Call(hwnd)
		switch {
		case vis == 0:
			procShowWindow.Call(hwnd, swShow)
		case iconic != 0:
			procShowWindow.Call(hwnd, swRestore)
		}
		procSetForeground.Call(hwnd)
	})
}

// closePanel destrói a janela (saída do app).
func closePanel() {
	if panel == nil {
		return
	}
	panel.mu.Lock()
	hwnd, view := panel.hwnd, panel.view
	panel.mu.Unlock()
	if view != nil && hwnd != 0 {
		view.Dispatch(func() { procDestroyWindow.Call(hwnd) })
	}
}
