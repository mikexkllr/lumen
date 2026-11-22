# Lumen auf einem eigenen VPS betreiben

Diese Anleitung bringt Lumen mit `docker-compose.prod.yml` auf einen einzelnen Server:
Caddy holt automatisch TLS-Zertifikate von Let's Encrypt, liefert die Web-App aus und
leitet `/api/*` an den Lumen-Server (Sync, Lux, Social) weiter. Andere Varianten
(nur statische PWA, einfaches Compose) und die vollständige Variablen-Referenz stehen in
[self-hosting.md](self-hosting.md).

## 1. Voraussetzungen

- VPS mit **1 vCPU, 1–2 GB RAM, 10 GB SSD** (reicht für Hunderte aktive Nutzer:innen; der
  Bau des Web-Images braucht kurzzeitig am meisten Speicher – bei 1 GB RAM Swap anlegen)
- Linux mit aktuellem Docker Engine und Compose-Plugin (z. B. Debian 13 oder Ubuntu 24.04,
  Installation nach <https://docs.docker.com/engine/install/>)
- eine (Sub-)Domain, z. B. `lumen.example.org`
- optional ein Konto bei einem OpenAI-kompatiblen Modellanbieter (z. B. OpenRouter) für Lux

Ein Hoster in der EU vereinfacht den Datenschutz. Mit dem Hoster einen
Auftragsverarbeitungsvertrag (AVV) abschließen.

## 2. DNS

Beim DNS-Anbieter für die Domain einen **A-Eintrag** auf die IPv4-Adresse des Servers
setzen (und einen **AAAA-Eintrag** für IPv6, falls vorhanden). Prüfen:

```bash
dig +short lumen.example.org
```

Erst wenn die Adresse stimmt, Lumen starten – sonst scheitert die Zertifikatsausstellung
(Let's Encrypt begrenzt fehlgeschlagene Versuche).

## 3. Server vorbereiten

```bash
# als root bzw. mit sudo
apt update && apt upgrade -y
adduser lumen && usermod -aG docker lumen     # eigener Benutzer für den Betrieb

# Firewall: nur SSH, HTTP und HTTPS (inkl. HTTP/3 über UDP)
apt install -y ufw
ufw allow OpenSSH
ufw allow 80/tcp
ufw allow 443/tcp
ufw allow 443/udp
ufw enable

# automatische Sicherheitsupdates
apt install -y unattended-upgrades
```

Hinweis: Docker veröffentlicht Ports an ufw vorbei. Das Compose-File öffnet bewusst nur
80 und 443 (Caddy); Server und Web-Container haben keine offenen Ports. SSH möglichst nur
mit Schlüssel erlauben (`PasswordAuthentication no` in `/etc/ssh/sshd_config`).

## 4. Lumen holen und konfigurieren

```bash
sudo mkdir -p /opt/lumen && sudo chown lumen: /opt/lumen
su - lumen
git clone https://github.com/<owner>/lumen.git /opt/lumen
cd /opt/lumen
cp .env.example .env
chmod 600 .env
nano .env
```

Mindestens setzen:

| Variable | Wert |
|---|---|
| `LUMEN_DOMAIN` | `lumen.example.org` |
| `LUMEN_ACME_EMAIL` | Adresse für Hinweise von Let's Encrypt |
| `VITE_LUMEN_OPERATOR` | Name des Betreibers (Impressum, Datenschutz) |
| `VITE_LUMEN_OPERATOR_ADDRESS` | ladungsfähige Anschrift, Zeilen mit `\n` trennen, in einfachen Anführungszeichen |
| `VITE_LUMEN_CONTACT` | Kontakt-E-Mail |
| `LUMEN_ADMIN_TOKEN` | Moderations-Token, z. B. `openssl rand -hex 32` (mind. 16 Zeichen) |

Optionale Variablen auskommentiert lassen statt sie leer zu setzen. `VITE_*`-Werte landen
im öffentlichen JavaScript – dort niemals Geheimnisse eintragen.

## 5. Starten

```bash
docker compose -f docker-compose.prod.yml up -d --build
docker compose -f docker-compose.prod.yml ps        # alle drei „Up“, web und server „healthy“
curl https://lumen.example.org/api/healthz         # {"ok":true}
```

Der erste Bau dauert einige Minuten (Abhängigkeiten, Content-Bundles, PWA). Danach ist
Lumen unter `https://lumen.example.org` erreichbar. Die Rechtstexte liegen unter
`https://lumen.example.org/#/legal/privacy`, `…/#/legal/terms` und `…/#/legal/imprint` –
die erste URL dient auch als Datenschutz-URL in den App-Stores.

Tipp: Um sich `-f docker-compose.prod.yml` zu sparen, `COMPOSE_FILE=docker-compose.prod.yml`
in `.env` eintragen; dann reicht `docker compose …`.

## 6. Lux mit einem Sprachmodell (OpenRouter)

Ohne Modell antwortet Lux mit dem eingebauten Regel-Tutor (`LUMEN_TUTOR=off` in `.env`).
Für ein Modell bei OpenRouter:

1. Auf <https://openrouter.ai> ein Konto anlegen, Guthaben aufladen, einen API-Schlüssel
   erzeugen und am besten ein Ausgabelimit für den Schlüssel setzen.
2. In den Datenschutzeinstellungen von OpenRouter Anbieter ausschließen, die Eingaben
   speichern oder zum Training verwenden.
3. In `.env` die Zeile `LUMEN_TUTOR=off` entfernen und eintragen:

   ```bash
   LUMEN_TUTOR_URL=https://openrouter.ai/api/v1
   LUMEN_TUTOR_MODEL=qwen/qwen3-30b-a3b
   LUMEN_TUTOR_API_KEY=sk-or-...
   ```

4. Server neu starten: `docker compose -f docker-compose.prod.yml up -d server`
5. Prüfen: `curl https://lumen.example.org/api/v1/tutor` zeigt den Modellnamen.

Weitere Stellschrauben: `LUMEN_TUTOR_MAX_TOKENS`, `LUMEN_TUTOR_TEMPERATURE`,
`LUMEN_TUTOR_TIMEOUT_MS`, `LUMEN_TUTOR_RATE_LIMIT` (siehe `.env.example`). Unter 16-Jährige
bekommen immer den Regel-Tutor. Den Modellanbieter in der Datenschutzerklärung nennen:
Lux schickt Aufgabe, Antwort und Chat-Nachrichten dorthin.

## 7. Updates

```bash
cd /opt/lumen
deploy/backup.sh                                     # vorher sichern
git pull
docker compose -f docker-compose.prod.yml up -d --build
docker image prune -f                                # alte Images aufräumen
```

Images von Caddy und Node/nginx werden beim `--build` nicht automatisch aktualisiert;
gelegentlich `docker compose -f docker-compose.prod.yml build --pull` und
`docker compose -f docker-compose.prod.yml pull caddy` ausführen, dann `up -d`.

Nach einem Update lädt die PWA die neue Version beim nächsten Öffnen automatisch
(Service Worker mit `autoUpdate`).

## 8. Backups

`deploy/backup.sh` sichert die SQLite-Datenbank im laufenden Betrieb (`VACUUM INTO` im
Server-Container, inklusive WAL, mit Integritätsprüfung) nach
`backups/lumen-<Zeit>.sqlite.gz` und behält die letzten 14 Sicherungen
(`LUMEN_BACKUP_KEEP`, `LUMEN_BACKUP_DIR` in `.env`).

```bash
deploy/backup.sh                        # Sicherung jetzt
crontab -e                              # täglich um 03:15:
15 3 * * * cd /opt/lumen && deploy/backup.sh >> backups/backup.log 2>&1
```

Die Sicherungen zusätzlich **außerhalb des Servers** ablegen (z. B. `restic`, `borg` oder
`rsync` auf einen Storage-Box-Speicher), sonst sind sie mit dem Server verloren. Sie
enthalten personenbezogene Daten: verschlüsselt speichern und Löschfristen beachten
(gelöschte Konten verschwinden erst mit der Rotation auch aus den Sicherungen – das in der
Datenschutzerklärung erwähnen).

**Wiederherstellen:**

```bash
deploy/backup.sh restore backups/lumen-20261122T031500Z.sqlite.gz
```

Das Skript fragt nach, sichert zuerst den aktuellen Stand, stoppt den Server, ersetzt die
Datenbank (und entfernt die alte WAL-Datei) und startet den Server wieder. Die
Zertifikate liegen im Volume `lumen-prod_caddy-data`; sie werden bei Verlust einfach neu
ausgestellt.

## 9. Logs und Betrieb

```bash
docker compose -f docker-compose.prod.yml logs -f server     # Server (nur Warnungen/Fehler)
docker compose -f docker-compose.prod.yml logs -f caddy      # Zertifikate, Proxy-Fehler
docker compose -f docker-compose.prod.yml restart server
docker stats
```

Die Logs werden von Docker rotiert (5 × 10 MB pro Container). Der Server loggt keine
Lerninhalte und keine Tutor-Nachrichten. Caddy schreibt standardmäßig **keine
Zugriffslogs** (IP-Adressen sind personenbezogen); zur Fehlersuche lässt sich der
`log`-Block in `deploy/Caddyfile` einkommentieren – danach wieder abschalten.

## 10. Moderation

Social-Funktionen enthalten selbst gewählte Anzeigenamen und Handles. Nutzer:innen können
andere melden und blockieren; ein Namensfilter greift beim Speichern. Mit gesetztem
`LUMEN_ADMIN_TOKEN` stehen die Moderations-Endpunkte bereit:

```bash
TOKEN=$(sed -n 's/^LUMEN_ADMIN_TOKEN=//p' /opt/lumen/.env)
API=https://lumen.example.org/api

# offene Meldungen (mit ?resolved=1 die erledigten)
curl -H "Authorization: Bearer $TOKEN" $API/v1/admin/reports

# Nutzer:in nachschlagen (per userId oder @handle)
curl -H "Authorization: Bearer $TOKEN" $API/v1/admin/users/@handle

# sperren / entsperren
curl -X POST -H "Authorization: Bearer $TOKEN" $API/v1/admin/users/<userId>/ban
curl -X POST -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
     -d '{"banned":false}' $API/v1/admin/users/<userId>/ban

# anstößigen Namen zurücksetzen, Meldung als erledigt markieren
curl -X POST -H "Authorization: Bearer $TOKEN" $API/v1/admin/users/<userId>/reset-name
curl -X POST -H "Authorization: Bearer $TOKEN" $API/v1/admin/reports/<id>/resolve
```

Meldungen regelmäßig (für die App-Stores: zeitnah, mindestens täglich) prüfen. Wer keine
Moderation leisten kann, schaltet Social ab: `LUMEN_SOCIAL=off` in `.env`, dann
`docker compose -f docker-compose.prod.yml up -d server`.

## 11. Vor dem öffentlichen Start

- Impressum, Datenschutzerklärung und Nutzungsbedingungen anwaltlich prüfen lassen (die
  In-App-Texte sind Vorlagen, die beschreiben, was der Code tut)
- Verzeichnis von Verarbeitungstätigkeiten anlegen, AVV mit Hoster und Modellanbieter,
  Datenschutz-Folgenabschätzung (DSFA) prüfen – Minderjährige sind Zielgruppe
- AGPL: Wer den Code ändert und die Instanz anbietet, muss den Quellcode der geänderten
  Version anbieten (z. B. öffentlicher Fork)
- Name und Logo: [TRADEMARK.md](../TRADEMARK.md)
- Wiederherstellung einmal testen
