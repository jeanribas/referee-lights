package main

import (
	"net/url"
	"regexp"
)

// Tela do cronometrista (timer) aberta pelo painel: popup do próprio WebView2
// (script injetado em panel_windows.go), estreito e na altura da tela,
// encostado à esquerda — sem passar pelo navegador da pessoa. isTimerURL
// espelha a regra do script (teste em launcher_test.go).

// timerWindowWidth acompanha o TIMER_WINDOW_WIDTH do frontend.
const timerWindowWidth = 480

var localePrefix = regexp.MustCompile(`^/(pt-BR|en-US|es-ES)(/|$)`)

// isTimerURL: link para /timer (com ou sem prefixo de idioma).
func isTimerURL(u *url.URL) bool {
	if u == nil || (u.Scheme != "http" && u.Scheme != "https") {
		return false
	}
	path := localePrefix.ReplaceAllString(u.Path, "/")
	return path == "/timer" || path == "/timer/"
}
