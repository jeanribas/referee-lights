//go:build windows

package main

import (
	_ "embed"
	"flag"
	"fmt"
	"os"
	"path/filepath"
	"time"

	"fyne.io/systray"
)

//go:embed payload.tar.zst
var payload []byte

//go:embed icon.ico
var trayIcon []byte

func main() {
	quitFlag := flag.Bool("quit", false, "encerra a instância em execução")
	noBrowser := flag.Bool("no-browser", false, "não abre o navegador ao iniciar")
	postUpdate := flag.Bool("post-update", false, "primeira execução depois de uma troca de versão")
	rollback := flag.Bool("rollback", false, "versão nova falhou: esta (antiga) volta ao lugar")
	flag.Parse()
	if os.Getenv("RL_NO_BROWSER") == "1" {
		*noBrowser = true
	}

	already, err := acquireSingleInstance()
	// Troca de versão: a instância anterior está saindo; espera o mutex
	for i := 0; already && err == nil && (*postUpdate || *rollback) && i < 60; i++ {
		time.Sleep(250 * time.Millisecond)
		already, err = acquireSingleInstance()
	}
	if err != nil {
		showMessageSync("Referee Lights", err.Error())
		os.Exit(1)
	}
	if already {
		cmd := "open"
		if *quitFlag {
			cmd = "quit"
		}
		// A primeira instância pode estar criando os eventos neste instante
		for i := 0; i < 20; i++ {
			if signalExisting(cmd) == nil {
				return
			}
			time.Sleep(250 * time.Millisecond)
		}
		return
	}
	if *quitFlag {
		return // nada rodando
	}

	paths, err := resolvePaths()
	if err != nil {
		showMessageSync("Referee Lights", err.Error())
		os.Exit(1)
	}
	logFile, err := openRotating(filepath.Join(paths.Logs, "launcher.log"), 5<<20, 3)
	if err != nil {
		showMessageSync("Referee Lights", err.Error())
		os.Exit(1)
	}
	app := newApp(paths, logFile, *noBrowser || *postUpdate || *rollback)
	startKeepAwake(app.log)

	exe, _ := os.Executable()
	if *rollback {
		restored, err := rollbackFiles(paths, exe)
		if err != nil {
			app.log.Printf("rollback: %v", err)
		} else {
			app.log.Printf("versão anterior restaurada em %s", restored)
			exe = restored
		}
	}
	app.exePath = exe
	app.updater = newUpdater(app, exe)

	app.openPanelFn = func() { app.openPanel(func() { systray.Quit() }) }
	if err := watchInstanceEvents(
		func() { app.showPanel() },
		func() { systray.Quit() },
	); err != nil {
		app.log.Printf("eventos de instância: %v", err)
	}

	if err := app.Boot(payload, filepath.Dir(exe)); err != nil {
		app.log.Printf("falha ao iniciar: %v", err)
		showMessageSync("Referee Lights", fmt.Sprintf(app.T().StartFailed, err, paths.Logs))
		os.Exit(1)
	}

	go func() {
		<-app.exitReq
		systray.Quit()
	}()

	removeData := false
	systray.Run(func() { setupTray(app, &removeData) }, func() {
		closePanel()
		if removeData {
			app.RemoveDataAndQuit()
		} else {
			app.Quit()
		}
	})
}
