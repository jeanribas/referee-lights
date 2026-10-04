package main

import (
	"crypto/ed25519"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"sync"
	"time"
)

// Canal de atualização (Fase 3).
//
// Manifesto manifest-<canal>.json nos assets do GitHub Releases, assinado
// (manifest-<canal>.json.sig = ed25519 em base64 sobre os bytes exatos do
// manifesto). Chave pública embutida no exe (aceita mais de uma, para
// rotação); a privada fica só no secret do CI. O SHA-256 do exe baixado é
// conferido contra o manifesto assinado.
//
// Consentimento: o lançador só BAIXA sozinho; trocar de versão exige a
// pessoa (bandeja ou aviso no /admin). Com competição em andamento (juiz
// conectado ou atividade recente) a troca fica para quando o app for fechado.
//
// Troca: RefereeLights.exe → RefereeLights.old.exe, .new → RefereeLights.exe,
// a versão nova sobe com --post-update e precisa responder em 60 s; senão a
// antiga volta (--rollback) e a nova fica marcada como ruim (badVersion).

// Preenchidos no build (-ldflags -X).
var (
	channel       = "stable"
	build         = ""
	updatePubKeys = "" // base64, separadas por vírgula
)

// Chaves públicas oficiais (a privada correspondente está no secret
// UPDATE_SIGNING_KEY do repositório). Para rotacionar: adicionar a nova
// aqui, publicar uma versão, e só depois trocar o secret.
const officialPubKeys = "8aExyQwnzOJg11fywRorv1T/CR9yllSST6l0xs2i5QA="

const (
	repoReleases      = "https://github.com/jeanribas/referee-lights/releases"
	firstCheckDelay   = 60 * time.Second
	checkInterval     = 24 * time.Hour
	postUpdateTimeout = 60 * time.Second
	maxExeSize        = 200 << 20
)

type Manifest struct {
	Schema      int    `json:"schema"`
	Channel     string `json:"channel"`
	Version     string `json:"version"`
	Build       string `json:"build"`
	Published   string `json:"published"`
	URL         string `json:"url"`
	Size        int64  `json:"size"`
	SHA256      string `json:"sha256"`
	MinLauncher string `json:"minLauncher"`
	NotesPT     string `json:"notes_pt"`
	NotesEN     string `json:"notes_en"`
	NotesES     string `json:"notes_es"`
}

// UpdateView é o que o /admin e a bandeja mostram (mesmo formato do server).
type UpdateView struct {
	State    string            `json:"state"` // none | available | downloading | ready | deferred | error
	Current  string            `json:"current"`
	Version  string            `json:"version,omitempty"`
	Notes    map[string]string `json:"notes,omitempty"`
	CanApply bool              `json:"canApply"`
	Message  string            `json:"message,omitempty"`
}

type Updater struct {
	app         *App
	exePath     string
	manifestURL string
	keys        []ed25519.PublicKey
	client      *http.Client

	mu          sync.Mutex
	state       string
	manifest    *Manifest
	downloaded  string // caminho do .new conferido
	message     string
	applyOnQuit bool
	checking    bool
	onAvailable func(m Manifest)
}

func defaultManifestURL() string {
	if channel == "stable" {
		return repoReleases + "/latest/download/manifest-stable.json"
	}
	return fmt.Sprintf("%s/download/%s/manifest-%s.json", repoReleases, channel, channel)
}

func parseKeys(list string) []ed25519.PublicKey {
	var keys []ed25519.PublicKey
	for _, k := range strings.Split(list, ",") {
		b, err := base64.StdEncoding.DecodeString(strings.TrimSpace(k))
		if err == nil && len(b) == ed25519.PublicKeySize {
			keys = append(keys, ed25519.PublicKey(b))
		}
	}
	return keys
}

func newUpdater(app *App, exePath string) *Updater {
	u := &Updater{
		app:         app,
		exePath:     exePath,
		manifestURL: defaultManifestURL(),
		keys:        parseKeys(updatePubKeys + "," + officialPubKeys),
		client:      &http.Client{Timeout: 5 * time.Second},
		state:       "none",
	}
	// Só para testes: a URL pode mudar, a chave NÃO (vem do build)
	if v := os.Getenv("RL_UPDATE_MANIFEST_URL"); v != "" {
		u.manifestURL = v
	}
	return u
}

