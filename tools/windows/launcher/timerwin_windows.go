//go:build windows

package main

import (
	"net/url"
	"path/filepath"
	"runtime"
	"sync"

	webview2 "github.com/jchv/go-webview2"
)

var procSetWindowPos = user32.NewProc("SetWindowPos")

// timerWindow: a tela do cronometrista numa janela própria (WebView2), aberta
// pelo link "Cronômetro" do painel. Tamanho e posição ficam só nela.
type timerWindow struct {
	mu   sync.Mutex
	view webview2.WebView
	hwnd uintptr
}

var (
	timerWinMu sync.Mutex
	timerWin   *timerWindow
)

// openTimerWindow abre (ou reaproveita, já na sala nova) a janela do timer.
// Roda FORA da thread do painel e não a bloqueia: o painel segue processando
// mensagens enquanto o WebView2 do timer sobe (esperar aqui travava os dois).
// Qualquer falha vira log + navegador padrão; nunca derruba o app.
func (p *panelWindow) openTimerWindow(target string) {
	defer func() {
		if r := recover(); r != nil {
			p.app.log.Printf("janela do timer: pânico %v (abrindo no navegador)", r)
			openBrowser(target)
		}
	}()
	timerWinMu.Lock()
	defer timerWinMu.Unlock()
	if tw := timerWin; tw != nil {
		tw.mu.Lock()
		view, hwnd := tw.view, tw.hwnd
		tw.mu.Unlock()
		if view != nil {
			view.Dispatch(func() {
				view.Navigate(target)
				procShowWindow.Call(hwnd, swRestore)
				procSetForeground.Call(hwnd)
			})
			return
		}
	}
	x, y, w, h := p.timerBounds()
	tw := &timerWindow{}
	ready := make(chan bool, 1)
	go tw.run(p.app, target, x, y, w, h, ready)
	if !<-ready {
		p.app.log.Printf("janela do timer: WebView2 não abriu (abrindo no navegador)")
		openBrowser(target)
		return
	}
	timerWin = tw
}

func (tw *timerWindow) run(a *App, target string, x, y, w, h int, ready chan<- bool) {
	defer func() {
		if r := recover(); r != nil {
			a.log.Printf("janela do timer: pânico na thread da janela: %v", r)
			select {
			case ready <- false:
			default:
			}
		}
	}()
	// Janela e laço de mensagens na MESMA thread
	runtime.LockOSThread()
	view := webview2.NewWithOptions(webview2.WebViewOptions{
		AutoFocus: true,
		// Pasta própria: dois ambientes WebView2 na mesma pasta disputam o
		// mesmo processo do navegador.
		DataPath: filepath.Join(a.paths.Root, "webview-timer"),
		WindowOptions: webview2.WindowOptions{
			Title:  "Referee Lights · Timer",
			Width:  uint(w),
			Height: uint(h),
			IconId: 1,
		},
	})
	if view == nil {
		ready <- false
		return
	}
	hwnd := uintptr(view.Window())
	tw.mu.Lock()
	tw.view, tw.hwnd = view, hwnd
	tw.mu.Unlock()
	const swpNoZOrder = 0x0004
	procSetWindowPos.Call(hwnd, 0, uintptr(x), uintptr(y), uintptr(w), uintptr(h), swpNoZOrder)
	// Links de dentro do timer (se houver) vão para o navegador padrão
	_ = view.Bind("rlOpenExternal", func(u string) {
		if parsed, err := url.Parse(u); err == nil && (parsed.Scheme == "http" || parsed.Scheme == "https") {
			openBrowser(parsed.String())
		}
	})
	view.Init(externalLinksScript)
	view.Navigate(target)
	ready <- true
	view.Run()
	view.Destroy()
	timerWinMu.Lock()
	if timerWin == tw {
		timerWin = nil
	}
	timerWinMu.Unlock()
}
