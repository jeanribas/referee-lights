//go:build windows

package main

import (
	"fmt"
	"strings"
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
	t := app.t
	systray.SetIcon(trayIcon)
	systray.SetTooltip(fmt.Sprintf("%s — localhost:%d", t.Tooltip, app.port))
	systray.SetOnTapped(func() { openBrowser(app.adminURL()) })

	open := systray.AddMenuItem(t.OpenPanel, "")
	addrMenu := systray.AddMenuItem(t.Addresses, "")
	slots := make([]*systray.MenuItem, maxAddressSlots)
	urls := make([]string, maxAddressSlots)
	for i := range slots {
		slots[i] = addrMenu.AddSubMenuItem("", "")
		slots[i].Hide()
	}
	none := addrMenu.AddSubMenuItem(t.NoAddress, "")
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
				slots[i].SetTitle(fmt.Sprintf("%s  (%s)", strings.TrimPrefix(list[i], "http://"), t.CopyHint))
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
						showMessage("Referee Lights", fmt.Sprintf(t.Copied, u), false)
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
	update := systray.AddMenuItem(t.UpdateCheck, "")
	logs := systray.AddMenuItem(t.ViewLogs, "")
	firewall := systray.AddMenuItem(t.Firewall, "")
	importData := systray.AddMenuItem(t.ImportData, "")
	systray.AddSeparator()
	remove := systray.AddMenuItem(t.RemoveData, "")
	quit := systray.AddMenuItem(t.Quit, "")

	promptUpdate := func(m Manifest) {
		update.SetTitle(fmt.Sprintf(t.UpdateInstall, m.Version))
		notes := m.NotesEN
		switch {
		case strings.HasPrefix(userLanguage(), "pt"):
			notes = m.NotesPT
		case strings.HasPrefix(userLanguage(), "es"):
			notes = m.NotesES
		}
		switch confirmUpdate("Referee Lights", fmt.Sprintf(t.UpdatePrompt, m.Version, notes)) {
		case 1:
			if v := app.updater.Apply(); v.State == "deferred" {
				showMessage("Referee Lights", fmt.Sprintf(t.UpdateDeferred, m.Version), false)
			}
		case -1:
			app.updater.Skip()
			update.SetTitle(t.UpdateCheck)
		}
	}
	// Achou sozinho: com competição em andamento, só muda o item da bandeja
	// (e o aviso no /admin); sem competição, pergunta.
	app.updater.onAvailable = func(m Manifest) {
		update.SetTitle(fmt.Sprintf(t.UpdateInstall, m.Version))
		if busy, _ := app.updater.busy(); !busy {
			go promptUpdate(m)
		}
	}

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
						showMessage("Referee Lights", fmt.Sprintf(t.UpdateFailed, v.Message), true)
					case v.State == "none":
						showMessage("Referee Lights", fmt.Sprintf(t.UpdateNone, version), false)
					}
				}()
			case <-open.ClickedCh:
				openBrowser(app.adminURL())
			case <-logs.ClickedCh:
				openFolder(app.paths.Logs)
			case <-firewall.ClickedCh:
				if err := allowFirewall(app.nodePath); err != nil {
					app.log.Printf("firewall: %v", err)
				}
			case <-importData.ClickedCh:
				dir, err := dialog.Directory().Title(t.ImportPick).Browse()
				if err != nil || dir == "" {
					continue
				}
				from, err := app.ImportFrom(dir)
				if err != nil {
					app.errs.Record("migrate_failed", "import", err.Error(), dir)
					showMessage("Referee Lights", fmt.Sprintf(t.ImportFail, err), true)
				} else {
					showMessage("Referee Lights", fmt.Sprintf(t.ImportDone, from), false)
				}
			case <-remove.ClickedCh:
				if confirm("Referee Lights", t.RemoveConfirm1) && confirm("Referee Lights", t.RemoveConfirm2) {
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
