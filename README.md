# Quantum Auto-Upload System

Bu sistem, videoları yüklemenize, FFmpeg ile 1920x1080 (YouTube standartı) formatına dönüştürmenize ve her gece belirlenen saatte otomatik olarak YouTubea yüklemenize olanak sağlar.

## Özellikler

- **Giriş Koruması:** Kullanıcı adı ve şifre ile güvenli dashboard.
- **Otomatik İşleme:** Belirlenen saatte (varsayılan 03:00) videoları sırayla işler.
- **Video Dönüştürme:** FFmpeg kullanarak videoları 1080p yapar.
- **Günlük Limit:** Günde en fazla kaç video yükleneceğini belirler.
- **Veri Kalıcılığı:** db.json dosyası ile verileriniz sunucu kapansa bile silinmez.

## Kurulum ve Çalıştırma

1.  Bağımlılıkları yükleyin:
    ```bash
    npm install
    ```

2.  .env dosyasını oluşturun ve yapılandırın.

3.  Uygulamayı başlatın:
    ```bash
    npm run start
    ```

## Render Deployment

Bu proje Render üzerinde çalışmak üzere yapılandırılmıştır. Renderda Web Service oluştururken **Docker** seçeneğini seçin. FFmpeg otomatik olarak kurulacaktır.

### Ortam Değişkenleri (Environment Variables)

Render panelinde şu değişkenleri eklemeyi unutmayın:
- ADMIN_USERNAME: Dashboard kullanıcı adı.
- ADMIN_PASSWORD: Dashboard şifresi.
- SESSION_SECRET: Güvenlik için rastgele bir anahtar.
- UPLOAD_HOUR: İşlemin başlayacağı saat (Örn: 03).
- DAILY_LIMIT: Günlük maksimum yükleme sayısı.

## YouTube API Entegrasyonu

youtube.js dosyasını açın ve uploadToYouTube fonksiyonuna kendi YouTube API mantığınızı ekleyin.
