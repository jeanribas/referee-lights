package main

import (
	"crypto/ed25519"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"io"
	"log"
	"net"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"
)

type fakeRelease struct {
	srv      *httptest.Server
	manifest []byte
	sig      string
	exe      []byte
	busy     bool
}

func newFakeRelease(t *testing.T) *fakeRelease {
	f := &fakeRelease{}
	mux := http.NewServeMux()
	mux.HandleFunc("/manifest.json", func(w http.ResponseWriter, r *http.Request) { w.Write(f.manifest) })
	mux.HandleFunc("/manifest.json.sig", func(w http.ResponseWriter, r *http.Request) { io.WriteString(w, f.sig) })
	mux.HandleFunc("/RefereeLights.exe", func(w http.ResponseWriter, r *http.Request) { w.Write(f.exe) })
	mux.HandleFunc("/__launcher/busy", func(w http.ResponseWriter, r *http.Request) {
		json.NewEncoder(w).Encode(map[string]any{"busy": f.busy, "reason": "judge_connected:ABCD"})
	})
	f.srv = httptest.NewServer(mux)
	t.Cleanup(f.srv.Close)
	return f
}

func (f *fakeRelease) publish(t *testing.T, priv ed25519.PrivateKey, m Manifest) {
	t.Helper()
	if m.URL == "" {
		m.URL = f.srv.URL + "/RefereeLights.exe"
	}
	if m.Size == 0 {
		m.Size = int64(len(f.exe))
	}
	if m.SHA256 == "" {
		sum := sha256.Sum256(f.exe)
		m.SHA256 = hex.EncodeToString(sum[:])
	}
	if m.Schema == 0 {
		m.Schema = 1
	}
	if m.Channel == "" {
		m.Channel = channel
	}
	f.manifest, _ = json.Marshal(m)
	f.sig = base64.StdEncoding.EncodeToString(ed25519.Sign(priv, f.manifest))
}

func testUpdater(t *testing.T, f *fakeRelease, pub ed25519.PublicKey) (*Updater, *App) {
	t.Helper()
	p := testPaths(t)
	app := &App{
		paths: p, log: log.New(io.Discard, "", 0), errs: newErrorQueue(p, "teste"),
		port: f.srv.Listener.Addr().(*net.TCPAddr).Port, quit: make(chan struct{}), exitReq: make(chan struct{}),
	}
	exe := filepath.Join(t.TempDir(), "RefereeLights.exe")
	os.WriteFile(exe, []byte("MZ versão atual"), 0o755)
	u := &Updater{app: app, exePath: exe, manifestURL: f.srv.URL + "/manifest.json", keys: []ed25519.PublicKey{pub}, client: http.DefaultClient, state: "none"}
	return u, app
}

func keys(t *testing.T) (ed25519.PublicKey, ed25519.PrivateKey) {
	pub, priv, err := ed25519.GenerateKey(rand.Reader)
	if err != nil {
		t.Fatal(err)
	}
	return pub, priv
}

func withVersion(t *testing.T, v string) {
	old := version
	version = v
	t.Cleanup(func() { version = old })
}

func TestUpdateDownloadsVerifiedNewVersion(t *testing.T) {
	withVersion(t, "1.3.0")
	pub, priv := keys(t)
	f := newFakeRelease(t)
	f.exe = []byte("MZ versão nova")
	f.publish(t, priv, Manifest{Version: "1.4.0", NotesPT: "melhorias"})
	u, _ := testUpdater(t, f, pub)
	u.Check()
	v := u.View()
	if v.State != "ready" || v.Version != "1.4.0" || !v.CanApply || v.Notes["pt"] != "melhorias" {
		t.Fatalf("esperado pronto: %+v", v)
	}
	if b, _ := os.ReadFile(u.exePath + ".new"); string(b) != "MZ versão nova" {
		t.Fatal(".new não gravado")
	}
}

func TestUpdateRejectsBadSignatureAndHash(t *testing.T) {
	withVersion(t, "1.3.0")
	pub, priv := keys(t)
	_, otherPriv := keys(t)
	f := newFakeRelease(t)
	f.exe = []byte("MZ nova")

	f.publish(t, otherPriv, Manifest{Version: "1.4.0"}) // chave errada
	u, app := testUpdater(t, f, pub)
	u.Check()
	if u.View().State != "none" || app.errs.Len() == 0 {
		t.Fatalf("assinatura de outra chave aceita: %+v", u.View())
	}

	f.publish(t, priv, Manifest{Version: "1.4.0"})
	f.manifest = append(f.manifest[:len(f.manifest)-1], []byte(`,"x":1}`)...) // adulterado depois de assinar
	u.Check()
	if u.View().State != "none" {
		t.Fatal("manifesto adulterado aceito")
	}

	f.publish(t, priv, Manifest{Version: "1.4.0", SHA256: hex.EncodeToString(make([]byte, 32))})
	u.Check()
	if v := u.View(); v.State != "error" {
		t.Fatalf("SHA-256 errado aceito: %+v", v)
	}
	if _, err := os.Stat(u.exePath + ".new"); err == nil {
		t.Fatal("arquivo com hash errado ficou no disco")
	}
}

