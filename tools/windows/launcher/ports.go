package main

import (
	"encoding/json"
	"fmt"
	"net"
	"os"
	"path/filepath"
)

// Porta: 3000 por padrão; ocupada → 3001…3010. A escolhida fica gravada em
// data\launcher.json e é a primeira tentada da próxima vez (QR impresso
// continua valendo).
const (
	defaultPort = 3000
	lastPort    = 3010
)

type launcherState struct {
	Port int `json:"port"`
}

func statePath(p Paths) string { return filepath.Join(p.Data, "launcher.json") }

func loadState(p Paths) launcherState {
	var s launcherState
	b, err := os.ReadFile(statePath(p))
	if err == nil {
		_ = json.Unmarshal(b, &s)
	}
	return s
}

func saveState(p Paths, s launcherState) error {
	b, _ := json.MarshalIndent(s, "", "  ")
	return writeFileAtomic(statePath(p), b)
}

func portFree(port int) bool {
	l, err := net.Listen("tcp", fmt.Sprintf("0.0.0.0:%d", port))
	if err != nil {
		return false
	}
	_ = l.Close()
	return true
}

// choosePort devolve a porta e se houve troca em relação à preferida.
func choosePort(p Paths, free func(int) bool) (int, bool, error) {
	preferred := loadState(p).Port
	if preferred < 1 || preferred > 65535 {
		preferred = defaultPort
	}
	candidates := []int{preferred}
	for port := defaultPort; port <= lastPort; port++ {
		if port != preferred {
			candidates = append(candidates, port)
		}
	}
	for _, port := range candidates {
		if free(port) {
			if port != preferred || loadState(p).Port != port {
				_ = saveState(p, launcherState{Port: port})
			}
			return port, port != preferred, nil
		}
	}
	return 0, false, fmt.Errorf("portas %d a %d ocupadas", defaultPort, lastPort)
}
