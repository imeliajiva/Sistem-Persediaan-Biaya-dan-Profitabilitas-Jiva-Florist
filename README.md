# JIVA FLORIST — Sistem Informasi Akuntansi

Sistem pencatatan florist JIVA FLORIST di Magelang. Antarmuka HTML/CSS/JavaScript dapat terhubung langsung ke PostgreSQL Supabase untuk GitHub Pages; API Node.js tetap tersedia untuk penggunaan lokal.

```text
frontend/
  index.html
  style.css
  script.js
backend/
  app.js
  supabase.js
  package.json
  sql/
    schema.sql
```

## Menyiapkan Supabase

1. Buat proyek PostgreSQL di Supabase.
2. Buka **SQL Editor** dan jalankan [`backend/sql/schema.sql`](backend/sql/schema.sql).
   Skrip membuat/memperbarui kolom yang diperlukan pada `inventory_batches` tanpa menghapus tabel atau data. Nama pemasok lama dipindahkan/ditautkan ke entitas `suppliers` dan teks lama tetap dipertahankan untuk kompatibilitas. Jika tabel lama sudah berisi batch tetapi belum menyimpan sisa kuantitas, skrip sengaja berhenti agar stok tidak otomatis terisi ulang; periksa jumlah sisa aktual batch terlebih dahulu, lalu migrasikan sebelum menjalankan skrip kembali.
   Jalankan ulang skrip setelah pembaruan untuk mengaktifkan fitur edit, pembelian/penjualan beberapa jenis bunga sekaligus, dan kolom tautan faktur pemasok. Skrip juga menyiapkan bucket Storage privat `supplier-invoices`; data tabel dan stok tidak dihapus. Migrasi menautkan pembelian lama ke batch hanya jika pasangannya cocok secara unik; data yang tidak dapat dipastikan tetap utuh dan akan membatasi perubahan jumlah/biaya pembelian.
3. Untuk backend lokal, ambil **Project URL** dan **service_role key** pada pengaturan API Supabase. Jangan masukkan service-role key ke browser atau repositori. Untuk GitHub Pages, gunakan anon/publishable key publik yang dipasang pada `frontend/script.js`; RLS tetap melindungi database.
4. Dari PowerShell di folder proyek, jalankan:

   ```powershell
   $env:SUPABASE_URL = "https://PROJECT_REF.supabase.co"
   $env:SUPABASE_SERVICE_ROLE_KEY = "ISI_DENGAN_SERVICE_ROLE_KEY"
   npm.cmd --prefix backend start
   ```

   Atau jalankan `node backend/app.js`. Tidak ada paket npm eksternal yang diperlukan.

5. Buka <http://127.0.0.1:3000>. Endpoint `/api/health` memeriksa koneksi database.

   Jika ingin membuka `frontend/index.html` langsung (protokol `file://`), backend tetap harus berjalan dengan koneksi Supabase. Halaman akan mencari backend pada port 3000 lalu 3001; mulai ulang backend atau muat ulang halaman setelah tersambung. Backend hanya mengizinkan permintaan CORS dari origin `file://` untuk kebutuhan ini, dan tetap terikat ke `127.0.0.1`.

Server secara default hanya mendengarkan `127.0.0.1`. Jangan mengekspos server ke internet tanpa autentikasi, otorisasi, HTTPS, dan pembatasan akses. Service-role key melewati RLS; backend harus tetap menjadi satu-satunya pemegang kunci tersebut. Foto bunga dekoratif dimuat dari Unsplash dan memerlukan koneksi internet.

## Menggunakan satu link GitHub Pages

GitHub Pages hanya menyajikan file statis dan tidak menjalankan `app.js`. Mode Supabase langsung di browser memungkinkan satu link dipakai bersama tanpa hosting Node, dengan login Supabase dan kebijakan RLS.

