package main

import (
	"archive/tar"
	"bytes"
	"encoding/json"
	"io"
	"log"
	"net"
	"net/http"
	"net/http/httptest"
	"net/url"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"testing"
	"time"

	"github.com/klauspost/compress/zstd"
)

func testPaths(t *testing.T) Paths {
	t.Helper()
	t.Setenv("LOCALAPPDATA", t.TempDir())
	p, err := resolvePaths()
	if err != nil {
		t.Fatal(err)
	}
	return p
}

func makePayload(t *testing.T, files map[string]string) []byte {
	t.Helper()
	var buf bytes.Buffer
	zw, _ := zstd.NewWriter(&buf)
	tw := tar.NewWriter(zw)
	for name, content := range files {
		if err := tw.WriteHeader(&tar.Header{Name: name, Mode: 0o755, Size: int64(len(content)), Typeflag: tar.TypeReg}); err != nil {
			t.Fatal(err)
		}
		io.WriteString(tw, content)
	}
	tw.Close()
	zw.Close()
	return buf.Bytes()
}

func TestExtractIsAtomicAndReused(t *testing.T) {
	p := testPaths(t)
	payload := makePayload(t, map[string]string{
		"server/dist/index.js": "console.log(1)",
		"frontend/server.js":   "x",
		"node/" + nodeExeName:  "binário",
	})
	appDir, nodePath, err := ensureExtracted(payload, p, "1.4.0", "20.18.1", nodeExeName)
	if err != nil {
		t.Fatal(err)
	}
	if !isComplete(appDir, payloadHash(payload)) {
		t.Fatal("marcador .complete ausente")
	}
	if b, _ := os.ReadFile(nodePath); string(b) != "binário" {
		t.Fatalf("node não extraído para o runtime estável: %q", b)
	}
	if !strings.Contains(nodePath, filepath.Join("runtime", "node-20.18.1")) {
		t.Fatalf("node fora do caminho estável: %s", nodePath)
	}
	if _, err := os.Stat(filepath.Join(appDir, "node")); !os.IsNotExist(err) {
		t.Fatal("node/ não deveria ficar dentro da pasta da versão")
	}
	// Segunda execução: nada é reextraído (arquivo alterado continua)
	os.WriteFile(filepath.Join(appDir, "server", "dist", "index.js"), []byte("marcado"), 0o644)
	again, _, err := ensureExtracted(payload, p, "1.4.0", "20.18.1", nodeExeName)
	if err != nil || again != appDir {
		t.Fatalf("reuso falhou: %v %s", err, again)
	}
	if b, _ := os.ReadFile(filepath.Join(appDir, "server", "dist", "index.js")); string(b) != "marcado" {
		t.Fatal("pasta completa foi reextraída sem necessidade")
	}
	// Extração interrompida (sem .complete) é refeita
	os.Remove(filepath.Join(appDir, completeMarker))
	if _, _, err := ensureExtracted(payload, p, "1.4.0", "20.18.1", nodeExeName); err != nil {
		t.Fatal(err)
	}
	if b, _ := os.ReadFile(filepath.Join(appDir, "server", "dist", "index.js")); string(b) != "console.log(1)" {
		t.Fatal("extração incompleta não foi refeita")
	}
	// Build diferente com a mesma versão → pasta diferente
	other := makePayload(t, map[string]string{"server/dist/index.js": "v2", "node/" + nodeExeName: "binário"})
	otherDir, _, err := ensureExtracted(other, p, "1.4.0", "20.18.1", nodeExeName)
	if err != nil || otherDir == appDir {
		t.Fatalf("build novo deveria ter pasta própria: %v", err)
	}
}

func TestExtractRejectsPathTraversal(t *testing.T) {
	p := testPaths(t)
	payload := makePayload(t, map[string]string{"../fora.txt": "x", "node/" + nodeExeName: "n"})
	if _, _, err := ensureExtracted(payload, p, "1", "1", nodeExeName); err == nil {
		t.Fatal("caminho ../ deveria ser recusado")
	}
}

