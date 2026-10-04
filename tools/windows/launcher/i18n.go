package main

import "strings"

// Textos do lançador (bandeja e avisos) nos três idiomas do app.
type texts struct {
	Tooltip, OpenPanel, Addresses, NoAddress, CopyHint, Copied, ViewLogs, Firewall,
	ImportData, ImportPick, ImportDone, ImportFail, RemoveData, RemoveConfirm1, RemoveConfirm2,
	Quit, PortChanged, CrashLoop, StartFailed, Migrated, AlreadyRunning string
}

var allTexts = map[string]texts{
	"pt": {
		Tooltip:        "Referee Lights",
		OpenPanel:      "Abrir painel",
		Addresses:      "Endereço para celulares",
		NoAddress:      "Sem rede (só neste computador)",
		CopyHint:       "copiar",
		Copied:         "Endereço copiado: %s",
		ViewLogs:       "Ver logs",
		Firewall:       "Liberar no firewall (pede administrador)",
		ImportData:     "Importar dados da versão antiga…",
		ImportPick:     "Escolha a pasta onde o Referee Lights (zip) foi extraído",
		ImportDone:     "Dados importados de:\n%s",
		ImportFail:     "Não foi possível importar:\n%s",
		RemoveData:     "Remover dados e sair",
		RemoveConfirm1: "Apagar TODAS as salas, configurações e logs do Referee Lights neste computador?",
		RemoveConfirm2: "Tem certeza? Isso não pode ser desfeito.",
		Quit:           "Sair",
		PortChanged:    "A porta %d está em uso por outro programa. O Referee Lights vai usar a porta %d.\n\nSe o pacote zip antigo estiver aberto, feche-o (Parar.cmd).",
		CrashLoop:      "O servidor do Referee Lights caiu várias vezes seguidas.\n\nVeja os logs em:\n%s",
		StartFailed:    "Não foi possível iniciar o Referee Lights:\n%s\n\nLogs em:\n%s",
		Migrated:       "Dados da versão antiga importados de:\n%s",
	},
	"en": {
		Tooltip:        "Referee Lights",
		OpenPanel:      "Open panel",
		Addresses:      "Address for phones",
		NoAddress:      "No network (this computer only)",
		CopyHint:       "copy",
		Copied:         "Address copied: %s",
		ViewLogs:       "View logs",
		Firewall:       "Allow through firewall (asks for administrator)",
		ImportData:     "Import data from old version…",
		ImportPick:     "Choose the folder where Referee Lights (zip) was extracted",
		ImportDone:     "Data imported from:\n%s",
		ImportFail:     "Could not import:\n%s",
		RemoveData:     "Remove data and quit",
		RemoveConfirm1: "Delete ALL Referee Lights rooms, settings and logs on this computer?",
		RemoveConfirm2: "Are you sure? This cannot be undone.",
		Quit:           "Quit",
		PortChanged:    "Port %d is used by another program. Referee Lights will use port %d.\n\nIf the old zip package is open, close it (Parar.cmd).",
		CrashLoop:      "The Referee Lights server crashed several times in a row.\n\nSee the logs at:\n%s",
		StartFailed:    "Could not start Referee Lights:\n%s\n\nLogs at:\n%s",
		Migrated:       "Data from the old version imported from:\n%s",
	},
	"es": {
		Tooltip:        "Referee Lights",
		OpenPanel:      "Abrir panel",
		Addresses:      "Dirección para celulares",
		NoAddress:      "Sin red (solo este equipo)",
		CopyHint:       "copiar",
		Copied:         "Dirección copiada: %s",
		ViewLogs:       "Ver registros",
		Firewall:       "Permitir en el firewall (pide administrador)",
		ImportData:     "Importar datos de la versión anterior…",
		ImportPick:     "Elige la carpeta donde se extrajo Referee Lights (zip)",
		ImportDone:     "Datos importados de:\n%s",
		ImportFail:     "No se pudo importar:\n%s",
		RemoveData:     "Eliminar datos y salir",
		RemoveConfirm1: "¿Borrar TODAS las salas, ajustes y registros de Referee Lights en este equipo?",
		RemoveConfirm2: "¿Seguro? No se puede deshacer.",
		Quit:           "Salir",
		PortChanged:    "El puerto %d está en uso por otro programa. Referee Lights usará el puerto %d.\n\nSi el paquete zip anterior está abierto, ciérralo (Parar.cmd).",
		CrashLoop:      "El servidor de Referee Lights se cayó varias veces seguidas.\n\nRevisa los registros en:\n%s",
		StartFailed:    "No se pudo iniciar Referee Lights:\n%s\n\nRegistros en:\n%s",
		Migrated:       "Datos de la versión anterior importados de:\n%s",
	},
}

func textsFor(lang string) texts {
	lang = strings.ToLower(lang)
	for _, prefix := range []string{"pt", "es"} {
		if strings.HasPrefix(lang, prefix) {
			return allTexts[prefix]
		}
	}
	return allTexts["en"]
}
