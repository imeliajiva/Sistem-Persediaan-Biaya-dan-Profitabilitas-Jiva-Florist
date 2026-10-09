# JIVA FLORIST — Sistem Informasi Akuntansi

Sistem pencatatan florist JIVA FLORIST di Magelang. Antarmuka HTML/CSS/JavaScript dan API Node.js menghubungkan aplikasi ke PostgreSQL Supabase. Struktur sumber mengikuti permintaan proyek:

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
   Skrip membuat/memperbarui kolom yang diperlukan pada `inventory_batches` tanpa menghapus tabel atau data. Jika tabel lama sudah berisi batch tetapi belum menyimpan sisa kuantitas, skrip sengaja berhenti agar stok tidak otomatis terisi ulang; periksa jumlah sisa aktual batch terlebih dahulu, lalu migrasikan sebelum menjalankan skrip kembali.
   Jalankan ulang skrip setelah pembaruan untuk mengaktifkan fitur edit, pembelian/penjualan beberapa jenis bunga sekaligus, dan kolom tautan faktur pemasok. Skrip juga menyiapkan bucket Storage privat `supplier-invoices`; data tabel dan stok tidak dihapus. Migrasi menautkan pembelian lama ke batch hanya jika pasangannya cocok secara unik; data yang tidak dapat dipastikan tetap utuh dan akan membatasi perubahan jumlah/biaya pembelian.
3. Ambil **Project URL** dan **service_role key** pada pengaturan API Supabase. Jangan masukkan service-role key ke browser atau repositori. Backend hanya membacanya dari environment.
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

## Profil usaha

Layar pertama memperkenalkan **JIVA FLORIST — Magelang, Jawa Tengah**, lalu tombol **Masuk ke ruang kerja** membuka dashboard. Profil tidak mencantumkan alamat jalan, nomor kontak, atau jam buka yang belum diberikan.

## ERD — tiga entitas

```text
products (1) ───────< inventory_batches
    │                         │
    └──────────────< transactions
```

- `products`: jenis bunga, satuan, ambang restok, margin jual.
- `inventory_batches`: lapisan pembelian, sisa kuantitas, biaya perolehan historis, serta nilai tercatat setelah penilaian NRV.
- `transactions`: pembelian, penjualan, biaya, dan penyesuaian nilai persediaan. Rincian pemakaian batch FIFO tersimpan di `fifo_allocations`.

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
- Untuk menyimpan dokumen asli dari pemasok, gunakan **Unggah faktur** pada transaksi pembelian. File PDF/JPG/PNG/WEBP maksimal 10 MB disimpan dalam bucket Supabase Storage privat dan ditautkan ke transaksi; gunakan **Lihat faktur** atau **Ganti faktur** untuk mengakses/memperbarui lampiran. File hanya dilayani melalui backend yang memegang service-role key.
- Menu **Transaksi → Unduh laporan penjualan** menyediakan CSV UTF-8 untuk spreadsheet dan **Cetak / PDF** untuk laporan berformat rapi. Laporan berisi ringkasan omzet, PPN, HPP FIFO, laba kotor, serta rincian transaksi untuk rentang tanggal yang dipilih. Pilih **Simpan sebagai PDF** pada dialog cetak browser untuk menyimpan versi PDF.

Pengukuran biaya, NRV, dan FIFO mengadopsi prinsip yang dirujuk PSAK 202 (Persediaan). Aplikasi ini adalah alat operasional, bukan buku besar berpasangan atau sistem pelaporan PSAK/pajak penuh. Konsultasikan kebijakan akuntansi dan pajak dengan akuntan/konsultan terkait sebelum digunakan sebagai laporan resmi.
