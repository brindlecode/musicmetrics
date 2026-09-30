---
title: "Metodología: cómo se calculan las listas de MusicMetrics"
description: "Fuentes de datos, frecuencia de actualización y la fórmula exacta detrás del Global 200 de MusicMetrics, las flechas de movimiento, los máximos y los días en lista."
schemaType: "WebPage"
---

Esta página explica exactamente de dónde salen nuestras cifras y cómo se calculan, para que cualquiera pueda verificarlas o citarlas.

## Fuentes de datos

| Plataforma | Qué recopilamos | Cobertura |
|---|---|---|
| YouTube | Vídeos musicales en tendencia (YouTube Data API oficial), número de vistas, estadísticas de canales | ~110 países, top 50 |
| Apple Music | Canciones y álbumes «Most Played» (RSS oficial de Apple Marketing Tools) | ~170 tiendas, top 100 |
| iTunes | Canciones más vendidas (RSS oficial de iTunes Store) | ~170 tiendas, top 100 |
| Deezer | Playlists oficiales «Top &lt;País&gt;» publicadas por Deezer Charts (API pública de Deezer) | Mundial + listas por país, top 100 |
| Last.fm | Canciones más escuchadas por oyentes (API oficial de Last.fm), cuando está activada | Mundial + países |

Todos los datos se recopilan automáticamente **cada día**. Si una fuente no está disponible temporalmente, se conserva la última versión correcta durante un máximo de 5 días, con su fecha y hora claramente indicadas.

## Movimiento, máximo y días en lista

- **Movimiento (▲ ▼ =)** compara la posición de una canción hoy con su posición el día anterior en que se recopiló la lista.
- **NUEVO** marca una canción que nunca había aparecido en esa lista desde que empezó el seguimiento. **RE** marca un reingreso.
- **Máximo** es la mejor posición alcanzada en esa lista desde que empezó el seguimiento.
- **Días** cuenta los días distintos en que la canción apareció en esa lista.

## El Global 200 de MusicMetrics

Cada posición en cada lista de canciones suma puntos:

`points = platform weight × market weight × ((N + 1 − rank) / N) ^ 1.5`

donde *N* es la longitud de la lista (50 o 100). El exponente premia las primeras posiciones más de lo que lo haría una línea recta.

- **Peso de la plataforma:** YouTube 1,0, Apple Music 1,0, iTunes 0,6, Deezer 0,6, Last.fm 0,5.
- **Peso del mercado:** según el tamaño de cada mercado de música grabada — Estados Unidos 3,0; Japón, Reino Unido, Alemania 2,5; Francia, Corea del Sur, Brasil, Canadá, Australia 2,0; México, Italia, España, India 1,6; Países Bajos 1,5; Suecia, Indonesia, Turquía 1,4; Filipinas, Polonia 1,3; el resto de países 1,0. Las listas mundiales cuentan como 3,0.

Los puntos de una canción se suman en todas las listas y los 200 totales más altos forman el Global 200. La columna de **puntos** se muestra en relación con la canción n.º 1 (= 100).

Las canciones se emparejan entre plataformas por su artista principal y su título (sin tener en cuenta los créditos «feat.», sufijos de vídeo como «Official Video», tildes ni mayúsculas).

## Ranking de artistas

Los artistas suman los puntos de sus canciones —puntos completos como artista principal, la mitad como artista invitado— en todas las listas.

## Vistas diarias en YouTube

Guardamos cada día una instantánea del número de vistas de cada vídeo que seguimos. Las vistas diarias son la diferencia entre la instantánea más reciente y la más cercana a 24 horas antes, ajustada a exactamente 24 horas.

## Limitaciones

- En la mayoría de las listas, las plataformas publican rankings, no número de reproducciones; no estimamos reproducciones que no podemos medir.
- Las «tendencias» de YouTube son una selección propia de YouTube de vídeos musicales populares en un país, no un ranking puro de vistas.
- Los nombres de artistas se normalizan automáticamente; si ves un error, [avísanos](/es/contact/).
- **Spotify:** Spotify no ofrece sus listas ni sus reproducciones mediante una API pública y sus términos no permiten recopilarlas automáticamente, por lo que MusicMetrics no incluye datos de Spotify. Las páginas de listas y países enlazan a las [listas oficiales de Spotify](https://charts.spotify.com/); las de artistas enlazan al artista en Spotify (ID de Wikidata, CC0) y pueden cargar el reproductor oficial de Spotify.
