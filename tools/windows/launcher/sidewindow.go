package main

import (
	"fmt"
	"net/url"
	"regexp"
)

// Tela do cronometrista (timer) aberta pelo painel: em vez do navegador
// padrão (que não aceita tamanho de janela), o Edge em modo app — janela sem
// abas, estreita e na altura da tela, encostada à esquerda. É o mesmo
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

// edgeAppArgs monta a linha do Edge em modo app. Perfil próprio
// (--user-data-dir): processo separado, então tamanho e posição valem sempre,
// mesmo com o Edge da pessoa já aberto.
func edgeAppArgs(target, profileDir string, x, y, width, height int) []string {
	return []string{
		"--app=" + target,
		"--user-data-dir=" + profileDir,
		fmt.Sprintf("--window-position=%d,%d", x, y),
		fmt.Sprintf("--window-size=%d,%d", width, height),
		"--no-first-run",
		"--no-default-browser-check",
	}
}
