# Monitor Poli — PWA

Aplikacja do zapisywania pomiarów temperatury i dawek leków u dziecka,
zgodnie z zaleceniem lekarza. Działa offline, instaluje się na ekranie głównym telefonu.

## Struktura

```
pola_monitor/
├── index.html      # struktura strony
├── styles.css      # wygląd (+ tryb ciemny)
├── app.js          # cała logika: wpisy, wykres, powiadomienia
├── manifest.json   # metadane PWA (nazwa, ikony, kolory)
├── sw.js           # service worker: offline + powiadomienia
└── icons/          # ikony 192/512/maskable
```

## Uruchomienie lokalne

PWA wymaga serwera HTTP (nie zadziała z `file://`):

```bash
python3 -m http.server 8000
```

Otwórz `http://localhost:8000` (komendę uruchom w katalogu repozytorium).

## Publikacja (żeby mieć to na telefonie)

Najprościej — GitHub Pages:

1. Wrzuć folder do repozytorium na GitHubie.
2. Settings → Pages → Source: `main`, folder `/root`.
3. Wejdź na podany adres `https://uzytkownik.github.io/repo/` z telefonu.
4. Android (Chrome): menu → „Zainstaluj aplikację".
   iPhone (Safari): Udostępnij → „Do ekranu początkowego".

Alternatywy: Netlify (przeciągnij folder na netlify.com/drop), Vercel, Cloudflare Pages.

**Prywatne repozytorium:** Pages dla repo prywatnego wymaga planu GitHub Pro — na planie
Free działa tylko dla repozytoriów publicznych. Cloudflare Pages i Netlify podłączają
prywatne repo także na darmowym planie.

**Ważne:** powiadomienia i instalacja działają tylko po HTTPS (lub na localhost).
Na iPhonie powiadomienia działają dopiero po dodaniu do ekranu początkowego (iOS 16.4+).

## Zmiana dawek

Wszystkie dawki i reguły są w jednym miejscu — na górze `app.js`:

```js
const CONFIG = {
  CHILD_NAME: 'Pola',
  IBU:  { ml: 2.5, mg: 100, minGapH: 6, maxPerDay: 3 },
  PARA: { ml: 1.8, mg: 180, minGapH: 4 },
  PARA_CHECK_AFTER_H: 3,
  FEVER_THRESHOLD: 38,
  TEMP_REMINDER_H: 1
};
```

Zmieniaj **tylko po konsultacji z lekarzem**.

## Co potrafi

- zapis pomiarów temperatury i dawek jednym kliknięciem
- dopisywanie wpisów wstecz (inna data i godzina)
- usuwanie błędnych wpisów
- licznik dawek dobowych + blokada po 3 dawkach ibuprofenu
- ostrzeżenie, gdy próbujesz podać lek przed upływem minimalnego odstępu
- baner „sprawdź gorączkę" 3h po ibuprofenie
- wykres: krzywa temperatury + dawki obu leków na wspólnej osi czasu
- podsumowanie poprzednich dni (max temperatura, liczba dawek)
- eksport/import wszystkich danych do pliku JSON
- przypomnienie o pomiarze co godzinę (z ograniczeniem opisanym niżej)
- pełne działanie offline

**Jak działają przypomnienia:** to timer w działającej stronie, nie Web Push. Przypomnienie
przyjdzie, dopóki aplikacja jest otwarta lub świeżo w tle — gdy system usunie ją z pamięci,
nie przyjdzie. Po ponownym otwarciu odliczanie przelicza się od ostatniego pomiaru, więc
baner „czas zmierzyć temperaturę" pojawi się od razu.

## Uwaga

To narzędzie do **zapisywania** tego, co zalecił lekarz. Nie wylicza dawek
i nie zastępuje konsultacji medycznej.
