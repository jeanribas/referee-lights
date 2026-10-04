// mkpayload: monta o payload.tar.zst do lançador a partir da pasta do pacote
// (dist/windows-bundle): server/, frontend/ e node/<node>. Ordem estável e
// datas zeradas: o mesmo conteúdo gera o mesmo payload (e o mesmo build id).
//
// Uso: go run ./cmd/mkpayload -src dist/windows-bundle -out payload.tar.zst
package main

import (
	"archive/tar"
	"flag"
	"fmt"
	"io"
	"io/fs"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"time"

	"github.com/klauspost/compress/zstd"
)

func main() {
	src := flag.String("src", "", "pasta do pacote")
	out := flag.String("out", "payload.tar.zst", "arquivo de saída")
	include := flag.String("include", "server,frontend,node", "subpastas incluídas")
	flag.Parse()
	if err := build(*src, *out, strings.Split(*include, ",")); err != nil {
		fmt.Fprintln(os.Stderr, "mkpayload:", err)
		os.Exit(1)
	}
}

func build(src, out string, include []string) error {
	var files []string
	for _, dir := range include {
		root := filepath.Join(src, dir)
		if _, err := os.Stat(root); err != nil {
			return fmt.Errorf("%s ausente: %w", root, err)
		}
		err := filepath.WalkDir(root, func(path string, d fs.DirEntry, err error) error {
			if err != nil {
				return err
			}
			if d.Type().IsRegular() && d.Name() != ".DS_Store" {
				files = append(files, path)
			}
			return nil
		})
		if err != nil {
			return err
		}
	}
	sort.Strings(files)

	f, err := os.Create(out)
	if err != nil {
		return err
	}
	defer f.Close()
	zw, err := zstd.NewWriter(f, zstd.WithEncoderLevel(zstd.SpeedBetterCompression))
	if err != nil {
		return err
	}
	tw := tar.NewWriter(zw)
	var total int64
	for _, path := range files {
		rel, _ := filepath.Rel(src, path)
		info, err := os.Stat(path)
		if err != nil {
			return err
		}
		mode := int64(0o644)
		if info.Mode()&0o111 != 0 || strings.HasSuffix(path, ".exe") {
			mode = 0o755
		}
		h := &tar.Header{Name: filepath.ToSlash(rel), Mode: mode, Size: info.Size(), ModTime: time.Unix(0, 0), Typeflag: tar.TypeReg, Format: tar.FormatPAX}
		if err := tw.WriteHeader(h); err != nil {
			return err
		}
		in, err := os.Open(path)
		if err != nil {
			return err
		}
		n, err := io.Copy(tw, in)
		in.Close()
		if err != nil {
			return err
		}
		total += n
	}
	if err := tw.Close(); err != nil {
		return err
	}
	if err := zw.Close(); err != nil {
		return err
	}
	st, _ := f.Stat()
	fmt.Printf("payload: %d arquivos, %.1f MB → %.1f MB (%s)\n", len(files), float64(total)/1e6, float64(st.Size())/1e6, out)
	return nil
}
