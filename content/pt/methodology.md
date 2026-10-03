---
title: "Metodologia: como as paradas do MusicMetrics são calculadas"
description: "Fontes de dados, frequência de atualização e a fórmula exata por trás do Global 200 do MusicMetrics, das setas de variação, dos picos e dos dias na parada."
schemaType: "WebPage"
---

Esta página explica exatamente de onde vêm nossos números e como eles são calculados, para que qualquer pessoa possa verificá-los ou citá-los.

## Fontes de dados

| Plataforma | O que coletamos | Cobertura |
|---|---|---|
| YouTube | Clipes em alta (YouTube Data API oficial), contagem de visualizações, estatísticas dos canais | ~110 países, top 50 |
| Apple Music | Músicas e álbuns "Most Played" (RSS oficial do Apple Marketing Tools) | ~170 lojas, top 100 |
| iTunes | Músicas mais vendidas (RSS oficial da iTunes Store) | ~170 lojas, top 100 |
| Deezer | Playlists oficiais "Top &lt;País&gt;" publicadas pelo Deezer Charts (API pública do Deezer) | Mundial + paradas por país, top 100 |
| Last.fm | Músicas mais ouvidas por número de ouvintes (API oficial do Last.fm), quando ativado | Mundial + países |

Todos os dados são coletados automaticamente **diariamente**. Se uma fonte ficar temporariamente indisponível, a última versão bem-sucedida é mantida por até 5 dias, com data e hora claramente indicadas.

## Variação, pico e dias na parada

- **Variação (▲ ▼ =)** compara a posição de uma música hoje com a posição dela no dia anterior em que a parada foi coletada.
- **NOVO** indica uma música que nunca apareceu naquela parada desde o início do acompanhamento. **RE** indica uma reentrada.
- **Pico** é a melhor posição já alcançada naquela parada desde o início do acompanhamento.
- **Dias** conta os dias distintos em que a música apareceu naquela parada.

## O Global 200 do MusicMetrics

Cada posição em cada parada de músicas rende pontos:

`points = platform weight × market weight × ((N + 1 − rank) / N) ^ 1.5`

em que *N* é o tamanho da parada (50 ou 100). O expoente valoriza as primeiras posições mais do que uma linha reta faria.

- **Peso da plataforma:** YouTube 1,0, Apple Music 1,0, iTunes 0,6, Deezer 0,6, Last.fm 0,5.
- **Peso do mercado:** com base no tamanho de cada mercado de música gravada — Estados Unidos 3,0; Japão, Reino Unido, Alemanha 2,5; França, Coreia do Sul, Brasil, Canadá, Austrália 2,0; México, Itália, Espanha, Índia 1,6; Países Baixos 1,5; Suécia, Indonésia, Turquia 1,4; Filipinas, Polônia 1,3; todos os demais países 1,0. Paradas mundiais contam como 3,0.

Os pontos de uma música são somados em todas as paradas, e os 200 maiores totais formam o Global 200. A coluna de **pontos** é exibida em relação à música nº 1 (= 100).

As músicas são associadas entre plataformas pelo artista principal e pelo título (ignorando créditos "feat.", sufixos de vídeo como "Official Video", acentos e maiúsculas/minúsculas).

## Ranking de artistas

Os artistas recebem os pontos de suas músicas — pontos integrais como artista principal, metade como artista convidado — somados em todas as paradas.

## Visualizações diárias no YouTube

Diariamente, registramos um retrato da contagem de visualizações de cada vídeo acompanhado. As visualizações diárias são a diferença entre o registro mais recente e o mais próximo de 24 horas antes, ajustada para exatamente 24 horas.

## Limitações

- Na maioria das paradas, as plataformas publicam rankings, não números de streams; não estimamos streams que não conseguimos medir.
- O "em alta" do YouTube é uma seleção do próprio YouTube de clipes populares em um país, não um ranking puro de visualizações.
- Os nomes dos artistas são normalizados automaticamente; se encontrar algum erro, [avise a gente](/pt/contact/).
- **Spotify:** O Spotify não oferece suas paradas por uma API pública e seus termos não permitem coletá-las automaticamente. Toda semana baixamos manualmente as paradas semanais oficiais do Spotify (músicas e artistas) em charts.spotify.com e publicamos o top 20 de músicas e o top 10 de artistas, com a fonte e um link para a [parada completa](https://charts.spotify.com/); as contagens de streams não são republicadas e o Spotify não entra na pontuação do Global 200. As páginas de artistas apontam para o artista no Spotify (IDs do Wikidata, CC0).
