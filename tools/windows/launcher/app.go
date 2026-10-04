package main

import (
	"bufio"
	"crypto/rand"
	"encoding/hex"
	"errors"
	"fmt"
	"io/fs"
	"log"
	"net"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"
)

// Preenchidos no build (-ldflags -X).
var (
	version     = "dev"
	nodeVersion = "0"
)

type App struct {
	paths      Paths
	t          texts
	log        *log.Logger
	logFile    *rotatingFile
	serverLog  *rotatingFile
	errs       *errorQueue
	sup        *Supervisor
	appDir     string
	nodePath   string
	port       int
	token      string
	noBrowser  bool
	exePath    string
	updater    *Updater
	controlURL string

	quitOnce sync.Once
	quit     chan struct{}
	exitOnce sync.Once
	exitReq  chan struct{} // pedido para o processo sair (troca de versão)
}

func newApp(p Paths, logFile *rotatingFile, noBrowser bool) *App {
	return &App{
		paths:     p,
		t:         textsFor(userLanguage()),
		log:       log.New(logFile, "", log.LstdFlags),
		logFile:   logFile,
		errs:      newErrorQueue(p, systemDescription()),
		noBrowser: noBrowser,
		quit:      make(chan struct{}),
		exitReq:   make(chan struct{}),
	}
}

func (a *App) requestExit() { a.exitOnce.Do(func() { close(a.exitReq) }) }

func (a *App) adminURL() string { return fmt.Sprintf("http://localhost:%d/admin", a.port) }

// Boot extrai, migra, escolhe a porta e sobe o server. Erro aqui = o app não
// tem como funcionar (o chamador avisa a pessoa e sai).
func (a *App) Boot(payload []byte, exeDir string) error {
	a.log.Printf("Referee Lights %s (node %s) — %s", version, nodeVersion, systemDescription())

	started := time.Now()
	appDir, nodePath, err := ensureExtracted(payload, a.paths, version, nodeVersion, nodeExeName)
	if err != nil {
		kind := "extract_failed"
		if errors.Is(err, fs.ErrPermission) {
			// Antivírus segurando/bloqueando arquivo é a causa mais comum
			kind = "av_blocked"
		}
		a.errs.Record(kind, "extract", err.Error(), "")
		return err
	}
	a.appDir, a.nodePath = appDir, nodePath
	a.log.Printf("app em %s (pronto em %s)", appDir, time.Since(started).Round(time.Millisecond))

	if from, err := migrateOnFirstRun(a.paths, exeDir); err != nil {
		a.errs.Record("migrate_failed", "migrate", err.Error(), from)
		a.log.Printf("migração de %s falhou: %v", from, err)
	} else if from != "" {
		a.log.Printf("dados migrados de %s", from)
		showMessage("Referee Lights", fmt.Sprintf(a.t.Migrated, from), false)
	}

	port, changed, err := choosePort(a.paths, portFree)
	if err != nil {
		a.errs.Record("port_busy", "port", err.Error(), "")
		return err
	}
	a.port = port
	if changed {
		a.log.Printf("porta preferida ocupada: usando %d", port)
		a.errs.Record("port_busy", "port", fmt.Sprintf("porta preferida ocupada, usando %d", port), "")
		showMessage("Referee Lights", fmt.Sprintf(a.t.PortChanged, defaultPort, port), true)
	}

	a.token = randomToken()
	if a.updater != nil {
		if url, err := a.updater.serveControl(a.token); err == nil {
			a.controlURL = url
		} else {
			a.log.Printf("controle do atualizador: %v", err)
		}
	}
	serverLog, err := openRotating(filepath.Join(a.paths.Logs, "server.log"), 5<<20, 3)
	if err != nil {
		return err
	}
	a.serverLog = serverLog

	a.sup = &Supervisor{
		NodePath: nodePath,
		Script:   filepath.Join("dist", "index.js"),
		Dir:      filepath.Join(appDir, "server"),
		Env:      a.serverEnv(),
		Port:     port,
		Token:    a.token,
		Output:   serverLog,
		Log:      a.log,
		OnCrash: func(err error, ran time.Duration) {
			a.errs.Record("node_crash", "supervisor",
				fmt.Sprintf("node caiu após %s: %v", ran.Round(time.Second), err),
				tailLines(filepath.Join(a.paths.Logs, "server.log"), 20, 16<<10))
		},
		OnCrashLoop: func() {
			a.errs.Record("crash_loop", "supervisor", "mais de 5 quedas em 2 minutos", "")
			showMessage("Referee Lights", fmt.Sprintf(a.t.CrashLoop, a.paths.Logs), true)
		},
		OnStart: func(int) {
			go a.afterServerStart()
		},
	}
	a.sup.Start()
	cleanupOldApps(a.paths, appDir)
	go a.flushLoop()
	if a.updater != nil {
		cleanupUpdateLeftovers(a.exePath)
		go a.verifyPostUpdate(a.exePath)
		go a.updater.Run()
	}
	return nil
}

