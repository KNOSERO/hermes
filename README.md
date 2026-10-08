# Hermes Agent — lokalny panel

Hermes obsługujesz przez panel WWW działający lokalnie w kontenerze Podmana. Panel nie wymaga logowania. Otwórz go pod adresem <http://127.0.0.1:8787>.

## Struktura projektu

| Folder lub plik | Zawartość |
| --- | --- |
| `docker/Dockerfile` | Obraz panelu: Ansible, Docker CLI, kubectl i aplikacja WWW |
| `ansible/` | Główny playbook i zadania instalacji, uruchamiania, zatrzymania, połączenia Desktop, kopii oraz odtwarzania |
| `.config/hermes.yml` | Domyślne ustawienia przekazywane do Ansible |
| `.config/targets.yml` | Zapisane profile Podmana, zdalnego Dockera i Kubernetes; panel odczytuje je po ponownym uruchomieniu |
| `.config/job-history.json` | Lokalna historia jobów i ich logi; ignorowana przez Git i zachowywana po restarcie panelu |
| `.secret/` | Klucze SSH, kubeconfigi i loginy Desktop; katalog lokalny wykluczony z Gita i obrazu kontenera |
| `web/src/app/(panel)/` | Trzy niezależne strony Next.js: uruchamianie zadań, historia i konfiguracja |
| `web/src/Dashboard.jsx` | Stan panelu i połączenie widoków z API. |
| `web/src/components/` | Nawigacja, wybór backendu, operacje, ustawienia, historia, terminal i dialog. |
| `web/src/lib/` | Wspólne wywołanie API i nazwy/statusy zadań. |
| `web/src/style.css` | Style panelu. |
| `web/server.js` | Lokalny serwer API, historia zadań, terminal i serwowanie plików Next.js. |
| `web/next.config.mjs` | Ustawienia eksportu statycznej aplikacji Next.js. |
| `.backups/` | Archiwa danych Hermes przechowywane na hoście |

Frontend używa Next.js App Router. `next build` generuje statyczne pliki w `web/out/`; lokalny serwer Node obsługuje API, terminal i te pliki pod jednym adresem. Dzięki temu panel nie potrzebuje drugiego portu ani osobnego kontenera.

## Wymagania

- Podman z uruchomioną maszyną na Windows lub Podman na Linux/macOS.
- Dla zdalnego Dockera: prywatny klucz SSH do wgrania na stronie konfiguracji.
- Dla Kubernetes: kubeconfig z certyfikatami osadzonymi w pliku.

## Uruchomienie pierwszy raz

Wykonaj poniższe polecenia w PowerShell, z głównego folderu projektu.

### 1. Ustaw wartości domyślne

Ustaw domyślne parametry w [`.config/hermes.yml`](.config/hermes.yml). Panel i Ansible odczytują ten plik z katalogu repozytorium.

### 2. Przygotuj folder kopii i zbuduj obraz

```powershell
New-Item -ItemType Directory -Force .backups, .secret
podman build -t localhost/hermes-panel:dev -f docker/Dockerfile .
```

- `New-Item` tworzy folder `.backups` na kopie i ignorowany przez Git folder `.secret` na poświadczenia.
- `podman build` buduje obraz z plików projektu.
- `-t` nadaje obrazowi nazwę `localhost/hermes-panel:dev`.
- `-f` wskazuje plik budowania `docker/Dockerfile`.
- `.` przekazuje bieżący folder jako kontekst budowania.

### 3. Uruchom panel

```powershell
$socket = (podman info --format '{{.Host.RemoteSocket.Path}}') -replace '^unix://', ''
podman run -d --name hermes-panel --replace --restart=unless-stopped `
  --security-opt label=disable `
  -p 127.0.0.1:8787:8787 `
  -v "${PWD}/.backups:/backups" `
  -v "${PWD}/.config:/app/.config" `
  -v "${PWD}/.secret:/root/.ssh" `
  -v "${socket}:/run/podman/podman.sock" `
  localhost/hermes-panel:dev