func (u *Updater) enabled() bool {
	if len(u.keys) == 0 || version == "dev" {
		return false // desenvolvimento: sem atualizador
	}
	v := readConfigEnv(u.app.paths.Config)["UPDATE_CHECK"]
	return v != "false"
}

// Loop: 1ª verificação 60 s após iniciar, depois a cada 24 h. Nunca bloqueia
// a inicialização; falha (sem internet) só vai para o log.
func (u *Updater) Run() {
	if !u.enabled() {
		u.app.log.Printf("atualizador desligado")
		return
	}
	delay := firstCheckDelay
	if v, err := strconv.Atoi(os.Getenv("RL_UPDATE_CHECK_DELAY")); err == nil {
		delay = time.Duration(v) * time.Second
	}
	timer := time.NewTimer(delay)
	defer timer.Stop()
	for {
		select {
		case <-u.app.quit:
			return
		case <-timer.C:
			u.Check()
			timer.Reset(checkInterval)
		}
	}
}

func (u *Updater) View() UpdateView {
	u.mu.Lock()
	defer u.mu.Unlock()
	v := UpdateView{State: u.state, Current: version, Message: u.message, CanApply: u.state == "ready"}
	if u.manifest != nil {
		v.Version = u.manifest.Version
		v.Notes = map[string]string{"pt": u.manifest.NotesPT, "en": u.manifest.NotesEN, "es": u.manifest.NotesES}
	}
	return v
}

func (u *Updater) SetOnAvailable(f func(Manifest)) {
	u.mu.Lock()
	u.onAvailable = f
	u.mu.Unlock()
}

func (u *Updater) CurrentManifest() *Manifest {
	u.mu.Lock()
	defer u.mu.Unlock()
	if u.manifest == nil {
		return nil
	}
	m := *u.manifest
	return &m
}

func (u *Updater) setState(state, message string) {
	u.mu.Lock()
	u.state, u.message = state, message
	u.mu.Unlock()
}

// Check consulta o manifesto e, havendo versão nova, baixa e confere.
func (u *Updater) Check() {
	u.mu.Lock()
	if u.checking || u.state == "downloading" || u.state == "ready" || u.state == "deferred" {
		u.mu.Unlock()
		return
	}
	u.checking = true
	u.mu.Unlock()
	defer func() { u.mu.Lock(); u.checking = false; u.mu.Unlock() }()

	m, err := u.fetchManifest()
	if err != nil {
		u.app.log.Printf("atualização: %v", err)
		return
	}
	if !u.isNewer(m) {
		u.app.log.Printf("atualização: nada novo (publicada %s, atual %s)", m.Version, version)
		return
	}
	u.mu.Lock()
	u.manifest = &m
	u.state = "downloading"
	u.mu.Unlock()
	u.app.log.Printf("atualização: baixando %s", m.Version)
	path, err := u.download(m)
	if err != nil {
		u.app.log.Printf("atualização: download recusado: %v", err)
		u.app.errs.Record("update_download_failed", "update", err.Error(), m.Version)
		u.setState("error", err.Error())
		return
	}
	u.mu.Lock()
	u.downloaded = path
	u.state = "ready"
	u.message = ""
	cb := u.onAvailable
	u.mu.Unlock()
	u.app.log.Printf("atualização %s pronta para instalar", m.Version)
	if cb != nil {
		cb(m)
	}
}

func (u *Updater) get(url string, limit int64) ([]byte, error) {
	res, err := u.client.Get(url)
	if err != nil {
		return nil, err
	}
	defer res.Body.Close()
	if res.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("%s: HTTP %d", url, res.StatusCode)
	}
	return io.ReadAll(io.LimitReader(res.Body, limit))
}

