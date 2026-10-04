//go:build !windows && embedpayload

package main

import _ "embed"

// Desenvolvimento/testes fora do Windows: payload embutido como no exe
// (go build -tags embedpayload).
//
//go:embed payload.tar.zst
var embeddedPayload []byte