1. Jalankan ulang seluruh [`backend/sql/schema.sql`](backend/sql/schema.sql) di **Supabase → SQL Editor** untuk menerapkan kebijakan baca, fungsi transaksi yang hanya dapat dipanggil akun terautentikasi, akses faktur privat, dan sinkronisasi realtime. Migrasi mempertahankan tabel/transaksi yang sudah ada; skrip berhenti jika saldo batch lama tidak dapat dimigrasikan dengan aman.
2. Isi konstanta `SUPABASE_URL` dan `SUPABASE_ANON_KEY` di bagian paling atas `frontend/script.js` menggunakan Project URL dan anon/publishable key dari Supabase. Key tersebut memang publik dan dapat berada di GitHub **hanya karena** akses data dibatasi oleh RLS. Jangan gunakan `service_role`.
3. Daftarkan email yang diizinkan pada tabel internal `private.jiva_allowed_users` melalui SQL Editor, lalu buat/undang email yang sama di **Authentication → Users**. Contoh:

   ```sql
   insert into private.jiva_allowed_users (email)
   values (lower(trim('email-teman@example.com')))
   on conflict (email) do nothing;
   ```

   Ulangi untuk tiap pengguna. Di **Authentication → Settings**, nonaktifkan pendaftaran publik. Di **Authentication → URL Configuration**, masukkan link GitHub Pages yang akan dipakai sebagai **Site URL** dan tambahkan link yang sama ke **Redirect URLs**, supaya tautan undangan kembali ke aplikasi yang benar. Setiap akun yang diizinkan memakai email dan kata sandi sendiri; semua akun tersebut dapat melihat dan mengubah seluruh data usaha.
4. Salin file lokal ke file bernama sama di folder utama repositori GitHub yang sudah ada; jangan tambah folder:

   | File lokal | File di folder utama GitHub |
   | --- | --- |
   | `frontend/index.html` | `index.html` |
   | `frontend/style.css` | `styles.css` |
   | `frontend/script.js` | `script.js` |
   | `backend/sql/schema.sql` | `schema.sql` |
   | `README.md` | `README.md` |

   Commit perubahan di branch `main`. Untuk mode ini, `app.js`, `supabase.js`, dan `package.json` tidak dijalankan oleh GitHub Pages.
5. Pastikan GitHub Pages aktif pada repositori (Settings → Pages → Deploy from a branch → `main` / root). Buka link `github.io` setelah deployment selesai.
6. Masuk menggunakan email akun yang telah dibuat/diundang. Semua PC membaca database Supabase yang sama; perubahan pengguna lain diperbarui otomatis melalui Realtime, atau setelah halaman dimuat ulang.

Jangan membuat policy `anon` untuk membaca atau mengubah tabel. RLS memeriksa email terhadap daftar privat, sehingga akun lain tidak dapat membaca atau mengubah data walaupun pendaftaran Supabase masih terbuka. Daftar akses berada di schema internal `private` dan tidak menambah entitas pada ERD bisnis tiga entitas. Setiap akun yang diizinkan mempunyai akses penuh ke data JIVA FLORIST, jadi masukkan hanya email orang yang dipercaya. Perbarui file GitHub Pages tanpa menghapus database; tidak perlu menjalankan ulang SQL untuk setiap pembaruan kode.

## Alternatif: hosting Node.js

Untuk menggunakan aplikasi yang sama dari PC atau ponsel lain, deploy folder `backend` sebagai satu layanan web Node.js (misalnya di Render). Server yang sama menyajikan `frontend/` dan API, sementara semua perangkat membaca/menulis database Supabase yang sama. File aplikasi tambahan tidak diperlukan.

1. Kirim file proyek terbaru ke repositori GitHub. Pastikan berkas `frontend/` dan `backend/` ada di branch yang akan dideploy.
2. Di Render pilih **New → Web Service**, hubungkan repositori, dan atur **Root Directory** ke `backend`, **Build Command** ke `npm install`, dan **Start Command** ke `npm start`.
3. Di **Environment** layanan, atur `NODE_ENV` ke `production`, `APP_USERNAME` ke nama login yang kamu pilih, `APP_PASSWORD` ke kata sandi kuat minimal 12 karakter, `SESSION_SECRET` ke nilai rahasia acak minimal 32 karakter, serta `SUPABASE_URL` dan `SUPABASE_SERVICE_ROLE_KEY`. Jangan pernah menaruh kata sandi atau service-role key di frontend, GitHub, atau chat. Gunakan HTTPS dan jangan ubah pengaturan ini menjadi akses tanpa login.
4. Setelah deploy berstatus **Live**, buka alamat HTTPS yang Render berikan. Alamat yang sama bisa dibuka dari perangkat lain; semua pengguna masuk dengan akun pemilik yang sama dan bekerja pada data Supabase yang sama. Perubahan tersimpan di Supabase, bukan hanya pada PC yang membuka situs.

Mode lokal tetap tidak meminta login. Mode deployment publik (`NODE_ENV=production`) mewajibkan login; API data dan perubahan terlindungi, cookie sesi aman berlaku 12 jam, dan percobaan login dibatasi.

## Pemetaan file repo untuk hosting Node.js (opsional)