func (u *Updater) fetchManifest() (Manifest, error) {
	var m Manifest
	body, err := u.get(u.manifestURL, 64<<10)
	if err != nil {
		return m, err
	}
	sigB64, err := u.get(u.manifestURL+".sig", 1<<10)
	if err != nil {
		return m, fmt.Errorf("assinatura: %w", err)
	}
	if !verifySignature(u.keys, body, sigB64) {
		u.app.errs.Record("update_bad_signature", "update", "assinatura do manifesto inválida", u.manifestURL)
		return m, errors.New("assinatura do manifesto inválida")
	}
	if err := json.Unmarshal(body, &m); err != nil {
		return m, fmt.Errorf("manifesto: %w", err)
	}
	if m.Schema != 1 || m.Channel != channel || m.Version == "" || m.URL == "" || len(m.SHA256) != 64 || m.Size <= 0 || m.Size > maxExeSize {
		return m, fmt.Errorf("manifesto inválido para o canal %s", channel)
	}
	if m.MinLauncher != "" && compareVersions(version, m.MinLauncher) < 0 {
		return m, fmt.Errorf("versão %s exige atualizar manualmente (mínimo %s)", m.Version, m.MinLauncher)
	}
	return m, nil
}

func verifySignature(keys []ed25519.PublicKey, body, sigB64 []byte) bool {
	sig, err := base64.StdEncoding.DecodeString(strings.TrimSpace(string(sigB64)))
	if err != nil || len(sig) != ed25519.SignatureSize {
		return false
	}
	for _, k := range keys {
		if ed25519.Verify(k, body, sig) {
			return true
		}
	}
	return false
}

func (u *Updater) isNewer(m Manifest) bool {
	st := loadState(u.app.paths)
	if m.Version == st.BadVersion || m.Version == st.SkipVersion {
		return false
	}
	c := compareVersions(m.Version, version)
	if c > 0 {
		return true
	}
	// Canal de teste: mesmo número de versão, build diferente
	return c == 0 && channel != "stable" && m.Build != "" && build != "" && m.Build != build
}

// download grava <pasta do exe>\RefereeLights.exe.new e confere tamanho,
// SHA-256 e cabeçalho PE antes de considerar pronta.
func (u *Updater) download(m Manifest) (string, error) {
	dest := u.exePath + ".new"
	res, err := (&http.Client{Timeout: 10 * time.Minute}).Get(m.URL)
	if err != nil {
		return "", err
	}
	defer res.Body.Close()
	if res.StatusCode != http.StatusOK {
		return "", fmt.Errorf("HTTP %d", res.StatusCode)
	}
	tmp := dest + ".part"
	f, err := os.OpenFile(tmp, os.O_CREATE|os.O_WRONLY|os.O_TRUNC, 0o755)
	if err != nil {
		return "", fmt.Errorf("pasta do exe sem permissão de escrita: %w", err)
	}
	h := sha256.New()
	n, err := io.Copy(io.MultiWriter(f, h), io.LimitReader(res.Body, maxExeSize+1))
	f.Close()
	if err != nil {
		os.Remove(tmp)
		return "", err
	}
	if n != m.Size {
		os.Remove(tmp)
		return "", fmt.Errorf("tamanho %d, esperado %d", n, m.Size)
	}
	if got := hex.EncodeToString(h.Sum(nil)); !strings.EqualFold(got, m.SHA256) {
		os.Remove(tmp)
		return "", fmt.Errorf("SHA-256 não confere (%s)", got[:12])
	}
	head := make([]byte, 2)
	if rf, err := os.Open(tmp); err == nil {
		_, _ = io.ReadFull(rf, head)
		rf.Close()
	}
	if string(head) != "MZ" && nodeExeName == "node.exe" {
		os.Remove(tmp)
		return "", errors.New("arquivo baixado não é um executável Windows")
	}
	_ = os.Remove(dest)
	if err := os.Rename(tmp, dest); err != nil {
		return "", err
	}
	return dest, nil
}

// busy pergunta ao server se há competição em andamento.
func (u *Updater) busy() (bool, string) {
	req, _ := http.NewRequest(http.MethodGet, fmt.Sprintf("http://127.0.0.1:%d/__launcher/busy", u.app.port), nil)
	req.Header.Set("X-Launcher-Token", u.app.token)
	res, err := u.client.Do(req)
	if err != nil {
		return false, ""
	}
	defer res.Body.Close()
	var b struct {
		Busy   bool   `json:"busy"`
		Reason string `json:"reason"`
	}
	_ = json.NewDecoder(res.Body).Decode(&b)
	return b.Busy, b.Reason
}

