package main

import (
	"bytes"
	"fmt"
	"io"
	"log"
	"net/http"
	"os/exec"
	"sync"
	"time"
)

// Supervisor do node: sobe escondido, reinicia se cair (espera 1/2/5/10/30 s)
// e avisa uma vez quando há mais de 5 quedas em 2 minutos. Parar = pedido
// de desligamento ao server (grava fila/banco), 5 s de espera, e só então
// encerra à força.

var restartBackoff = []time.Duration{1 * time.Second, 2 * time.Second, 5 * time.Second, 10 * time.Second, 30 * time.Second}

const (
	crashWindow   = 2 * time.Minute
	crashLimit    = 5
	stableRun     = 60 * time.Second
	shutdownGrace = 5 * time.Second
)

type Supervisor struct {
	// EndSessions: no próximo Stop, pedir ao server que encerre todas as salas.
	EndSessions bool
	NodePath    string
	Script      string
	Dir         string
	Env         []string
	Port        int
	Token       string
	Output      io.Writer
	Log         *log.Logger

	// OnCrash: queda inesperada (código de saída, duração da execução).
	OnCrash func(exitErr error, ran time.Duration)
	// OnCrashLoop: mais de crashLimit quedas em crashWindow (uma vez por rajada).
	OnCrashLoop func()
	// OnStart: processo novo no ar (antes do /health).
	OnStart func(pid int)

	mu       sync.Mutex
	cmd      *exec.Cmd
	stopping bool
	done     chan struct{}
	crashes  []time.Time
	looped   bool
}

func (s *Supervisor) Start() {
	s.mu.Lock()
	s.stopping = false
	s.crashes = nil
	s.looped = false
	s.mu.Unlock()
	s.done = make(chan struct{})
	go s.loop()
}

func (s *Supervisor) loop() {
	defer close(s.done)
	attempt := 0
	for {
		s.mu.Lock()
		if s.stopping {
			s.mu.Unlock()
			return
		}
		cmd := exec.Command(s.NodePath, s.Script)
		cmd.Dir = s.Dir
		cmd.Env = s.Env
		cmd.Stdout = s.Output
		cmd.Stderr = s.Output
		// Filho do node (PowerShell do Key Relay) pode herdar a saída: sem
		// isto, Wait ficaria preso até ele terminar mesmo com o node morto.
		cmd.WaitDelay = 3 * time.Second
		configureChild(cmd)
		started := time.Now()
		err := cmd.Start()
		if err == nil {
			s.cmd = cmd
			afterChildStart(cmd, s.Log)
		}
		s.mu.Unlock()

		if err != nil {
			s.Log.Printf("falha ao iniciar node: %v", err)
			if s.OnCrash != nil {
				s.OnCrash(err, 0)
			}
		} else {
			s.Log.Printf("node iniciado (pid %d)", cmd.Process.Pid)
			if s.OnStart != nil {
				s.OnStart(cmd.Process.Pid)
			}
			err = cmd.Wait()
			s.mu.Lock()
			s.cmd = nil
			stopping := s.stopping
			s.mu.Unlock()
			if stopping {
				s.Log.Printf("node encerrado (%v)", err)
				return
			}
			ran := time.Since(started)
			s.Log.Printf("node caiu após %s: %v", ran.Round(time.Second), err)
			if err == nil {
				err = fmt.Errorf("saiu com código 0 sem pedido de parada")
			}
			if s.OnCrash != nil {
				s.OnCrash(err, ran)
			}
			if ran >= stableRun {
				attempt = 0
			}
		}

		s.registerCrash()
		wait := restartBackoff[min(attempt, len(restartBackoff)-1)]
		attempt++
		s.Log.Printf("reiniciando node em %s", wait)
		if s.sleepOrStop(wait) {
			return
		}
	}
}

func (s *Supervisor) registerCrash() {
	now := time.Now()
	s.mu.Lock()
	recent := s.crashes[:0]
	for _, t := range s.crashes {
		if now.Sub(t) <= crashWindow {
			recent = append(recent, t)
		}
	}
	s.crashes = append(recent, now)
	fire := len(s.crashes) > crashLimit && !s.looped
	if fire {
		s.looped = true
	}
	if len(s.crashes) <= 1 {
		s.looped = false
	}
	s.mu.Unlock()
	if fire && s.OnCrashLoop != nil {
		s.OnCrashLoop()
	}
}

func (s *Supervisor) sleepOrStop(d time.Duration) bool {
	deadline := time.Now().Add(d)
	for time.Now().Before(deadline) {
		s.mu.Lock()
		stopping := s.stopping
		s.mu.Unlock()
		if stopping {
			return true
		}
		time.Sleep(100 * time.Millisecond)
	}
	return false
}

// Stop pede desligamento ao server e espera; passou do prazo, encerra.
// Com EndSessions (fechar o app de propósito), o server encerra todas as
// salas antes de sair — nada fica guardado para reabrir.
func (s *Supervisor) Stop() {
	s.mu.Lock()
	if s.stopping {
		s.mu.Unlock()
		<-s.done
		return
	}
	s.stopping = true
	cmd := s.cmd
	s.mu.Unlock()

	if cmd != nil {
		requestShutdown(s.Port, s.Token, s.EndSessions)
		select {
		case <-s.done:
			return
		case <-time.After(shutdownGrace):
			s.Log.Printf("node não saiu em %s: encerrando à força", shutdownGrace)
			_ = cmd.Process.Kill()
		}
	}
	<-s.done
}

// PID do node atual (0 se não está rodando).
func (s *Supervisor) PID() int {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.cmd == nil || s.cmd.Process == nil {
		return 0
	}
	return s.cmd.Process.Pid
}

func requestShutdown(port int, token string, endSessions bool) {
	body := []byte("{}")
	if endSessions {
		body = []byte(`{"endSessions":true}`)
	}
	req, _ := http.NewRequest(http.MethodPost, fmt.Sprintf("http://127.0.0.1:%d/__launcher/shutdown", port), bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-Launcher-Token", token)
	client := &http.Client{Timeout: 2 * time.Second}
	if res, err := client.Do(req); err == nil {
		res.Body.Close()
	}
}

// waitHealthy: /health e /admin respondendo (API e telas no ar).
func waitHealthy(port int, timeout time.Duration) bool {
	client := &http.Client{Timeout: 2 * time.Second, CheckRedirect: func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse }}
	deadline := time.Now().Add(timeout)
	for time.Now().Before(deadline) {
		ok := true
		for _, path := range []string{"/health", "/admin"} {
			res, err := client.Get(fmt.Sprintf("http://127.0.0.1:%d%s", port, path))
			if err != nil {
				ok = false
				break
			}
			res.Body.Close()
			if res.StatusCode != http.StatusOK {
				ok = false
				break
			}
		}
		if ok {
			return true
		}
		time.Sleep(300 * time.Millisecond)
	}
	return false
}
