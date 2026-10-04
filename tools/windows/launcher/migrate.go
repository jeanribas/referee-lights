package main

import (
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"time"
)

// Migração dos dados do pacote zip (v1.3: <pasta do zip>\server\data) para
// data\ do exe. COPIA (nunca move): o zip continua funcionando como antes.
// Só acontece na primeira execução (data\ sem banco); depois, pelo item
// "Importar dados da versão antiga…" da bandeja.

var migratedFiles = []string{
	"analytics.db", "analytics.db-wal", "analytics.db-shm",
	"instance.id", "telemetry-queue.json",
}

const migratedMarker = ".migrated-from"

func hasDatabase(dir string) bool {
	info, err := os.Stat(filepath.Join(dir, "analytics.db"))
	return err == nil && info.Size() > 0
}

// legacyDataDir aceita a pasta do zip, a pasta server ou a data em si.
func legacyDataDir(dir string) (string, bool) {
	for _, c := range []string{
		filepath.Join(dir, "server", "data"),
		filepath.Join(dir, "data"),
		dir,
	} {
		if hasDatabase(c) {
			return c, true
		}
	}
	return "", false
}

// findLegacyData procura o pacote antigo ao lado do exe e nos lugares onde
// as pessoas costumam extrair zips. Fica com o banco mais recente.
func findLegacyData(exeDir string) (string, bool) {
	roots := []string{exeDir}
	if home, err := os.UserHomeDir(); err == nil {
		for _, d := range []string{"Desktop", "Downloads", "Documents", filepath.Join("OneDrive", "Desktop"), filepath.Join("OneDrive", "Documents")} {
			roots = append(roots, filepath.Join(home, d))
		}
	}
	var best string
	var bestMod time.Time
	consider := func(dir string) {
		if data, ok := legacyDataDir(dir); ok {
			if info, err := os.Stat(filepath.Join(data, "analytics.db")); err == nil && info.ModTime().After(bestMod) {
				best, bestMod = data, info.ModTime()
			}
		}
	}
	for _, root := range roots {
		consider(root)
		level1, _ := filepath.Glob(filepath.Join(root, "*"))
		for _, d := range level1 {
			consider(d)
			level2, _ := filepath.Glob(filepath.Join(d, "*"))
			for _, d2 := range level2 {
				if info, err := os.Stat(filepath.Join(d2, "server", "data")); err == nil && info.IsDir() {
					consider(d2)
				}
			}
		}
	}
	return best, best != ""
}

func copyLegacyData(from, to string) error {
	if err := os.MkdirAll(to, 0o755); err != nil {
		return err
	}
	copied := 0
	for _, name := range migratedFiles {
		src := filepath.Join(from, name)
		if _, err := os.Stat(src); err != nil {
			continue
		}
		if err := copyFile(src, filepath.Join(to, name)); err != nil {
			return fmt.Errorf("copiar %s: %w", name, err)
		}
		copied++
	}
	if copied == 0 {
		return errors.New("nada para copiar")
	}
	return os.WriteFile(filepath.Join(to, migratedMarker), []byte(from+"\n"+time.Now().Format(time.RFC3339)+"\n"), 0o644)
}

// migrateOnFirstRun devolve a pasta de origem (vazio se não migrou).
func migrateOnFirstRun(p Paths, exeDir string) (string, error) {
	if hasDatabase(p.Data) {
		return "", nil
	}
	if _, err := os.Stat(filepath.Join(p.Data, migratedMarker)); err == nil {
		return "", nil
	}
	from, ok := findLegacyData(exeDir)
	if !ok {
		return "", nil
	}
	return from, copyLegacyData(from, p.Data)
}

// importLegacy (bandeja) guarda os dados atuais em data.bak-<data> antes de
// sobrescrever. O server precisa estar parado.
func importLegacy(p Paths, chosen string) (string, error) {
	from, ok := legacyDataDir(chosen)
	if !ok {
		return "", fmt.Errorf("nenhum banco de dados encontrado em %s", chosen)
	}
	if hasDatabase(p.Data) {
		backup := p.Data + ".bak-" + time.Now().Format("20060102-150405")
		if err := os.Rename(p.Data, backup); err != nil {
			return "", fmt.Errorf("backup dos dados atuais: %w", err)
		}
		// launcher.json (porta escolhida) volta para a pasta nova
		_ = os.MkdirAll(p.Data, 0o755)
		_ = copyFile(filepath.Join(backup, "launcher.json"), filepath.Join(p.Data, "launcher.json"))
	}
	return from, copyLegacyData(from, p.Data)
}
