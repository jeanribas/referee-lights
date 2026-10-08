//go:build windows

package main

import (
	"fmt"
	"strings"
	"sync"
	"time"

	"fyne.io/systray"
	"github.com/atotto/clipboard"
	"github.com/sqweek/dialog"
)

const maxAddressSlots = 6

// Bandeja: Abrir painel · Endereço para celulares (copia ao clicar) · Ver
// logs · Liberar no firewall · Importar dados da versão antiga… · Remover
// dados e sair · Sair. Clique simples no ícone abre o painel.
func setupTray(app *App, removeData *bool) {
	systray.SetIcon(trayIcon)
	systray.SetTooltip(fmt.Sprintf("%s — localhost:%d", app.T().Tooltip, app.port))
	systray.SetOnTapped(func() { app.showPanel() })

	open := systray.AddMenuItem(app.T().OpenPanel, "")
	openBrowserItem := systray.AddMenuItem(app.T().OpenInBrowser, "")
	addrMenu := systray.AddMenuItem(app.T().Addresses, "")
	slots := make([]*systray.MenuItem, maxAddressSlots)
	urls := make([]string, maxAddressSlots)
	for i := range slots {
		slots[i] = addrMenu.AddSubMenuItem("", "")
		slots[i].Hide()
	}
	none := addrMenu.AddSubMenuItem(app.T().NoAddress, "")
	none.Disable()
	refresh := func() {
		list := lanAddresses(app.port)
		none.Hide()
		if len(list) == 0 {
			none.Show()
		}
		for i := range slots {
			if i < len(list) {
				urls[i] = list[i]
				slots[i].SetTitle(fmt.Sprintf("%s  (%s)", strings.TrimPrefix(list[i], "http://"), app.T().CopyHint))
				slots[i].Show()
			} else {
				urls[i] = ""
				slots[i].Hide()
			}
		}
	}
	refresh()
	for i := range slots {
		go func(i int) {
			for range slots[i].ClickedCh {
				if u := urls[i]; u != "" {
					if err := clipboard.WriteAll(u); err == nil {
						showMessage("Referee Lights", fmt.Sprintf(app.T().Copied, u), false)
					}
				}
			}
		}(i)
	}
	// Rede muda (Wi-Fi troca, cabo): endereços atualizados a cada 20 s
	go func() {
		for {
			select {
			case <-app.quit:
				return
			case <-time.After(20 * time.Second):
				refresh()
			}
		}
	}()

	systray.AddSeparator()
	update := systray.AddMenuItem(app.T().UpdateCheck, "")
	logs := systray.AddMenuItem(app.T().ViewLogs, "")
	firewall := systray.AddMenuItem(app.T().Firewall, "")
	importData := systray.AddMenuItem(app.T().ImportData, "")
	systray.AddSeparator()
	remove := systray.AddMenuItem(app.T().RemoveData, "")
	quit := systray.AddMenuItem(app.T().Quit, "")

	var pendingMu sync.Mutex
	pending := "" // versão oferecida no item de atualização ("" = verificar)
	setUpdateTitle := func(v string) {
		pendingMu.Lock()
		pending = v
		pendingMu.Unlock()
		if v == "" {
			update.SetTitle(app.T().UpdateCheck)
		} else {
			update.SetTitle(fmt.Sprintf(app.T().UpdateInstall, v))
		}
	}
	// Idioma trocado no seletor do app: a bandeja acompanha na hora
	app.OnLangChange(func() {
		t := app.T()
		systray.SetTooltip(fmt.Sprintf("%s — localhost:%d", t.Tooltip, app.port))
		open.SetTitle(t.OpenPanel)
		openBrowserItem.SetTitle(t.OpenInBrowser)
		addrMenu.SetTitle(t.Addresses)
		none.SetTitle(t.NoAddress)
		refresh()
		logs.SetTitle(t.ViewLogs)
		firewall.SetTitle(t.Firewall)
		importData.SetTitle(t.ImportData)
		remove.SetTitle(t.RemoveData)
		quit.SetTitle(t.Quit)
		pendingMu.Lock()
		v := pending
		pendingMu.Unlock()
		setUpdateTitle(v)
	})

	promptUpdate := func(m Manifest) {
		setUpdateTitle(m.Version)
		notes := m.NotesEN
		switch app.Lang() {
		case "pt":
			notes = m.NotesPT
		case "es":
			notes = m.NotesES
		}
		switch confirmUpdate("Referee Lights", fmt.Sprintf(app.T().UpdatePrompt, m.Version, notes)) {
		case 1:
			if v := app.updater.Apply(); v.State == "deferred" {
				showMessage("Referee Lights", fmt.Sprintf(app.T().UpdateDeferred, m.Version), false)
			}
		case -1:
			app.updater.Skip()
			setUpdateTitle("")
		}
	}
	// Achou sozinho: com competição em andamento, só muda o item da bandeja
	// (e o aviso no /admin); sem competição, pergunta.
	app.updater.SetOnAvailable(func(m Manifest) {
		setUpdateTitle(m.Version)
		if busy, _ := app.updater.busy(); !busy {
			go promptUpdate(m)
		}
	})

	go func() {
		for {
			select {
			case <-update.ClickedCh:
				go func() {
					app.updater.Check()
					v := app.updater.View()
					switch {
					case (v.State == "ready" || v.State == "deferred") && app.updater.CurrentManifest() != nil:
						promptUpdate(*app.updater.CurrentManifest())
					case v.State == "error":
						showMessage("Referee Lights", fmt.Sprintf(app.T().UpdateFailed, v.Message), true)
					case v.State == "none":
						showMessage("Referee Lights", fmt.Sprintf(app.T().UpdateNone, version), false)
					}
				}()
			case <-open.ClickedCh:
				app.showPanel()
			case <-openBrowserItem.ClickedCh:
				openBrowser(app.adminURL())
			case <-logs.ClickedCh:
				openFolder(app.paths.Logs)
			case <-firewall.ClickedCh:
				if err := allowFirewall(app.nodePath); err != nil {
					app.log.Printf("firewall: %v", err)
				}
			case <-importData.ClickedCh:
				dir, err := dialog.Directory().Title(app.T().ImportPick).Browse()
				if err != nil || dir == "" {
					continue
				}
				from, err := app.ImportFrom(dir)
				if err != nil {
					app.errs.Record("migrate_failed", "import", err.Error(), dir)
					showMessage("Referee Lights", fmt.Sprintf(app.T().ImportFail, err), true)
				} else {
					showMessage("Referee Lights", fmt.Sprintf(app.T().ImportDone, from), false)
				}
			case <-remove.ClickedCh:
				if confirm("Referee Lights", app.T().RemoveConfirm1) && confirm("Referee Lights", app.T().RemoveConfirm2) {
					*removeData = true
					systray.Quit()
					return
				}
			case <-quit.ClickedCh:
				systray.Quit()
				return
			}
		}
	}()
}
