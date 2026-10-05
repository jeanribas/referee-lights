//go:build windows

package main

import (
	"log"
	"time"

	"golang.org/x/sys/windows"
)

// Enquanto o RefereeLights.exe estiver aberto, o Windows não apaga a tela nem
// entra em suspensão: o PC ligado na TV pelo HDMI fica no ar a competição
// inteira. É o mesmo pedido que players de vídeo fazem; sem ES_CONTINUOUS ele
// só zera os contadores de inatividade, então basta repetir de tempos em
// tempos e, ao fechar o exe, tudo volta ao normal sozinho. (Nas telas abertas
// por http na rede local a Wake Lock API do navegador não existe.)
const (
	esSystemRequired  = 0x00000001
	esDisplayRequired = 0x00000002
	keepAwakeEvery    = 30 * time.Second
)

func startKeepAwake(logger *log.Logger) {
	proc := windows.NewLazySystemDLL("kernel32.dll").NewProc("SetThreadExecutionState")
	if err := proc.Find(); err != nil {
		logger.Printf("manter acordado: %v", err)
		return
	}
	poke := func() bool {
		r, _, _ := proc.Call(uintptr(esSystemRequired | esDisplayRequired))
		return r != 0
	}
	if !poke() {
		logger.Printf("manter acordado: SetThreadExecutionState recusou")
		return
	}
	logger.Printf("manter acordado: tela e sistema não entram em descanso enquanto o exe estiver aberto")
	go func() {
		t := time.NewTicker(keepAwakeEvery)
		defer t.Stop()
		for range t.C {
			poke()
		}
	}()
}
