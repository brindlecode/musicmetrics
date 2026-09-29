---
title: "Methodik: So werden die MusicMetrics-Charts berechnet"
description: "Datenquellen, Aktualisierungsrhythmus und die genaue Formel hinter den MusicMetrics Global 200, den Bewegungspfeilen, Höchstplatzierungen und Tagen in den Charts."
schemaType: "WebPage"
---

Diese Seite erklärt genau, woher unsere Zahlen stammen und wie sie berechnet werden – damit jeder sie überprüfen oder zitieren kann.

## Datenquellen

| Plattform | Was wir erfassen | Abdeckung |
|---|---|---|
| YouTube | Angesagte Musikvideos (offizielle YouTube Data API), Aufrufzahlen, Kanalstatistiken | ~110 Länder, Top 50 |
| Apple Music | „Meistgespielte“ Songs und Alben (offizieller RSS-Feed der Apple Marketing Tools) | ~170 Storefronts, Top 100 |
| iTunes | Meistverkaufte Songs (offizieller iTunes-Store-RSS) | ~170 Storefronts, Top 100 |
| Deezer | Offizielle „Top &lt;Land&gt;“-Playlists von Deezer Charts (öffentliche Deezer API) | Weltweit + Länder-Charts, Top 100 |
| Last.fm | Top-Tracks nach Hörern (offizielle Last.fm API), sofern aktiviert | Weltweit + Länder |

Alle Daten werden automatisch **täglich** erfasst. Ist eine Quelle vorübergehend nicht erreichbar, bleibt die letzte erfolgreiche Version bis zu 5 Tage bestehen und ist mit einem deutlichen Zeitstempel versehen.

## Bewegung, Höchstplatzierung und Tage in den Charts

- **Bewegung (▲ ▼ =)** vergleicht die heutige Platzierung eines Songs mit seiner Platzierung am vorherigen Erfassungstag der Chart.
- **NEU** kennzeichnet einen Song, der seit Beginn der Erfassung noch nie in dieser Chart war. **RE** kennzeichnet einen Wiedereinstieg.
- **Peak** ist die beste Platzierung, die seit Beginn der Erfassung in dieser Chart erreicht wurde.
- **Tage** zählt die einzelnen Tage, an denen der Song in dieser Chart stand.

## Die MusicMetrics Global 200

Jede Platzierung in jeder Song-Chart bringt Punkte:

`points = platform weight × market weight × ((N + 1 − rank) / N) ^ 1.5`

Dabei ist *N* die Länge der Chart (50 oder 100). Der Exponent belohnt Spitzenplätze stärker, als es eine gerade Linie täte.

- **Plattformgewicht:** YouTube 1,0, Apple Music 1,0, iTunes 0,6, Deezer 0,6, Last.fm 0,5.
- **Marktgewicht:** basiert auf der Größe des jeweiligen Musikmarkts – USA 3,0; Japan, Vereinigtes Königreich, Deutschland 2,5; Frankreich, Südkorea, Brasilien, Kanada, Australien 2,0; Mexiko, Italien, Spanien, Indien 1,6; Niederlande 1,5; Schweden, Indonesien, Türkei 1,4; Philippinen, Polen 1,3; alle anderen Länder 1,0. Weltweite Charts zählen 3,0.

Die Punkte eines Songs werden über alle Charts summiert, und die 200 höchsten Summen bilden die Global 200. Die Spalte **Punkte** wird relativ zum Nummer-eins-Song (= 100) angezeigt.

Songs werden plattformübergreifend anhand von Hauptkünstler und Titel zugeordnet (ohne „feat.“-Angaben, Video-Zusätze wie „Official Video“, Akzente sowie Groß- und Kleinschreibung).

## Künstler-Ranking

Künstler erhalten die Punkte ihrer Songs – volle Punkte als Hauptkünstler, halbe Punkte als Featured Artist – summiert über alle Charts.

## Tägliche YouTube-Aufrufe

Wir speichern täglich einen Snapshot der Aufrufzahl jedes erfassten Videos. Die Tagesaufrufe sind die Differenz zwischen dem neuesten Snapshot und dem, der 24 Stunden zuvor am nächsten liegt, hochgerechnet auf genau 24 Stunden.

## Einschränkungen

- Für die meisten Charts veröffentlichen die Plattformen Rankings, keine Streamzahlen; wir schätzen keine Streams, die wir nicht messen können.
- YouTube-„Trends“ sind YouTubes eigene Auswahl beliebter Musikvideos in einem Land, kein reines Aufruf-Ranking.
- Künstlernamen werden automatisch vereinheitlicht; wenn dir ein Fehler auffällt, [sag uns Bescheid](/de/contact/).