// Apply: consentimento dado. Ocupado → instala ao sair. Livre → troca agora
// e a versão nova sobe no lugar (o lançador atual sai).
func (u *Updater) Apply() UpdateView {
	u.mu.Lock()
	ready := u.state == "ready" || u.state == "deferred"
	u.mu.Unlock()
	if !ready {
		return u.View()
	}
	if busy, reason := u.busy(); busy {
		u.mu.Lock()
		u.applyOnQuit = true
		u.state = "deferred"
		u.message = reason
		u.mu.Unlock()
		u.app.log.Printf("atualização adiada (competição em andamento: %s): instala ao sair", reason)
		return u.View()
	}
	go func() {
		if err := u.swapAndRestart(true); err != nil {
			u.app.log.Printf("atualização: troca falhou: %v", err)
			u.app.errs.Record("update_swap_failed", "update", err.Error(), "")
			u.setState("error", err.Error())
		}
	}()
	v := u.View()
	v.Message = "restarting"
	return v
}

func (u *Updater) Later() UpdateView { return u.View() }

func (u *Updater) Skip() UpdateView {
	u.mu.Lock()
	m := u.manifest
	u.state, u.manifest, u.applyOnQuit = "none", nil, false
	path := u.downloaded
	u.downloaded = ""
	u.mu.Unlock()
	if m != nil {
		st := loadState(u.app.paths)
		st.SkipVersion = m.Version
		_ = saveState(u.app.paths, st)
	}
	if path != "" {
		_ = os.Remove(path)
	}
	return u.View()
}

// OnQuit: atualização adiada é instalada agora (sem subir a nova: ela
// confirma a saúde no próximo início).
func (u *Updater) OnQuit() {
	u.mu.Lock()
	pending := u.applyOnQuit && u.downloaded != ""
	u.mu.Unlock()
	if pending {
		if err := u.swapFiles(); err != nil {
			u.app.log.Printf("atualização ao sair falhou: %v", err)
		}
	}
}

func oldExePath(exe string) string {
	return filepath.Join(filepath.Dir(exe), "RefereeLights.old.exe")
}

func badExePath(exe string) string {
	return filepath.Join(filepath.Dir(exe), "RefereeLights.bad.exe")
}

// swapFiles: atual → .old.exe, .new → nome original; grava a verificação
// pendente para a próxima inicialização.
func (u *Updater) swapFiles() error {
	u.mu.Lock()
	newPath, m := u.downloaded, u.manifest
	u.mu.Unlock()
	if newPath == "" || m == nil {
		return errors.New("nada baixado")
	}
	old := oldExePath(u.exePath)
	_ = os.Remove(old)
	if err := os.Rename(u.exePath, old); err != nil {
		return fmt.Errorf("renomear versão atual: %w", err)
	}
	if err := os.Rename(newPath, u.exePath); err != nil {
		_ = os.Rename(old, u.exePath)
		return fmt.Errorf("colocar versão nova: %w", err)
	}
	// Trocado: nada mais pendente neste processo (sair não troca de novo)
	u.mu.Lock()
	u.downloaded, u.applyOnQuit, u.state = "", false, "none"
	u.mu.Unlock()
	st := loadState(u.app.paths)
	st.PendingVersion = m.Version
	st.PreviousVersion = version
	_ = saveState(u.app.paths, st)
	u.app.log.Printf("versão %s instalada no lugar da %s", m.Version, version)
	return nil
}

func (u *Updater) swapAndRestart(start bool) error {
	if err := u.swapFiles(); err != nil {
		return err
	}
	u.app.log.Printf("reiniciando na versão nova")
	u.app.sup.Stop()
	if start {
		if err := startDetached(u.exePath, "--post-update"); err != nil {
			// Não subiu: desfaz (a versão anterior continua valendo)
			_ = os.Rename(u.exePath, badExePath(u.exePath))
			_ = os.Rename(oldExePath(u.exePath), u.exePath)
			st := loadState(u.app.paths)
			st.BadVersion, st.PendingVersion = st.PendingVersion, ""
			_ = saveState(u.app.paths, st)
			u.app.sup.Start()
			return err
		}
	}
	u.app.requestExit()
	return nil
}

