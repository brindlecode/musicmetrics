---
title: "Yöntem: MusicMetrics listeleri nasıl hesaplanır?"
description: "MusicMetrics Global 200, değişim okları, zirveler ve listede kalınan gün sayısının arkasındaki veri kaynakları, güncelleme sıklığı ve formülün tamamı."
schemaType: "WebPage"
---

Bu sayfa, rakamlarımızın tam olarak nereden geldiğini ve nasıl hesaplandığını açıklar; böylece herkes bunları doğrulayabilir veya kaynak gösterebilir.

## Veri kaynakları

| Platform | Topladığımız veriler | Kapsam |
|---|---|---|
| YouTube | Trend müzik videoları (resmi YouTube Data API), izlenme sayıları, kanal istatistikleri | ~90 ülke, ilk 50 |
| Apple Music | "En Çok Dinlenen" şarkılar ve albümler (resmi Apple Marketing Tools RSS) | ~65 mağaza, ilk 100 |
| Deezer | Deezer Charts tarafından yayımlanan resmi "Top &lt;Ülke&gt;" çalma listeleri (herkese açık Deezer API) | Dünya geneli + ülke listeleri, ilk 100 |
| Last.fm | Dinleyici sayısına göre en popüler şarkılar (resmi Last.fm API), etkinleştirildiğinde | Dünya geneli + ülkeler |

Tüm veriler **6 saatte bir** otomatik olarak toplanır. Bir kaynak geçici olarak erişilemez durumdaysa, son başarılı sürüm en fazla 5 gün boyunca saklanır ve zaman damgasıyla açıkça belirtilir.

## Değişim, zirve ve listede kalınan gün

- **Değişim (▲ ▼ =)**, bir şarkının bugünkü sırasını listenin toplandığı bir önceki gündeki sırasıyla karşılaştırır.
- **YENİ**, takip başladığından beri o listede hiç yer almamış bir şarkıyı gösterir. **RE**, listeye yeniden girişi gösterir.
- **Zirve**, takip başladığından beri o listede ulaşılan en iyi sıradır.
- **Gün**, şarkının o listede yer aldığı farklı günlerin sayısıdır.

## MusicMetrics Global 200

Her şarkı listesindeki her sıra puan kazanır:

`points = platform weight × market weight × ((N + 1 − rank) / N) ^ 1.5`

Burada *N* listenin uzunluğudur (50 veya 100). Üs, üst sıraları düz bir doğrunun yapacağından daha fazla ödüllendirir.

- **Platform ağırlığı:** YouTube 1,0, Apple Music 1,0, Deezer 0,6, Last.fm 0,5.
- **Pazar ağırlığı:** her ülkenin kayıtlı müzik pazarının büyüklüğüne göre — ABD 3,0; Japonya, Birleşik Krallık, Almanya 2,5; Fransa, Güney Kore, Brezilya, Kanada, Avustralya 2,0; Meksika, İtalya, İspanya, Hindistan 1,6; Hollanda 1,5; İsveç, Endonezya, Türkiye 1,4; Filipinler, Polonya 1,3; diğer tüm ülkeler 1,0. Dünya geneli listeler 3,0 sayılır.

Bir şarkının puanları tüm listelerde toplanır ve en yüksek 200 toplam, Global 200'ü oluşturur. **Puan** sütunu, 1 numaralı şarkıya (= 100) göre gösterilir.

Şarkılar platformlar arasında ana sanatçı ve şarkı adına göre eşleştirilir ("feat." belirtmeleri, "Official Video" gibi video ekleri, aksanlar ve büyük/küçük harf farkı dikkate alınmaz).

## Sanatçı sıralaması

Sanatçılar şarkılarının puanlarını kazanır — ana sanatçı olarak tam puan, konuk sanatçı olarak yarım puan — ve bu puanlar tüm listelerde toplanır.

## YouTube günlük izlenmeleri

Takip edilen her video için 6 saatte bir izlenme sayısının anlık görüntüsünü kaydederiz. Günlük izlenme, en son anlık görüntü ile 24 saat öncesine en yakın anlık görüntü arasındaki farktır ve tam 24 saate ölçeklenir.

## Sınırlamalar

- Platformlar çoğu liste için dinlenme sayısı değil, sıralama yayımlar; ölçemediğimiz dinlenme sayılarını tahmin etmeyiz.
- YouTube "trendler", YouTube'un bir ülkedeki popüler müzik videolarından kendi yaptığı seçkidir; salt izlenme sıralaması değildir.
- Sanatçı adları otomatik olarak normalleştirilir; bir hata fark ederseniz lütfen [bize bildirin](/tr/contact/).
