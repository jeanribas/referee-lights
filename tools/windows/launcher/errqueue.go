package main

import (
	"bytes"
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"path/filepath"
	"sync"
	"time"
)

// Erros do lançador (extração, porta ocupada, node caindo, antivírus…).
// Vão para o log E para uma fila em data\launcher-errors.json; quando o
// server está no ar, a fila é entregue em /__launcher/error e segue o mesmo
// canal (e a mesma fila offline) dos erros do server e das telas.

const maxQueuedErrors = 100

type launcherError struct {
	Kind    string `json:"kind"`
	Context string `json:"context"`
	Message string `json:"message"`
	Detail  string `json:"detail,omitempty"`
	System  string `json:"system"`
	At      string `json:"at"`
}

type errorQueue struct {
	mu     sync.Mutex
	path   string
	system string
	items  []launcherError
}

func newErrorQueue(p Paths, system string) *errorQueue {
	q := &errorQueue{path: filepath.Join(p.Data, "launcher-errors.json"), system: system}
	if b, err := os.ReadFile(q.path); err == nil {
		_ = json.Unmarshal(b, &q.items)
	}
	return q
}

func (q *errorQueue) Record(kind, context, message, detail string) {
	q.mu.Lock()
	defer q.mu.Unlock()
	q.items = append(q.items, launcherError{
		Kind: kind, Context: context, Message: truncate(message, 300), Detail: truncate(detail, 1000),
		System: q.system, At: time.Now().UTC().Format(time.RFC3339),
	})
	if len(q.items) > maxQueuedErrors {
		q.items = q.items[len(q.items)-maxQueuedErrors:]
	}
	q.saveLocked()
}

func (q *errorQueue) saveLocked() {
	if len(q.items) == 0 {
		_ = os.Remove(q.path)
		return
	}
	b, _ := json.Marshal(q.items)
	_ = writeFileAtomic(q.path, b)
}

func (q *errorQueue) Len() int {
	q.mu.Lock()
	defer q.mu.Unlock()
	return len(q.items)
}

// Flush entrega na ordem; para no primeiro que falhar (tenta de novo depois).
func (q *errorQueue) Flush(port int, token string) {
	q.mu.Lock()
	defer q.mu.Unlock()
	client := &http.Client{Timeout: 3 * time.Second}
	sent := 0
	for _, e := range q.items {
		body, _ := json.Marshal(map[string]string{
			"kind": e.Kind, "context": e.Context, "message": e.Message,
			"detail": fmt.Sprintf("%s\n(em %s)", e.Detail, e.At), "system": e.System,
		})
		req, _ := http.NewRequest(http.MethodPost, fmt.Sprintf("http://127.0.0.1:%d/__launcher/error", port), bytes.NewReader(body))
		req.Header.Set("Content-Type", "application/json")
		req.Header.Set("X-Launcher-Token", token)
		res, err := client.Do(req)
		if err != nil {
			break
		}
		res.Body.Close()
		if res.StatusCode != http.StatusNoContent && res.StatusCode != http.StatusBadRequest {
			break
		}
		sent++
	}
	if sent > 0 {
		q.items = q.items[sent:]
		q.saveLocked()
	}
}

func truncate(s string, n int) string {
	if len(s) <= n {
		return s
	}
	return s[:n]
}

// writeFileAtomic: temporário + rename (queda no meio não deixa arquivo truncado).
func writeFileAtomic(path string, data []byte) error {
	tmp := fmt.Sprintf("%s.%d.tmp", path, os.Getpid())
	if err := os.WriteFile(tmp, data, 0o644); err != nil {
		return err
	}
	if err := os.Rename(tmp, path); err != nil {
		_ = os.Remove(tmp)
		return err
	}
	return nil
}