func TestCleanupKeepsCurrentAndPrevious(t *testing.T) {
	p := testPaths(t)
	for i, name := range []string{"1.0-a", "1.1-b", "1.2-c", "1.3-d.tmp-99"} {
		d := filepath.Join(p.Apps, name)
		os.MkdirAll(d, 0o755)
		mt := time.Now().Add(time.Duration(i) * time.Minute)
		os.Chtimes(d, mt, mt)
	}
	cleanupOldApps(p, filepath.Join(p.Apps, "1.0-a"))
	entries, _ := os.ReadDir(p.Apps)
	var names []string
	for _, e := range entries {
		names = append(names, e.Name())
	}
	got := strings.Join(names, ",")
	if got != "1.0-a,1.2-c" {
		t.Fatalf("esperado atual + mais recente, ficou %s", got)
	}
}

func TestChoosePort(t *testing.T) {
	p := testPaths(t)
	busy := map[int]bool{}
	free := func(port int) bool { return !busy[port] }

	port, changed, err := choosePort(p, free)
	if err != nil || port != 3000 || changed {
		t.Fatalf("padrão: %d %v %v", port, changed, err)
	}
	busy[3000] = true
	port, changed, _ = choosePort(p, free)
	if port != 3001 || !changed {
		t.Fatalf("ocupada: %d %v", port, changed)
	}
	// A escolhida fica gravada e vale mesmo com a 3000 livre (QR impresso)
	delete(busy, 3000)
	port, changed, _ = choosePort(p, free)
	if port != 3001 || changed {
		t.Fatalf("gravada: %d %v", port, changed)
	}
	for i := 3000; i <= 3010; i++ {
		busy[i] = true
	}
	if _, _, err := choosePort(p, free); err == nil {
		t.Fatal("todas ocupadas deveria falhar")
	}
}

func TestPortFreeDetectsListener(t *testing.T) {
	l, err := net.Listen("tcp", "0.0.0.0:0")
	if err != nil {
		t.Skip(err)
	}
	defer l.Close()
	if portFree(l.Addr().(*net.TCPAddr).Port) {
		t.Fatal("porta em uso reportada como livre")
	}
}

func writeLegacy(t *testing.T, dir string) {
	t.Helper()
	data := filepath.Join(dir, "server", "data")
	os.MkdirAll(data, 0o755)
	os.WriteFile(filepath.Join(data, "analytics.db"), []byte("db"), 0o644)
	os.WriteFile(filepath.Join(data, "analytics.db-wal"), []byte("wal"), 0o644)
	os.WriteFile(filepath.Join(data, "instance.id"), []byte("abc"), 0o644)
}

func TestMigrationNextToExe(t *testing.T) {
	p := testPaths(t)
	t.Setenv("HOME", t.TempDir())
	t.Setenv("USERPROFILE", os.Getenv("HOME"))
	exeDir := t.TempDir()
	writeLegacy(t, exeDir)
	from, err := migrateOnFirstRun(p, exeDir)
	if err != nil || from == "" {
		t.Fatalf("migração: %q %v", from, err)
	}
	for _, f := range []string{"analytics.db", "analytics.db-wal", "instance.id", migratedMarker} {
		if _, err := os.Stat(filepath.Join(p.Data, f)); err != nil {
			t.Fatalf("%s não copiado", f)
		}
	}
	if _, err := os.Stat(filepath.Join(exeDir, "server", "data", "analytics.db")); err != nil {
		t.Fatal("original deveria continuar (copiar, nunca mover)")
	}
	// Não migra de novo
	os.WriteFile(filepath.Join(p.Data, "analytics.db"), []byte("novo"), 0o644)
	if from, _ := migrateOnFirstRun(p, exeDir); from != "" {
		t.Fatal("migrou de novo com banco já existente")
	}
}

func TestMigrationFindsZipInDownloads(t *testing.T) {
	p := testPaths(t)
	home := t.TempDir()
	t.Setenv("HOME", home)
	t.Setenv("USERPROFILE", home)
	writeLegacy(t, filepath.Join(home, "Downloads", "referee-lights-windows"))
	from, err := migrateOnFirstRun(p, t.TempDir())
	if err != nil || !strings.Contains(from, "Downloads") {
		t.Fatalf("deveria achar o zip em Downloads: %q %v", from, err)
	}
}

