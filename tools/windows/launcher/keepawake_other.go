//go:build !windows

package main

import "log"

// Fora do Windows (desenvolvimento e testes) não há o que segurar.
func startKeepAwake(*log.Logger) {}