var firstStart sync.Once

func (a *App) afterServerStart() {
	if !waitHealthy(a.port, 90*time.Second) {
		a.log.Printf("server não respondeu em 90 s")
		a.errs.Record("health_timeout", "supervisor", "server não respondeu /health e /admin em 90 s",
			tailLines(filepath.Join(a.paths.Logs, "server.log"), 20, 16<<10))
		return
	}
	a.log.Printf("server no ar em http://localhost:%d", a.port)
	firstStart.Do(func() {
		if !a.noBrowser {
			openBrowser(a.adminURL())
		}
	})
	a.errs.Flush(a.port, a.token)
}

func (a *App) flushLoop() {
	ticker := time.NewTicker(60 * time.Second)
	defer ticker.Stop()
	for {
		select {
		case <-a.quit:
			return
		case <-ticker.C:
			if a.errs.Len() > 0 && a.sup.PID() != 0 {
				a.errs.Flush(a.port, a.token)
			}
		}
	}
}

// serverEnv: ambiente atual + config.env (opcional, sobrevive a
// atualizações) + o que o lançador controla (porta, pastas, token).
func (a *App) serverEnv() []string {
	env := map[string]string{}
	order := []string{}
	set := func(k, v string) {
		if _, ok := env[k]; !ok {
			order = append(order, k)
		}
		env[k] = v
	}
	for _, kv := range os.Environ() {
		if k, v, ok := strings.Cut(kv, "="); ok && k != "" {
			set(k, v)
		}
	}
	for k, v := range readConfigEnv(a.paths.Config) {
		set(k, v)
	}
	set("PORT", fmt.Sprint(a.port))
	set("DATA_DIR", a.paths.Data)
	set("FRONTEND_DIR", filepath.Join(a.appDir, "frontend"))
	set("LAUNCHER_TOKEN", a.token)
	set("RL_LAUNCHER_VERSION", version)
	if a.controlURL != "" {
		set("LAUNCHER_CONTROL_URL", a.controlURL)
	}
	out := make([]string, 0, len(order))
	for _, k := range order {
		out = append(out, k+"="+env[k])
	}
	return out
}

func readConfigEnv(path string) map[string]string {
	out := map[string]string{}
	f, err := os.Open(path)
	if err != nil {
		return out
	}
	defer f.Close()
	sc := bufio.NewScanner(f)
	for sc.Scan() {
		line := strings.TrimSpace(sc.Text())
		if line == "" || strings.HasPrefix(line, "#") {
			continue
		}
		if k, v, ok := strings.Cut(line, "="); ok {
			out[strings.TrimSpace(k)] = strings.Trim(strings.TrimSpace(v), `"`)
		}
	}
	return out
}

// Restart: para e sobe o server de novo (usado após importar dados).
func (a *App) Restart() {
	a.sup.Stop()
	a.sup.Start()
}

func (a *App) Quit() {
	a.quitOnce.Do(func() {
		a.log.Printf("saindo")
		if a.sup != nil {
			a.sup.Stop()
		}
		if a.updater != nil {
			a.updater.OnQuit()
		}
		close(a.quit)
		if a.serverLog != nil {
			_ = a.serverLog.Close()
		}
	})
}

// RemoveDataAndQuit: "Remover dados e sair" da bandeja.
func (a *App) RemoveDataAndQuit() {
	a.Quit()
	_ = a.logFile.Close()
	_ = os.RemoveAll(a.paths.Root)
}

func (a *App) ImportFrom(dir string) (string, error) {
	a.sup.Stop()
	defer a.sup.Start()
	return importLegacy(a.paths, dir)
}

// lanAddresses: IPv4 privados da máquina (o que vai nos QR codes).
func lanAddresses(port int) []string {
	var out []string
	ifaces, err := net.Interfaces()
	if err != nil {
		return out
	}
	for _, iface := range ifaces {
		if iface.Flags&net.FlagUp == 0 || iface.Flags&net.FlagLoopback != 0 {
			continue
		}
		addrs, _ := iface.Addrs()
		for _, addr := range addrs {
			ipnet, ok := addr.(*net.IPNet)
			if !ok {
				continue
			}
			ip := ipnet.IP.To4()
			if ip == nil || !ip.IsPrivate() {
				continue
			}
			out = append(out, fmt.Sprintf("http://%s:%d", ip, port))
		}
	}
	return out
}

func randomToken() string {
	b := make([]byte, 24)
	_, _ = rand.Read(b)
	return hex.EncodeToString(b)
}
