//go:build !windows

package main

import (
	"fmt"
	"log"
	"os"
	"os/exec"
	"runtime"
)

// Fora do Windows o lançador só existe para desenvolvimento e testes: mesma
// lógica (extração, porta, migração, supervisor, fila de erros), sem bandeja.

const nodeExeName = "node"

func configureChild(*exec.Cmd)                  {}
func afterChildStart(*exec.Cmd, *log.Logger)    {}
func openBrowser(url string)                    { fmt.Println("abrir:", url) }
func showMessage(title, text string, warn bool) { fmt.Fprintf(os.Stderr, "[%s] %s\n", title, text) }
func showMessageSync(title, text string)        { showMessage(title, text, true) }
func userLanguage() string                      { return os.Getenv("LANG") }
func systemDescription() string {
	return fmt.Sprintf("%s %s; exe %s", runtime.GOOS, runtime.GOARCH, version)
}
