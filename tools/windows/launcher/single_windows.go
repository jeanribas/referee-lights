//go:build windows

package main

import (
	"errors"

	"golang.org/x/sys/windows"
)

// Instância única: mutex nomeado. A segunda execução não sobe nada: avisa a
// primeira por um evento nomeado ("abrir o navegador" ou "sair") e termina.
const (
	mutexName = `Local\RefereeLights.SingleInstance`
	openEvent = `Local\RefereeLights.Open`
	quitEvent = `Local\RefereeLights.Quit`
)

func acquireSingleInstance() (already bool, err error) {
	name, _ := windows.UTF16PtrFromString(mutexName)
	// O handle fica aberto até o processo terminar (o Windows libera)
	h, err := windows.CreateMutex(nil, false, name)
	if errors.Is(err, windows.ERROR_ALREADY_EXISTS) {
		// Fecha: um handle aberto aqui manteria o mutex vivo depois que a
		// outra instância saísse (troca de versão espera por isso)
		windows.CloseHandle(h)
		return true, nil
	}
	return false, err
}

func signalExisting(event string) error {
	name := openEvent
	if event == "quit" {
		name = quitEvent
	}
	n, _ := windows.UTF16PtrFromString(name)
	h, err := windows.OpenEvent(windows.EVENT_MODIFY_STATE, false, n)
	if err != nil {
		return err
	}
	defer windows.CloseHandle(h)
	return windows.SetEvent(h)
}

// watchInstanceEvents roda na primeira instância.
func watchInstanceEvents(onOpen, onQuit func()) error {
	o, _ := windows.UTF16PtrFromString(openEvent)
	q, _ := windows.UTF16PtrFromString(quitEvent)
	ho, err := windows.CreateEvent(nil, 0, 0, o)
	if err != nil {
		return err
	}
	hq, err := windows.CreateEvent(nil, 0, 0, q)
	if err != nil {
		return err
	}
	go func() {
		handles := []windows.Handle{ho, hq}
		for {
			r, err := windows.WaitForMultipleObjects(handles, false, windows.INFINITE)
			if err != nil {
				return
			}
			switch r {
			case windows.WAIT_OBJECT_0:
				onOpen()
			case windows.WAIT_OBJECT_0 + 1:
				onQuit()
				return
			}
		}
	}()
	return nil
}
