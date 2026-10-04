package main

import (
	"archive/tar"
	"bytes"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"sort"
	"strings"

	"github.com/klauspost/compress/zstd"
)

// Payload = tar.zst com server/, frontend/ e node/node.exe (montado pelo
// cmd/mkpayload no build). Extraído UMA vez por versão, de forma atômica:
// pasta temporária → marcador .complete com o SHA-256 do payload → rename.
// Uma extração interrompida (queda de energia, antivírus) nunca é usada.

const completeMarker = ".complete"

func payloadHash(payload []byte) string {
	sum := sha256.Sum256(payload)
	return hex.EncodeToString(sum[:])
}

// appDirName identifica a versão E o build: dois builds de teste com o mesmo
// número de versão não reaproveitam a pasta um do outro.
func appDirName(version, hash string) string {
	return fmt.Sprintf("%s-%s", version, hash[:8])
}

func isComplete(dir, hash string) bool {
	b, err := os.ReadFile(filepath.Join(dir, completeMarker))
	return err == nil && strings.TrimSpace(string(b)) == hash
}

// ensureExtracted garante app\<versão>-<build> e o node.exe em runtime\.
// Devolve a pasta do app e o caminho do node.
func ensureExtracted(payload []byte, p Paths, version, nodeVersion, nodeExe string) (string, string, error) {
	hash := payloadHash(payload)
	appDir := filepath.Join(p.Apps, appDirName(version, hash))
	nodeDir := filepath.Join(p.Runtime, "node-"+nodeVersion)
	nodePath := filepath.Join(nodeDir, nodeExe)

	appOK := isComplete(appDir, hash)
	_, nodeErr := os.Stat(nodePath)
	if appOK && nodeErr == nil {
		return appDir, nodePath, nil
	}

	tmp := fmt.Sprintf("%s.tmp-%d", appDir, os.Getpid())
	_ = os.RemoveAll(tmp)
	if err := os.MkdirAll(tmp, 0o755); err != nil {
		return "", "", err
	}
	defer os.RemoveAll(tmp)

	if err := untarZstd(bytes.NewReader(payload), tmp); err != nil {
		return "", "", fmt.Errorf("extração: %w", err)
	}

	// node.exe vai para o caminho estável (só se ainda não existir: o mesmo
	// node serve a várias versões do app)
	extractedNode := filepath.Join(tmp, "node", nodeExe)
	if nodeErr != nil {
		if _, err := os.Stat(extractedNode); err != nil {
			return "", "", fmt.Errorf("payload sem node/%s", nodeExe)
		}
		if err := os.MkdirAll(nodeDir, 0o755); err != nil {
			return "", "", err
		}
		nodeTmp := nodePath + fmt.Sprintf(".tmp-%d", os.Getpid())
		if err := copyFile(extractedNode, nodeTmp); err != nil {
			return "", "", err
		}
		if err := os.Rename(nodeTmp, nodePath); err != nil {
			_ = os.Remove(nodeTmp)
			if _, statErr := os.Stat(nodePath); statErr != nil {
				return "", "", err
			}
		}
	}
	_ = os.RemoveAll(filepath.Join(tmp, "node"))

	if !appOK {
		if err := os.WriteFile(filepath.Join(tmp, completeMarker), []byte(hash), 0o644); err != nil {
			return "", "", err
		}
		_ = os.RemoveAll(appDir) // extração antiga incompleta
		if err := os.Rename(tmp, appDir); err != nil {
			return "", "", fmt.Errorf("mover extração: %w", err)
		}
	}
	return appDir, nodePath, nil
}

func untarZstd(r io.Reader, dest string) error {
	zr, err := zstd.NewReader(r)
	if err != nil {
		return err
	}
	defer zr.Close()
	tr := tar.NewReader(zr)
	cleanDest := filepath.Clean(dest) + string(os.PathSeparator)
	for {
		h, err := tr.Next()
		if errors.Is(err, io.EOF) {
			return nil
		}
		if err != nil {
			return err
		}
		target := filepath.Join(dest, filepath.FromSlash(h.Name))
		if !strings.HasPrefix(target+string(os.PathSeparator), cleanDest) {
			return fmt.Errorf("caminho inválido no payload: %s", h.Name)
		}
		switch h.Typeflag {
		case tar.TypeDir:
			if err := os.MkdirAll(target, 0o755); err != nil {
				return err
			}
		case tar.TypeReg:
			if err := os.MkdirAll(filepath.Dir(target), 0o755); err != nil {
				return err
			}
			f, err := os.OpenFile(target, os.O_CREATE|os.O_WRONLY|os.O_TRUNC, 0o644|os.FileMode(h.Mode)&0o111)
			if err != nil {
				return err
			}
			if _, err := io.Copy(f, tr); err != nil {
				f.Close()
				return err
			}
			if err := f.Close(); err != nil {
				return err
			}
		default:
			// links e afins não fazem parte do pacote
		}
	}
}

// cleanupOldApps mantém a versão atual e a mais recente das outras (volta
// rápida se a nova der problema); apaga o resto e sobras de extração.
func cleanupOldApps(p Paths, current string) {
	entries, err := os.ReadDir(p.Apps)
	if err != nil {
		return
	}
	type item struct {
		path string
		mod  int64
	}
	var others []item
	for _, e := range entries {
		full := filepath.Join(p.Apps, e.Name())
		if full == current || !e.IsDir() {
			continue
		}
		if strings.Contains(e.Name(), ".tmp-") {
			_ = os.RemoveAll(full)
			continue
		}
		info, err := e.Info()
		if err != nil {
			continue
		}
		others = append(others, item{full, info.ModTime().UnixNano()})
	}
	sort.Slice(others, func(i, j int) bool { return others[i].mod > others[j].mod })
	for i, o := range others {
		if i >= 1 {
			_ = os.RemoveAll(o.path)
		}
	}
}

func copyFile(src, dst string) error {
	in, err := os.Open(src)
	if err != nil {
		return err
	}
	defer in.Close()
	info, err := in.Stat()
	if err != nil {
		return err
	}
	out, err := os.OpenFile(dst, os.O_CREATE|os.O_WRONLY|os.O_TRUNC, info.Mode().Perm())
	if err != nil {
		return err
	}
	if _, err := io.Copy(out, in); err != nil {
		out.Close()
		return err
	}
	return out.Close()
}
