// signmanifest: gera o par de chaves do canal de atualização ou assina um
// manifesto (ed25519, assinatura em base64 sobre os bytes exatos).
//
//	go run ./cmd/signmanifest -genkey <arquivo-da-chave-privada>   (imprime só a PÚBLICA)
//	UPDATE_SIGNING_KEY=<privada base64> go run ./cmd/signmanifest -sign manifest.json  (gera manifest.json.sig)
package main

import (
	"crypto/ed25519"
	"crypto/rand"
	"encoding/base64"
	"flag"
	"fmt"
	"os"
	"strings"
)

func main() {
	genkey := flag.String("genkey", "", "grava a chave privada neste arquivo (0600) e imprime a pública")
	sign := flag.String("sign", "", "manifesto a assinar (usa UPDATE_SIGNING_KEY)")
	flag.Parse()
	switch {
	case *genkey != "":
		pub, priv, err := ed25519.GenerateKey(rand.Reader)
		check(err)
		f, err := os.OpenFile(*genkey, os.O_CREATE|os.O_EXCL|os.O_WRONLY, 0o600)
		check(err)
		_, err = f.WriteString(base64.StdEncoding.EncodeToString(priv) + "\n")
		check(err)
		check(f.Close())
		fmt.Println(base64.StdEncoding.EncodeToString(pub))
	case *sign != "":
		raw := strings.TrimSpace(os.Getenv("UPDATE_SIGNING_KEY"))
		key, err := base64.StdEncoding.DecodeString(raw)
		if err != nil || len(key) != ed25519.PrivateKeySize {
			fail("UPDATE_SIGNING_KEY ausente ou inválida")
		}
		body, err := os.ReadFile(*sign)
		check(err)
		sig := ed25519.Sign(ed25519.PrivateKey(key), body)
		check(os.WriteFile(*sign+".sig", []byte(base64.StdEncoding.EncodeToString(sig)+"\n"), 0o644))
		fmt.Printf("assinado: %s.sig (chave pública %s)\n", *sign, base64.StdEncoding.EncodeToString(ed25519.PrivateKey(key).Public().(ed25519.PublicKey)))
	default:
		flag.Usage()
		os.Exit(2)
	}
}

func check(err error) {
	if err != nil {
		fail(err.Error())
	}
}

func fail(msg string) {
	fmt.Fprintln(os.Stderr, "signmanifest:", msg)
	os.Exit(1)
}
