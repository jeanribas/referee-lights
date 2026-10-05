package main

import (
	"net/url"
	"regexp"
)

// Tela do cronometrista (timer) aberta pelo painel: numa janela própria do
// app (WebView2, timerwin_windows.go), estreita e na altura da tela,
// encostada à esquerda — sem passar pelo navegador da pessoa (que guardaria
// esse tamanho e abriria as outras telas do mesmo jeito). É o mesmo
// comportamento que o "Cronômetro" do admin tem no navegador (window.open).

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
