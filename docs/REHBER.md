# MusicMetrics — Durum, Yapılanlar ve Yol Haritası

_Son güncelleme: 26 Eylül 2026_

## 1. Başlangıçtaki durum (tespitler)

| # | Sorun | Etkisi |
|---|---|---|
| 1 | GitHub'daki `NETLIFY_AUTH_TOKEN` geçersiz ("Unauthorized") | Site **19 Eylül'den beri hiç güncellenmedi**; her 6 saatlik çalışma kırmızıydı |
| 2 | Spotify verisi Nisan'dan beri boş (Spotify API editoryal listeleri kapattı) | Ana sayfanın yarısı "veri yok" gösteriyordu |
| 3 | 7 dil × 7.367 = **~52.000 boş sanatçı sayfası** (çoğu "Chiki Fun - Stories Games" gibi kanal adları) | Google'ın "ince/ölçekli içerik" cezası riski, repo 211 MB şişti |
| 4 | Değişim ▲▼, zirve, listede kalma süresi hiç hesaplanmıyordu (her şarkı "NEW") | kworb'un temel özelliği yoktu |
| 5 | `netlify.toml` içindeki yönlendirme/güvenlik başlıkları API deploy'unda uygulanmıyordu | Kök adres yalnızca meta-refresh ile /en/'e gidiyordu |
| 6 | Mor degrade, Inter fontu, yuvarlak kartlar | "Yapay zekâ yapmış" görüntüsü |

## 2. Yapılanlar