func TestImportBacksUpCurrentData(t *testing.T) {
	p := testPaths(t)
	os.WriteFile(filepath.Join(p.Data, "analytics.db"), []byte("atual"), 0o644)
	os.WriteFile(filepath.Join(p.Data, "launcher.json"), []byte(`{"port":3005}`), 0o644)
	old := t.TempDir()
	writeLegacy(t, old)
	if _, err := importLegacy(p, old); err != nil {
		t.Fatal(err)
	}
	if b, _ := os.ReadFile(filepath.Join(p.Data, "analytics.db")); string(b) != "db" {
		t.Fatal("dados não importados")
	}
	if loadState(p).Port != 3005 {
		t.Fatal("porta escolhida se perdeu na importação")
	}
	backups, _ := filepath.Glob(p.Data + ".bak-*")
	if len(backups) != 1 {
		t.Fatal("backup dos dados atuais não criado")
	}
	if _, err := importLegacy(p, t.TempDir()); err == nil {
		t.Fatal("pasta sem banco deveria falhar")
	}
}

func TestRotatingFile(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "x.log")
	r, err := openRotating(path, 100, 3)
	if err != nil {
		t.Fatal(err)
	}
	for i := 0; i < 20; i++ {
		r.Write([]byte(strings.Repeat("a", 30) + "\n"))
	}
	r.Close()
	for _, f := range []string{"x.log", "x.log.1", "x.log.2", "x.log.3"} {
		if _, err := os.Stat(filepath.Join(dir, f)); err != nil {
			t.Fatalf("%s ausente", f)
		}
	}
	if _, err := os.Stat(filepath.Join(dir, "x.log.4")); err == nil {
		t.Fatal("rotação passou do limite de arquivos")
	}
	if got := tailLines(path, 2, 1024); strings.Count(got, "\n") != 1 {
		t.Fatalf("tail: %q", got)
	}
}

func TestErrorQueueDeliversWhenServerIsUp(t *testing.T) {
	p := testPaths(t)
	q := newErrorQueue(p, "teste")
	q.Record("node_crash", "supervisor", "caiu", "log")
	q.Record("port_busy", "port", "ocupada", "")

	// Persistida em disco (sobrevive a reinício do lançador)
	if newErrorQueue(p, "teste").Len() != 2 {
		t.Fatal("fila não persistida")
	}

	q.Flush(1, "x") // sem server: nada sai
	if q.Len() != 2 {
		t.Fatal("perdeu erro sem server no ar")
	}

	var got []map[string]string
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/__launcher/error" || r.Header.Get("X-Launcher-Token") != "tok" {
			w.WriteHeader(404)
			return
		}
		var m map[string]string
		json.NewDecoder(r.Body).Decode(&m)
		got = append(got, m)
		w.WriteHeader(204)
	}))
	defer srv.Close()
	port := srv.Listener.Addr().(*net.TCPAddr).Port
	q.Flush(port, "tok")
	if q.Len() != 0 || len(got) != 2 || got[0]["kind"] != "node_crash" || got[0]["system"] != "teste" {
		t.Fatalf("entrega: fila=%d recebidos=%v", q.Len(), got)
	}
	if _, err := os.Stat(filepath.Join(p.Data, "launcher-errors.json")); !os.IsNotExist(err) {
		t.Fatal("arquivo da fila deveria sumir quando vazia")
	}
}

func TestConfigEnvOverridesButLauncherWins(t *testing.T) {
	p := testPaths(t)
	os.WriteFile(p.Config, []byte("# comentário\nTELEMETRY_ENABLED=false\nPORT=9999\n"), 0o644)
	a := &App{paths: p, port: 3002, appDir: "/app", token: "tok"}
	env := strings.Join(a.serverEnv(), "\n")
	for _, want := range []string{"TELEMETRY_ENABLED=false", "PORT=3002", "DATA_DIR=" + p.Data, "LAUNCHER_TOKEN=tok"} {
		if !strings.Contains(env, want) {
			t.Fatalf("env sem %s", want)
		}
	}
	if strings.Contains(env, "PORT=9999") {
		t.Fatal("config.env não pode trocar a porta controlada pelo lançador")
	}
}

