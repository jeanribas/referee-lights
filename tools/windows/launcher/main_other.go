//go:build !windows

package main

import (
	"flag"
	"fmt"
	"os"
	"os/signal"
	"path/filepath"
	"syscall"
)

// Modo de desenvolvimento: go run . --payload <arquivo.tar.zst>
// (payload montado com cmd/mkpayload incluindo um node desta plataforma).
func main() {
	payloadPath := flag.String("payload", "", "payload.tar.zst")
	noBrowser := flag.Bool("no-browser", false, "não abre o navegador")
	flag.Parse()
	payload, err := os.ReadFile(*payloadPath)
	if err != nil {
		fmt.Fprintln(os.Stderr, "payload:", err)
		os.Exit(2)
	}
	paths, err := resolvePaths()
	if err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
	logFile, err := openRotating(filepath.Join(paths.Logs, "launcher.log"), 5<<20, 3)
	if err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
	app := newApp(paths, logFile, *noBrowser)
	exe, _ := os.Executable()
	if err := app.Boot(payload, filepath.Dir(exe)); err != nil {
		fmt.Fprintln(os.Stderr, "falha ao iniciar:", err)
		os.Exit(1)
	}
	fmt.Printf("rodando em http://localhost:%d (dados em %s)\n", app.port, paths.Root)
	sig := make(chan os.Signal, 1)
	signal.Notify(sig, os.Interrupt, syscall.SIGTERM)
	<-sig
	app.Quit()
}