Agar aplikasi dan data yang sama dapat dibuka dari PC/ponsel lain, jalankan aplikasi ini pada hosting Node.js publik (misalnya Render). Layanan tersebut menyajikan halaman dan API pada satu alamat HTTPS; database bersama tetap berada di Supabase. GitHub menyimpan kode, bukan menjalankan backend.

Repositori GitHub JIVA FLORIST saat ini menyimpan file-file di folder utama. Supaya tidak perlu menambah folder atau file di GitHub, salin versi terbaru dari file proyek lokal ke file yang sudah ada di folder utama repositori:

| File lokal | File yang sudah ada di folder utama GitHub |
| --- | --- |
| `frontend/index.html` | `index.html` |
| `frontend/style.css` | `style.css` |
| `frontend/script.js` | `script.js` |
| `backend/app.js` | `app.js` |
| `backend/supabase.js` | `supabase.js` |
| `backend/package.json` | `package.json` |
| `backend/sql/schema.sql` | `schema.sql` |
| `README.md` | `README.md` |

Simpan perubahan, commit, dan push ke branch `main` dengan menimpa file yang namanya sama—jangan unggah folder lokal `frontend` atau `backend` ke repositori yang sekarang datar. `app.js` dapat melayani halaman dari kedua susunan proyek.

Di Render pilih **New → Web Service**, hubungkan repositori, biarkan **Root Directory** kosong, isi **Build Command** `npm install`, dan **Start Command** `npm start`. Tambahkan environment berikut pada pengaturan layanan:

- `NODE_ENV` = `production`
- `APP_USERNAME` = nama login pemilik
- `APP_PASSWORD` = kata sandi kuat minimal 12 karakter
- `SESSION_SECRET` = string acak rahasia minimal 32 karakter
- `SUPABASE_URL` = Project URL dari Supabase
- `SUPABASE_SERVICE_ROLE_KEY` = service-role key dari Supabase

Jangan masukkan kata sandi, `SESSION_SECRET`, atau service-role key ke GitHub atau frontend. Setelah Render selesai deploy dan statusnya **Live**, gunakan URL HTTPS yang Render berikan (misalnya `https://nama-layanan.onrender.com`) di browser pada perangkat mana pun. Masuk dengan nama pengguna/kata sandi yang sama; perubahan yang disimpan akan terlihat di perangkat lain karena semuanya memakai proyek Supabase yang sama. Tidak perlu menjalankan ulang `schema.sql` jika database sudah disiapkan.

Mode lokal tetap tanpa login. Di hosting production login wajib, sesi kedaluwarsa setelah 12 jam, dan percobaan masuk dibatasi. Berikan akun tersebut hanya kepada orang yang memang boleh melihat serta mengubah semua data JIVA FLORIST. Paket gratis Render dapat tidur setelah tidak aktif sehingga akses pertama mungkin perlu menunggu server bangun.

## Profil usaha

Layar pertama memperkenalkan **JIVA FLORIST — Magelang, Jawa Tengah**, lalu tombol **Masuk ke ruang kerja** membuka dashboard. Profil tidak mencantumkan alamat jalan, nomor kontak, atau jam buka yang belum diberikan.

## ERD — empat entitas

```text
suppliers ───────< inventory_batches >────── products
                                            │
                                            └──────< transactions
```

- `products`: jenis bunga, satuan, ambang restok, margin jual.
- `suppliers`: nama pemasok yang dinormalisasi dan dipakai ulang.
- `inventory_batches`: lapisan pembelian, relasi `supplier_id`, sisa kuantitas, biaya perolehan historis, serta nilai tercatat setelah penilaian NRV.
- `transactions`: pembelian, penjualan, biaya, dan penyesuaian nilai persediaan. Rincian pemakaian batch FIFO tersimpan di `fifo_allocations`.

Satu pemasok dapat terkait ke banyak batch; setiap batch memiliki satu produk dan pemasok bersifat opsional. Produk dapat memiliki banyak batch dan transaksi. Nama pemasok dimasukkan saat mencatat pembelian: nama baru otomatis dibuat, sedangkan nama yang sama (tanpa membedakan huruf besar/kecil) dipakai kembali. Tabel internal `private.jiva_allowed_users` hanya untuk keamanan login dan bukan entitas bisnis ERD.

## Mengedit data

