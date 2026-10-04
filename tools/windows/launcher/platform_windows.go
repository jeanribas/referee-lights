//go:build windows

package main

import (
	"fmt"
	"log"
	"os/exec"
	"runtime"
	"sync"
	"syscall"
	"unsafe"

	"golang.org/x/sys/windows"
)

const nodeExeName = "node.exe"

// node sem console (o lançador é GUI: sem CREATE_NO_WINDOW o Windows abriria
// uma janela preta para o node). Os filhos dele (PowerShell do Key Relay) já
// saem com windowsHide.
func configureChild(cmd *exec.Cmd) {
	cmd.SysProcAttr = &syscall.SysProcAttr{HideWindow: true, CreationFlags: windows.CREATE_NO_WINDOW}
}

var (
	jobOnce sync.Once
	job     windows.Handle
)

// Job Object com KILL_ON_JOB_CLOSE: se o lançador morrer (fechado pelo
// gerenciador de tarefas, crash), o Windows encerra o node e os filhos
// junto — nada de node órfão segurando a porta.
func afterChildStart(cmd *exec.Cmd, logger *log.Logger) {
	jobOnce.Do(func() {
		h, err := windows.CreateJobObject(nil, nil)
		if err != nil {
			logger.Printf("job object: %v", err)
			return
		}
		info := windows.JOBOBJECT_EXTENDED_LIMIT_INFORMATION{
			BasicLimitInformation: windows.JOBOBJECT_BASIC_LIMIT_INFORMATION{
				LimitFlags: windows.JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE,
			},
		}
		if _, err := windows.SetInformationJobObject(h, windows.JobObjectExtendedLimitInformation,
			uintptr(unsafe.Pointer(&info)), uint32(unsafe.Sizeof(info))); err != nil {
			logger.Printf("job object (limites): %v", err)
			windows.CloseHandle(h)
			return
		}
		job = h
	})
	if job == 0 || cmd.Process == nil {
		return
	}
	ph, err := windows.OpenProcess(windows.PROCESS_SET_QUOTA|windows.PROCESS_TERMINATE, false, uint32(cmd.Process.Pid))
	if err != nil {
		logger.Printf("job object (abrir processo): %v", err)
		return
	}
	defer windows.CloseHandle(ph)
	if err := windows.AssignProcessToJobObject(job, ph); err != nil {
		logger.Printf("job object (associar): %v", err)
	}
}

func shellOpen(verb, file, args string, show int32) error {
	v, _ := windows.UTF16PtrFromString(verb)
	f, _ := windows.UTF16PtrFromString(file)
	var a *uint16
	if args != "" {
		a, _ = windows.UTF16PtrFromString(args)
	}
	return windows.ShellExecute(0, v, f, a, nil, show)
}

func openBrowser(url string) { _ = shellOpen("open", url, "", windows.SW_SHOWNORMAL) }

func openFolder(dir string) { _ = shellOpen("open", dir, "", windows.SW_SHOWNORMAL) }

const (
	mbOK          = 0x0
	mbYesNo       = 0x4
	mbIconWarning = 0x30
	mbIconInfo    = 0x40
	mbTopMost     = 0x40000
	idYes         = 6
)

func messageBox(title, text string, style uint32) int32 {
	t, _ := windows.UTF16PtrFromString(text)
	c, _ := windows.UTF16PtrFromString(title)
	ret, _ := windows.MessageBox(0, t, c, style|mbTopMost)
	return ret
}

// showMessage não bloqueia (o lançador segue funcionando com o aviso aberto).
func showMessage(title, text string, warn bool) {
	style := uint32(mbOK | mbIconInfo)
	if warn {
		style = mbOK | mbIconWarning
	}
	go messageBox(title, text, style)
}

func showMessageSync(title, text string) {
	messageBox(title, text, mbOK|mbIconWarning)
}

func confirm(title, text string) bool {
	return messageBox(title, text, mbYesNo|mbIconWarning) == idYes
}

func userLanguage() string {
	langs, err := windows.GetUserPreferredUILanguages(windows.MUI_LANGUAGE_NAME)
	if err != nil || len(langs) == 0 {
		return "en"
	}
	return langs[0]
}

func systemDescription() string {
	v := windows.RtlGetVersion()
	return fmt.Sprintf("Windows %d.%d.%d %s; exe %s", v.MajorVersion, v.MinorVersion, v.BuildNumber, runtime.GOARCH, version)
}

// Regra de entrada para o node.exe (caminho estável em runtime\). Pede
// elevação (UAC); a pessoa pode recusar.
func allowFirewall(nodePath string) error {
	args := fmt.Sprintf(`advfirewall firewall add rule name="Referee Lights" dir=in action=allow program="%s" enable=yes profile=any`, nodePath)
	return shellOpen("runas", "netsh", args, windows.SW_HIDE)
}