func TestUpdateIgnoresOlderBadSkippedAndOtherChannel(t *testing.T) {
	withVersion(t, "1.4.0")
	pub, priv := keys(t)
	f := newFakeRelease(t)
	f.exe = []byte("MZ")
	u, app := testUpdater(t, f, pub)
	for _, m := range []Manifest{{Version: "1.3.9"}, {Version: "1.4.0"}, {Version: "1.5.0", Channel: "outro"}} {
		f.publish(t, priv, m)
		u.Check()
		if u.View().State != "none" {
			t.Fatalf("não deveria oferecer %+v", m)
		}
	}
	saveState(app.paths, launcherState{BadVersion: "1.5.0", SkipVersion: "1.6.0"})
	for _, v := range []string{"1.5.0", "1.6.0"} {
		f.publish(t, priv, Manifest{Version: v})
		u.Check()
		if u.View().State != "none" {
			t.Fatalf("versão ruim/pulada %s oferecida", v)
		}
	}
	f.publish(t, priv, Manifest{Version: "1.5.0", MinLauncher: "9.0.0"})
	saveState(app.paths, launcherState{})
	u.Check()
	if u.View().State != "none" {
		t.Fatal("minLauncher maior que a versão atual deveria barrar")
	}
}

func TestUpdateDeferredWhenBusyAndInstalledOnQuit(t *testing.T) {
	withVersion(t, "1.3.0")
	pub, priv := keys(t)
	f := newFakeRelease(t)
	f.exe = []byte("MZ nova")
	f.publish(t, priv, Manifest{Version: "1.4.0"})
	u, app := testUpdater(t, f, pub)
	u.Check()
	f.busy = true
	if v := u.Apply(); v.State != "deferred" {
		t.Fatalf("com juiz conectado deveria adiar: %+v", v)
	}
	if b, _ := os.ReadFile(u.exePath); string(b) != "MZ versão atual" {
		t.Fatal("trocou o exe com competição em andamento")
	}
	u.OnQuit()
	if b, _ := os.ReadFile(u.exePath); string(b) != "MZ nova" {
		t.Fatal("versão adiada não instalada ao sair")
	}
	if b, _ := os.ReadFile(oldExePath(u.exePath)); string(b) != "MZ versão atual" {
		t.Fatal("versão anterior não guardada como .old.exe")
	}
	st := loadState(app.paths)
	if st.PendingVersion != "1.4.0" || st.PreviousVersion != "1.3.0" {
		t.Fatalf("verificação pendente não gravada: %+v", st)
	}
	// Sair de novo não troca outra vez (o .old.exe continua sendo a anterior)
	u.OnQuit()
	if b, _ := os.ReadFile(oldExePath(u.exePath)); string(b) != "MZ versão atual" {
		t.Fatal("segunda saída trocou o exe de novo")
	}

	// A nova não sobe: rollback devolve a antiga e marca a nova como ruim
	restored, err := rollbackFiles(app.paths, oldExePath(u.exePath))
	if err != nil || restored != u.exePath {
		t.Fatalf("rollback: %v %s", err, restored)
	}
	if b, _ := os.ReadFile(u.exePath); string(b) != "MZ versão atual" {
		t.Fatal("rollback não restaurou a versão anterior")
	}
	if st := loadState(app.paths); st.BadVersion != "1.4.0" || st.PendingVersion != "" {
		t.Fatalf("badVersion não marcada: %+v", st)
	}
}

func TestUpdateSkip(t *testing.T) {
	withVersion(t, "1.3.0")
	pub, priv := keys(t)
	f := newFakeRelease(t)
	f.exe = []byte("MZ nova")
	f.publish(t, priv, Manifest{Version: "1.4.0"})
	u, app := testUpdater(t, f, pub)
	u.Check()
	u.Skip()
	if loadState(app.paths).SkipVersion != "1.4.0" || u.View().State != "none" {
		t.Fatal("pular não registrou")
	}
	if _, err := os.Stat(u.exePath + ".new"); err == nil {
		t.Fatal("download da versão pulada ficou no disco")
	}
	u.Check()
	if u.View().State != "none" {
		t.Fatal("versão pulada oferecida de novo")
	}
}

func TestUpdateControlRequiresToken(t *testing.T) {
	withVersion(t, "1.3.0")
	pub, _ := keys(t)
	f := newFakeRelease(t)
	u, _ := testUpdater(t, f, pub)
	url, err := u.serveControl("segredo")
	if err != nil {
		t.Fatal(err)
	}
	res, _ := http.Get(url + "/update")
	if res.StatusCode != 404 {
		t.Fatalf("sem token: %d", res.StatusCode)
	}
	req, _ := http.NewRequest("GET", url+"/update", nil)
	req.Header.Set("X-Launcher-Token", "segredo")
	res, _ = http.DefaultClient.Do(req)
	var v UpdateView
	json.NewDecoder(res.Body).Decode(&v)
	if v.State != "none" || v.Current != "1.3.0" {
		t.Fatalf("view: %+v", v)
	}
}

func TestCompareVersions(t *testing.T) {
	cases := []struct {
		a, b string
		want int
	}{
		{"1.3.0", "1.3.0", 0}, {"1.3.10", "1.3.9", 1}, {"1.4.0", "1.10.0", -1},
		{"1.4.0-rc.1", "1.4.0", -1}, {"1.4", "1.4.0", 0}, {"2.0.0", "1.99.99", 1},
	}
	for _, c := range cases {
		if got := compareVersions(c.a, c.b); got != c.want {
			t.Errorf("compareVersions(%s, %s) = %d, quero %d", c.a, c.b, got, c.want)
		}
	}
}