```

Co robią te argumenty:

| Argument | Działanie |
| --- | --- |
| `podman info ...` | Pobiera ścieżkę socketu API Podmana. |
| `podman run -d` | Uruchamia panel w tle. |
| `--name hermes-panel` | Nadaje kontenerowi nazwę używaną w poleceniach poniżej. |
| `--replace` | Zatrzymuje i usuwa poprzedni kontener panelu o tej samej nazwie. Nie usuwa folderu kopii ani danych Hermes. |
| `--restart=unless-stopped` | Uruchamia panel ponownie po restarcie Podmana, chyba że wcześniej zatrzymasz go ręcznie. |
| `--security-opt label=disable` | Pozwala kontenerowi panelu korzystać z zamontowanego socketu Podmana. |
| `-p 127.0.0.1:8787:8787` | Udostępnia panel tylko na lokalnym komputerze. |
| `-v ...:/backups` | Udostępnia kontenerowi folder kopii z projektu. |
| `-v .../.config:/app/.config` | Udostępnia konfigurację i profile, które panel zapisuje w repozytorium. |
| `-v .../.secret:/root/.ssh` | Udostępnia sekrety panelowi; katalog jest wykluczony z Gita. |
| `-v ...:/run/podman/podman.sock` | Pozwala panelowi wykonywać operacje na lokalnym Podmanie. |
| `localhost/hermes-panel:dev` | Wskazuje obraz, który ma zostać uruchomiony. |

Otwórz <http://127.0.0.1:8787>. Socket Podmana daje dostęp do zarządzania kontenerami, dlatego panel działa bez logowania wyłącznie na `127.0.0.1`. Nie zmieniaj tego adresu na `0.0.0.0` i nie wystawiaj panelu do sieci. [Dokumentacja Podmana opisuje uprawnienia socketu API](https://docs.podman.io/en/latest/markdown/podman-system-service.1.html).

## Operacje dostępne w panelu

Panel ma trzy osobne strony dostępne z bocznego menu:

| Strona | Działanie |
| --- | --- |
| **Nowy strzał** | Wybór środowiska i cykl Hermes: Install, Run, Stop, Connect, Backup, Restore. |
| **Historia strzałów** | Logi i status maksymalnie 30 ostatnich zadań. Historia jest zapisywana w `.config/job-history.json` i wczytywana po restarcie panelu. |
| **Konfiguracja** | Edycja domyślnych parametrów oraz dodawanie, edytowanie i usuwanie wielu profili Docker i Kubernetes. |

Profile i domyślne ustawienia są zapisywane w `.config`, który jest montowany do kontenera z repozytorium. Po restarcie panel wczytuje te same profile. Klucze SSH, kubeconfigi i wygenerowane loginy Desktop trafiają do `.secret`; to zwykłe, lokalne pliki bez szyfrowania, wykluczone z Gita i obrazu kontenera. Nie commituj ich ani nie kopiuj do `.config`.

| Przycisk | Działanie |
| --- | --- |
| **Install** | Pobiera obraz, tworzy trwały wolumen danych i generuje login do Hermes Desktop w `.secret`. |
| **Run** | Uruchamia Hermes Gateway. |
| **Stop** | Zatrzymuje Gateway i serwer Desktop, zachowując wolumen danych oraz kopie. |
| **Connect** | Uruchamia uwierzytelniony `hermes serve` na porcie `9119` i pokazuje URL, użytkownika oraz hasło. |
| **Backup** | Zapisuje archiwum w `.backups`; możesz podać etykietę. |
| **Restore** | Prosi o potwierdzenie, tworzy kopię bieżących danych i odtwarza wybrane archiwum. |

Na stronie **Nowy strzał** wykonaj **Install → Run → Connect**. Po **Connect** skopiuj dane z panelu. W Hermes Desktop otwórz **Settings → Gateways → Remote gateway**, podaj pokazany URL i zaloguj się wygenerowanym użytkownikiem oraz hasłem. W Desktop możesz potem skonfigurować model i dostawcę. Panel wyświetla logi Ansible i status operacji.

Na stronie **Konfiguracja** dodaj profil z nazwą, parametrami Hermes i danymi połączenia. Dla Dockera podaj użytkownika, host, port SSH i klucz prywatny; URL Desktop domyślnie użyje `http://<host>:9119`. Dla Kubernetes wgraj kubeconfig, wybierz kontekst i wpisz URL osiągalnego węzła, np. `http://192.168.1.20:31119`. Panel zapisuje poświadczenia lokalnie w `.secret/`.

