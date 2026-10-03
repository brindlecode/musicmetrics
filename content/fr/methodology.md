---
title: "Méthodologie : comment sont calculés les classements MusicMetrics"
description: "Sources de données, fréquence de mise à jour et formule exacte du Global 200 de MusicMetrics, des flèches d'évolution, des meilleures positions et des jours au classement."
schemaType: "WebPage"
---

Cette page explique précisément d'où viennent nos chiffres et comment ils sont calculés, afin que chacun puisse les vérifier ou les citer.

## Sources de données

| Plateforme | Ce que nous collectons | Couverture |
|---|---|---|
| YouTube | Clips musicaux en tendance (API officielle YouTube Data), nombre de vues, statistiques des chaînes | ~110 pays, top 50 |
| Apple Music | Titres et albums « Most Played » (flux RSS officiel Apple Marketing Tools) | ~170 storefronts, top 100 |
| iTunes | Titres les plus vendus (flux RSS officiel de l'iTunes Store) | ~170 storefronts, top 100 |
| Deezer | Playlists officielles « Top &lt;Pays&gt; » publiées par Deezer Charts (API publique Deezer) | Monde + classements par pays, top 100 |
| Last.fm | Top titres par auditeurs (API officielle Last.fm), lorsqu'elle est activée | Monde + pays |

Toutes les données sont collectées automatiquement **chaque jour**. Si une source est temporairement indisponible, la dernière version récupérée avec succès est conservée jusqu'à 5 jours, avec un horodatage bien visible.

## Évolution, meilleure position et jours au classement

- **L'évolution (▲ ▼ =)** compare la position d'un titre aujourd'hui avec sa position lors du précédent jour de collecte du classement.
- **NOUVEAU** signale un titre qui n'était jamais apparu dans ce classement depuis le début du suivi. **RE** signale un retour.
- **La meilleure position** est la meilleure place jamais atteinte dans ce classement depuis le début du suivi.
- **Les jours** comptent le nombre de jours distincts où le titre figurait dans ce classement.

## Le Global 200 de MusicMetrics

Chaque position dans chaque classement de titres rapporte des points :

`points = platform weight × market weight × ((N + 1 − rank) / N) ^ 1.5`

où *N* est la longueur du classement (50 ou 100). L'exposant récompense davantage les premières places qu'une simple droite.

- **Poids de la plateforme :** YouTube 1,0, Apple Music 1,0, iTunes 0,6, Deezer 0,6, Last.fm 0,5.
- **Poids du marché :** selon la taille de chaque marché de la musique enregistrée – États-Unis 3,0 ; Japon, Royaume-Uni, Allemagne 2,5 ; France, Corée du Sud, Brésil, Canada, Australie 2,0 ; Mexique, Italie, Espagne, Inde 1,6 ; Pays-Bas 1,5 ; Suède, Indonésie, Turquie 1,4 ; Philippines, Pologne 1,3 ; tous les autres pays 1,0. Les classements mondiaux comptent pour 3,0.

Les points d'un titre sont additionnés sur tous les classements, et les 200 meilleurs totaux forment le Global 200. La colonne **points** est affichée par rapport au titre n° 1 (= 100).

Les titres sont rapprochés d'une plateforme à l'autre par leur artiste principal et leur titre (sans tenir compte des mentions « feat. », des suffixes vidéo comme « Official Video », des accents ni de la casse).

## Classement des artistes

Les artistes cumulent les points de leurs titres – la totalité en tant qu'artiste principal, la moitié en tant qu'artiste invité – sur tous les classements.

## Vues quotidiennes YouTube

Chaque jour, nous enregistrons un relevé du nombre de vues de chaque vidéo suivie. Les vues quotidiennes correspondent à la différence entre le dernier relevé et celui qui date d'environ 24 heures plus tôt, ramenée à exactement 24 heures.

## Limites

- Pour la plupart des classements, les plateformes publient des rangs et non des nombres d'écoutes ; nous n'estimons pas les écoutes que nous ne pouvons pas mesurer.
- Les « tendances » YouTube sont la sélection par YouTube des clips musicaux populaires dans un pays, et non un pur classement par vues.
- Les noms d'artistes sont normalisés automatiquement ; si vous repérez une erreur, [prévenez-nous](/fr/contact/).
- **Spotify :** Spotify ne propose pas ses classements via une API publique et ses conditions n'autorisent pas leur collecte automatique. Chaque semaine, nous téléchargeons à la main les classements hebdomadaires officiels de Spotify (titres et artistes) sur charts.spotify.com et publions le top 20 des titres et le top 10 des artistes, avec la source et un lien vers le [classement complet](https://charts.spotify.com/) ; les nombres d'écoutes ne sont pas republiés et Spotify n'entre pas dans le score du Global 200. Les pages d'artistes renvoient vers l'artiste sur Spotify (identifiants Wikidata, CC0).