**Veri (hepsi ücretsiz kaynaklar):**
- YouTube: ~90 ülkede trend müzik videoları, toplam izlenme, **günlük izlenme** (her gün anlık görüntü), kanal bilgileri, **Milyar İzlenme Kulübü**
- Apple Music: ~65 ülkede Top 100 şarkı + Top 100 albüm (anahtar gerekmez)
- Deezer: dünya + ülke Top 100 listeleri, sanatçı hayran sayıları (anahtar gerekmez)
- Last.fm: isteğe bağlı (ücretsiz anahtar eklenince otomatik devreye girer)
- **Geçmiş kaydı:** her pozisyon saklanıyor → ▲▼ değişim, YENİ / RE, zirve, gün sayısı
- **MusicMetrics Global 200:** tüm platform ve ülkeleri birleştiren, formülü açıkça yayınlanmış özgün dünya listesi (kworb'da yok)
- Sanatçı sıralaması, benzer sanatçılar, haftalık özet arşivi (her hafta kendiliğinden yeni sayfa)

**Site:**
- Tamamen yeni, özgün tasarım: gazete/finans terminali estetiği, koyu mod, mobilde alt menü, anında arama (`/` tuşu), satır içi video oynatıcı, liste filtreleri
- 52 bin boş dosya silindi; sayfalar artık veriden otomatik üretiliyor (repo küçüldü, derleme ~40 sn)
- İngilizce kök adreste (`musicmetrics.net/`), diğerleri `/tr/ /es/ /pt/ /de/ /fr/ /ja/`
- Her dil için doğal çeviriler ve yerel arama terimleri ("müzik listesi", "en çok dinlenen şarkılar"…)
- Ziyaretçinin diline göre ana sayfada kendi ülkesinin listeleri (TR → Türkiye)

**SEO / AEO / GEO:**
- Her sayfa için güncel #1'i içeren dinamik başlık ve açıklama
- hreflang, canonical, dil bazlı site haritaları
- Yapısal veri: ItemList, Dataset, MusicGroup, MusicRecording, FAQPage, BreadcrumbList, Article, Organization, WebSite+SearchAction
- Her sayfada "cevap kutusu" (Google öne çıkan snippet'leri ve yapay zekâ asistanlarının alıntılaması için)
- Her sayfada canlı verili Sık Sorulan Sorular
- `llms.txt` (ChatGPT, Claude, Perplexity için canlı özet), robots.txt'de yapay zekâ botlarına izin
- IndexNow: her güncellemede Bing/Yandex'e otomatik bildirim
- Eski adreslerden 301 yönlendirmeleri (`/en/...`, `/spotify/...`, `/youtube/trending/...`)

**Gelir altyapısı (ID girildiği anda çalışır):**
- AdSense: otomatik reklamlar + manuel alanlar (liste içi, kenar çubuğu, alt) + `ads.txt` otomatik
- Her şarkı/sanatçı sayfasında "Dinle & Satın al" kutusu: Apple Music (affiliate), Amazon Music, plak/CD (Amazon affiliate, dile göre amazon.com.tr / .de / .fr …), konser bileti (affiliate linki)
- Google Consent Mode v2 (AB/İngiltere için izin varsayılanları)
- GA4, Microsoft Clarity, Cloudflare Analytics desteği (ID girilince açılır)

## 3. SENİN yapman gerekenler (teknik bilgi gerekmez)

### ⚠️ A) Netlify anahtarını yenile — EN ÖNEMLİSİ (5 dakika)
Bu yapılmadan site güncellenmez.
1. https://app.netlify.com/user/applications adresine gir → **Personal access tokens** → **New access token**
2. Ad: `github-actions`, süre: **No expiration** (veya en uzun) → oluştur, çıkan kodu kopyala
3. https://github.com/ilkukaya/musicmetrics/settings/secrets/actions adresine gir
4. `NETLIFY_AUTH_TOKEN` → **Update** → kopyaladığın kodu yapıştır → Save
5. `NETLIFY_SITE_ID` değerinin `01306bca-34a8-4f76-996a-3f6c3e92b6b7` olduğundan emin ol
6. https://github.com/ilkukaya/musicmetrics/actions → "Update charts & deploy" → **Run workflow**

### B) Google Search Console (10 dakika)
1. https://search.google.com/search-console → Mülk ekle → **Alan adı** → `musicmetrics.net`
2. Verilen TXT kaydını alan adı sağlayıcına ekle (veya "HTML etiketi" yöntemini seç ve kodu bana gönder, siteye ben eklerim)
3. **Site haritaları** → `sitemap.xml` gönder
4. Bing: https://www.bing.com/webmasters → "Google Search Console'dan içe aktar"

### C) Reklam ve affiliate başvuruları (ücretsiz)
| Program | Adres | Bana göndereceğin |
|---|---|---|
| Google AdSense | https://adsense.google.com | `ca-pub-...` kodu (onaydan sonra birim kimlikleri) |
| Apple Services Performance Partners | https://performance-partners.apple.com | affiliate token |
| Amazon Associates (ABD) | https://affiliate-program.amazon.com | `xxx-20` etiketi |
| Amazon Türkiye Ortaklık | https://ortaklik.amazon.com.tr | etiket |
| Ticketmaster (Impact) | https://impact.com | derin link şablonu |

AdSense genelde sitenin birkaç hafta düzenli trafik almasını ve Gizlilik/İletişim sayfalarını ister — hepsi hazır.

### D) İsteğe bağlı ücretsiz anahtarlar
- Last.fm API: https://www.last.fm/api/account/create → anahtarı GitHub'da `LASTFM_API_KEY` secret'ı olarak ekle → dinleyici sayılı ek listeler otomatik açılır
- Microsoft Clarity (ısı haritası): https://clarity.microsoft.com → proje kimliğini gönder
- Google Analytics 4: ölçüm kimliğini (`G-...`) gönder

## 4. Ücretsiz büyüme planı (öncelik sırasıyla)

1. **İndekslenme (ilk 2–4 hafta):** Search Console'da ana sayfa, /charts/global/, /tr/ ve büyük ülke sayfaları için "Dizine eklenmesini iste".
2. **Sosyal medya otomasyonu:** X/Instagram/TikTok'ta günlük "Bugün Türkiye'de 1 numara" ve haftalık "Global 200" paylaşımları. Tüm veriler hazır; istersen bunu da otomatikleştiririm.
3. **Topluluklar:** Reddit (r/popheads, r/kpop, r/TurkishMusic…), Ekşi Sözlük, fan hesapları — sanatçı sayfası linkleri paylaşılabilir.
4. **Backlink mıknatısı:** Fan sitelerinin koyabileceği gömülebilir "canlı liste widget'ı" (her gömme bir backlink demek) — sonraki adım olarak önerilir.
5. **Basın:** Haftalık özet sayfaları gazetecilerin alıntılayabileceği formatta; müzik yazarlarına e-posta.
6. **Yeni özellik fikirleri:** sanatçı karşılaştırma, şarkının günlük pozisyon grafiği, "bugün tarihte 1 numara", e-posta bülteni (Netlify Forms ücretsiz).

## 5. Gerçekçi beklentiler

- Yeni bir alan adının Google'da güven kazanması genellikle **3–6 ay** sürer; ilk trafik uzun kuyruk aramalardan ("Türkiye YouTube listesi", "[sanatçı] şarkıları") gelir.
- Müzik niş RPM'i (1.000 görüntülenme başına reklam geliri) genelde **1–4 $** aralığındadır; asıl kaldıraç yüksek sayfa sayısı × çok dil × günlük tekrar ziyaretlerdir.
- kworb'dan farkımız: çok dilli, mobil uyumlu, çapraz platform Global 200, açık metodoloji, sanatçı/şarkı sayfaları, SSS ve yapay zekâ asistanlarına uygun yapı. Eksiğimiz: kworb'un yıllardır biriken Spotify akış sayıları — bu veriyi yasal ve ücretsiz alabileceğimiz resmi bir kaynak şu an yok, bu yüzden tahmin/izinsiz kazıma yapmadık.
