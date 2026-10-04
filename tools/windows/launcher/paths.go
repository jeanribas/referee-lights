package main

import (
	"errors"
	"os"
	"path/filepath"
)

// Layout em %LOCALAPPDATA%\RefereeLights:
//
//	app\<versão>-<build>\   server + frontend extraídos (um por versão)
//	runtime\node-<versão>\  node.exe em caminho ESTÁVEL: o prompt do
//	                        firewall não volta a cada atualização do app
//	data\                   banco, instance.id, fila local, launcher.json
//	logs\                   launcher.log, server.log (rotação 5 MB × 3)
//	config.env              opcional: variáveis que valem para o server
type Paths struct {
	Root    string
	Apps    string
	Runtime string
	Data    string
	Logs    string
	Config  string
}

func resolvePaths() (Paths, error) {
	base := os.Getenv("LOCALAPPDATA")
	if base == "" {
		// Fora do Windows (desenvolvimento) ou ambiente sem a variável
		dir, err := os.UserCacheDir()
		if err != nil {
			return Paths{}, errors.New("LOCALAPPDATA não definido")
		}
		base = dir
	}
	root := filepath.Join(base, "RefereeLights")
	p := Paths{
		Root:    root,
		Apps:    filepath.Join(root, "app"),
		Runtime: filepath.Join(root, "runtime"),
		Data:    filepath.Join(root, "data"),
		Logs:    filepath.Join(root, "logs"),
		Config:  filepath.Join(root, "config.env"),
	}
	for _, d := range []string{p.Apps, p.Runtime, p.Data, p.Logs} {
		if err := os.MkdirAll(d, 0o755); err != nil {
			return Paths{}, err
		}
	}
	return p, nil
}