Gunakan tombol **Edit** di baris produk atau transaksi (100 transaksi terbaru ditampilkan). Produk dapat diperbarui tanpa mengubah riwayat; satuan dikunci setelah ada transaksi. Harga jual tetap per produk dapat diatur pada form edit produk. Kosongkan harga tetap untuk kembali ke saran otomatis berbasis biaya FIFO dan margin target. Penjualan baru mengikuti harga tetap jika diatur; transaksi penjualan yang sudah tercatat tetap menyimpan harga historis masing-masing. Keterangan dan tanggal transaksi dapat dikoreksi. Nominal biaya, harga jual per unit, serta tarif PPN transaksi dapat diedit, dan subtotal, PPN, laba serta ringkasan dihitung ulang.

Untuk menjaga ketepatan FIFO, jumlah/biaya/pemasok pembelian hanya dapat diubah jika batch belum dipakai; tanggal pembelian juga dikunci setelah produk memiliki penjualan. Pembelian lama yang tidak dapat ditautkan dengan yakin ke batch hanya mengizinkan perubahan keterangan. Jumlah penjualan dan nilai penyesuaian NRV tidak bisa diubah langsung karena memengaruhi alokasi/nilai stok; buat transaksi atau penilaian koreksi baru agar jejak persediaan tetap benar.

## Perhitungan

- Pembelian menambah persediaan per batch dan transaksi dalam satu proses. Masukkan biaya per unit yang mencakup harga beli serta biaya langsung pembelian yang dialokasikan.
- Penjualan mengambil batch terlama lebih dulu (FIFO), mengunci stok untuk mencegah penjualan berlebih saat transaksi bersamaan, menolak kuantitas yang melebihi stok, dan mencatat biaya batch yang digunakan.
- Form pembelian dan penjualan menerima beberapa jenis bunga dalam satu penyimpanan atomik (1–30 baris). Pembelian memakai pemasok dan bisa mendaftarkan produk baru per baris; penjualan menghitung harga otomatis sesuai margin setiap produk dan memakai PPN bersama. Jika satu item gagal validasi/stok, tidak ada baris pada transaksi gabungan yang disimpan.
- Harga jual disarankan otomatis dari biaya FIFO dibagi `1 − margin kotor target`, dibulatkan ke atas per Rp100; database menghitung kembali harga pasti saat penjualan disimpan.
- Penilaian NRV otomatis mengisi estimasi dari harga jual normal produk (harga tetap, atau saran dari HPP FIFO dan margin). Karena biaya penyelesaian/penjualan per unit belum dicatat oleh aplikasi, estimasi awal menganggap biaya tersebut Rp0; periksa dan koreksi nilainya bila ada biaya terkait. Penurunan nilai dicatat; pemulihan dibatasi sebesar biaya perolehan awal. Penilaian tetap perlu ditinjau pengguna secara berkala.
- Laba kotor = penjualan sebelum PPN − HPP FIFO. Laba operasional = laba kotor − biaya operasional + penyesuaian persediaan neto. PPN tidak dihitung sebagai pendapatan.
- PPN dan estimasi PPh final opsional; konfigurasikan hanya sesuai status wajib pajak dan aturan terbaru. Simulasi omzet × tarif bukan jurnal final, nasihat, ataupun pelaporan pajak.
- Pada **Transaksi**, tombol **Invoice** pada penjualan membuka bukti penjualan yang dapat dicetak atau disimpan sebagai PDF. Ini bukti transaksi, bukan faktur pajak.
- Untuk menyimpan dokumen asli dari pemasok, gunakan **Unggah faktur** pada transaksi pembelian. File PDF/JPG/PNG/WEBP maksimal 10 MB disimpan dalam bucket Supabase Storage privat dan ditautkan ke transaksi; gunakan **Lihat faktur** atau **Ganti faktur** untuk mengakses/memperbarui lampiran. Akses di GitHub Pages dibatasi ke pengguna yang sudah masuk.
- Menu **Transaksi → Unduh laporan penjualan** menyediakan CSV UTF-8 untuk spreadsheet dan **Cetak / PDF** untuk laporan berformat rapi. Laporan berisi ringkasan omzet, PPN, HPP FIFO, laba kotor, serta rincian transaksi untuk rentang tanggal yang dipilih. Pilih **Simpan sebagai PDF** pada dialog cetak browser untuk menyimpan versi PDF.

Pengukuran biaya, NRV, dan FIFO mengadopsi prinsip yang dirujuk PSAK 202 (Persediaan). Aplikasi ini adalah alat operasional, bukan buku besar berpasangan atau sistem pelaporan PSAK/pajak penuh. Konsultasikan kebijakan akuntansi dan pajak dengan akuntan/konsultan terkait sebelum digunakan sebagai laporan resmi.