// verifyPostUpdate roda na versão NOVA: precisa ficar saudável em 60 s.
// Falhou → sobe a antiga com --rollback e sai.
func (a *App) verifyPostUpdate(exePath string) {
	st := loadState(a.paths)
	if st.PendingVersion == "" {
		return
	}
	if waitHealthy(a.port, postUpdateTimeout) {
		a.log.Printf("atualização para %s confirmada", version)
		st.PendingVersion, st.LastGood = "", version
		_ = saveState(a.paths, st)
		_ = os.Remove(oldExePath(exePath))
		return
	}
	a.log.Printf("versão %s não respondeu em %s: voltando para a anterior", version, postUpdateTimeout)
	a.errs.Record("update_rollback", "update", fmt.Sprintf("versão %s não ficou saudável; voltando para %s", version, st.PreviousVersion),
		tailLines(filepath.Join(a.paths.Logs, "server.log"), 20, 16<<10))
	old := oldExePath(exePath)
	if _, err := os.Stat(old); err != nil {
		a.log.Printf("rollback impossível: %v", err)
		return
	}
	a.sup.Stop()
	if err := startDetached(old, "--rollback"); err != nil {
		a.log.Printf("rollback: %v", err)
		a.sup.Start()
		return
	}
	a.requestExit()
}

// rollbackFiles roda na versão ANTIGA (iniciada como RefereeLights.old.exe).
func rollbackFiles(p Paths, self string) (string, error) {
	exe := filepath.Join(filepath.Dir(self), "RefereeLights.exe")
	st := loadState(p)
	bad := st.PendingVersion
	_ = os.Remove(badExePath(exe))
	if err := os.Rename(exe, badExePath(exe)); err != nil && !errors.Is(err, os.ErrNotExist) {
		return "", err
	}
	if err := os.Rename(self, exe); err != nil {
		return "", err
	}
	st.BadVersion, st.PendingVersion = bad, ""
	if err := saveState(p, st); err != nil {
		return "", err
	}
	return exe, nil
}

func cleanupUpdateLeftovers(exe string) {
	_ = os.Remove(badExePath(exe))
	_ = os.Remove(exe + ".new.part")
}

// --- controle local (o server repassa as ações do aviso no /admin) --------

func (u *Updater) serveControl(token string) (string, error) {
	mux := http.NewServeMux()
	auth := func(h func() UpdateView) http.HandlerFunc {
		return func(w http.ResponseWriter, r *http.Request) {
			if r.Header.Get("X-Launcher-Token") != token {
				http.NotFound(w, r)
				return
			}
			w.Header().Set("Content-Type", "application/json")
			_ = json.NewEncoder(w).Encode(h())
		}
	}
	mux.HandleFunc("GET /update", auth(u.View))
	mux.HandleFunc("POST /update/apply", auth(u.Apply))
	mux.HandleFunc("POST /update/later", auth(u.Later))
	mux.HandleFunc("POST /update/skip", auth(u.Skip))
	mux.HandleFunc("POST /update/check", auth(func() UpdateView { go u.Check(); return u.View() }))
	l, err := listenLoopback()
	if err != nil {
		return "", err
	}
	go func() { _ = http.Serve(l, mux) }()
	return "http://" + l.Addr().String(), nil
}

// compareVersions: "1.3.0" < "1.3.10" < "1.4.0"; sufixo (-rc.1) < sem sufixo.
func compareVersions(a, b string) int {
	ma, sa, _ := strings.Cut(a, "-")
	mb, sb, _ := strings.Cut(b, "-")
	pa, pb := strings.Split(ma, "."), strings.Split(mb, ".")
	for i := 0; i < max(len(pa), len(pb)); i++ {
		var x, y int
		if i < len(pa) {
			x, _ = strconv.Atoi(pa[i])
		}
		if i < len(pb) {
			y, _ = strconv.Atoi(pb[i])
		}
		if x != y {
			if x < y {
				return -1
			}
			return 1
		}
	}
	switch {
	case sa == sb:
		return 0
	case sa == "":
		return 1
	case sb == "":
		return -1
	case sa < sb:
		return -1
	default:
		return 1
	}
}