// Supervisor com um "node" falso (script de shell): reinicia após queda,
// avisa a rajada de quedas e para quando pedido.
func TestSupervisorRestartsAndStops(t *testing.T) {
	if runtime.GOOS == "windows" {
		t.Skip("usa /bin/sh")
	}
	restartBackoff = []time.Duration{10 * time.Millisecond}
	dir := t.TempDir()
	script := filepath.Join(dir, "fake.sh")
	os.WriteFile(script, []byte("#!/bin/sh\nexit 3\n"), 0o755)
	crashes := make(chan struct{}, 50)
	looped := make(chan struct{}, 1)
	s := &Supervisor{
		NodePath: "/bin/sh", Script: script, Dir: dir, Env: os.Environ(),
		Output: io.Discard, Log: log.New(io.Discard, "", 0),
		OnCrash:     func(error, time.Duration) { crashes <- struct{}{} },
		OnCrashLoop: func() { looped <- struct{}{} },
	}
	s.Start()
	select {
	case <-looped:
	case <-time.After(5 * time.Second):
		t.Fatal("rajada de quedas não detectada")
	}
	if len(crashes) < crashLimit {
		t.Fatalf("poucas quedas registradas: %d", len(crashes))
	}
	done := make(chan struct{})
	go func() { s.Stop(); close(done) }()
	select {
	case <-done:
	case <-time.After(5 * time.Second):
		t.Fatal("Stop não terminou")
	}
}

func TestSupervisorKillsAfterGrace(t *testing.T) {
	if runtime.GOOS == "windows" {
		t.Skip("usa /bin/sh")
	}
	dir := t.TempDir()
	script := filepath.Join(dir, "teimoso.sh")
	os.WriteFile(script, []byte("#!/bin/sh\ntrap '' TERM\nsleep 60\n"), 0o755)
	s := &Supervisor{
		NodePath: "/bin/sh", Script: script, Dir: dir, Env: os.Environ(), Port: 1, Token: "x",
		Output: io.Discard, Log: log.New(io.Discard, "", 0),
	}
	s.Start()
	deadline := time.Now().Add(3 * time.Second)
	for s.PID() == 0 && time.Now().Before(deadline) {
		time.Sleep(20 * time.Millisecond)
	}
	start := time.Now()
	s.Stop()
	if el := time.Since(start); el < shutdownGrace-time.Second || el > shutdownGrace+5*time.Second {
		t.Fatalf("parada forçada fora do prazo: %s", el)
	}
	if s.PID() != 0 {
		t.Fatal("processo continua registrado")
	}
}

func TestIsTimerURL(t *testing.T) {
	for raw, want := range map[string]bool{
		"http://192.168.0.10:3000/timer?roomId=AB12&pin=1234":       true,
		"http://192.168.0.10:3000/en-US/timer?roomId=AB12&pin=1234": true,
		"https://refereelights.app/es-ES/timer/":                    true,
		"http://192.168.0.10:3000/display?roomId=AB12&pin=1234":     false,
		"http://192.168.0.10:3000/timers":                           false,
		"http://192.168.0.10:3000/en-US/admin":                      false,
		"file:///C:/timer":                                          false,
	} {
		u, err := url.Parse(raw)
		if err != nil {
			t.Fatal(err)
		}
		if got := isTimerURL(u); got != want {
			t.Errorf("isTimerURL(%q) = %v, quer %v", raw, got, want)
		}
	}
}

func TestLanguageFollowsApp(t *testing.T) {
	root := t.TempDir()
	p := Paths{Root: root}
	for in, want := range map[string]string{"pt-BR": "pt", "en-US": "en", "es-ES": "es", " PT ": "pt", "fr-FR": "", "": ""} {
		if got := normalizeLang(in); got != want {
			t.Fatalf("normalizeLang(%q) = %q, want %q", in, got, want)
		}
	}
	a := &App{paths: p, lang: "en"}
	calls := 0
	a.OnLangChange(func() { calls++ })
	a.SetLang("pt-BR")
	if a.Lang() != "pt" || a.T().UpdateNone != allTexts["pt"].UpdateNone {
		t.Fatalf("idioma não trocou: %q", a.Lang())
	}
	a.SetLang("pt-BR") // mesmo idioma: não chama de novo
	a.SetLang("xx")    // desconhecido: ignora
	if calls != 1 {
		t.Fatalf("OnLangChange chamado %d vezes, want 1", calls)
	}
	// próxima abertura usa o idioma salvo, não o do Windows
	if got := initialLang(p); got != "pt" {
		t.Fatalf("initialLang = %q, want pt (salvo)", got)
	}
}