Dla lokalnego Podmana Desktop używa `http://127.0.0.1:9119`. Przy tunelu SSH maszyny Podmana na Windows przekieruj także port `9119` (polecenie poniżej). Dla zdalnego Dockera ogranicz port `9119` firewallem do zaufanej sieci lub VPN. Kubernetes wystawia Desktop jako NodePort `31119`.

## Codzienna obsługa

```powershell
podman logs -f hermes-panel
```

Wyświetla logi serwera panelu na bieżąco. Zakończ podgląd klawiszami `Ctrl+C`; kontener nadal będzie działał.

```powershell
podman stop hermes-panel
```

Zatrzymuje panel. Nie usuwa danych Hermes ani kopii.

```powershell
podman start hermes-panel
```

Uruchamia ponownie istniejący kontener panelu.

## Sprawdzenie Ansible

Te polecenia sprawdzają playbook bez uruchamiania panelu WWW. Wykonuj je po zbudowaniu obrazu.

```powershell
$socket = (podman info --format '{{.Host.RemoteSocket.Path}}') -replace '^unix://', ''
$mounts = @(
  '--security-opt', 'label=disable',
  '-v', "${PWD}/.backups:/backups",
  '-v', "${PWD}/.config:/app/.config:ro",
  '-v', "${socket}:/run/podman/podman.sock"
)
$ansible = @('/app/ansible/playbook.yml', '--inventory', 'localhost,', '--connection', 'local')

podman run --rm @mounts -e HERMES_BACKEND=podman -e HERMES_ACTION=install -e DOCKER_HOST=unix:///run/podman/podman.sock --entrypoint ansible-playbook localhost/hermes-panel:dev @ansible --syntax-check
podman run --rm @mounts -e HERMES_BACKEND=podman -e HERMES_ACTION=install -e DOCKER_HOST=unix:///run/podman/podman.sock --entrypoint ansible-playbook localhost/hermes-panel:dev @ansible --check
```

- `$mounts` montuje ustawienia tylko do odczytu oraz daje dostęp do socketu Podmana.
- `$ansible` zawiera playbook i lokalne inventory.
- `--entrypoint ansible-playbook` uruchamia Ansible zamiast serwera WWW.
- `--syntax-check` sprawdza składnię i strukturę playbooka.
- `--check` pokazuje planowane zmiany, nie wykonując zadań. Nie wszystkie moduły obsługują ten tryb.

## Problem z portem na Windows

W Podmanie `6.0.2` zgłoszono problem z przekazywaniem portów z maszyny WSL do Windows. Jeśli kontener działa, ale `http://127.0.0.1:8787` odmawia połączenia, sprawdź panel wewnątrz maszyny:

```powershell
podman machine ssh -- curl -fsS http://127.0.0.1:8787/api/config
```

Jeśli polecenie zwróci konfigurację JSON, panel działa. Otwórz lokalny tunel SSH, aby obejść problem przekazywania portu:

```powershell
$machine = podman machine inspect --format '{{.SSHConfig.Port}}|{{.SSHConfig.IdentityPath}}|{{.SSHConfig.RemoteUsername}}'
$parts = $machine.Trim() -split '\|', 3
$knownHosts = Join-Path $env:TEMP 'hermes-podman-known_hosts'
ssh.exe -N -L 127.0.0.1:8787:127.0.0.1:8787 `
  -L 127.0.0.1:9119:127.0.0.1:9119 -p $parts[0] -i $parts[1] `
  -o IdentitiesOnly=yes -o ExitOnForwardFailure=yes `
  -o StrictHostKeyChecking=accept-new -o "UserKnownHostsFile=$knownHosts" `
  "$($parts[2])@127.0.0.1"
```

Pozostaw to okno PowerShell otwarte i odśwież `http://127.0.0.1:8787`. `Ctrl+C` zamyka tunel. Tunel słucha wyłącznie na `127.0.0.1`, więc nie udostępnia panelu innym urządzeniom. Nie zmieniaj mapowania portu na `0.0.0.0` — panel nie ma logowania. Zobacz [zgłoszenie problemu w repozytorium Podmana](https://github.com/podman-container-tools/podman/issues/29377).
