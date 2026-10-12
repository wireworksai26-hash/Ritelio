# Product Requirements Document (PRD)
# Retalio ERP — dari Smart Business System ke Enterprise Resource Planning

| | |
|---|---|
| **Nama Produk** | Retalio ERP |
| **Versi Dokumen** | 2.0 |
| **Tanggal** | 10 Oktober 2026 |
| **Status** | Approved untuk eksekusi |
| **Supersedes** | `PRD_Retalio_SBS.md` v1.0 (tetap berlaku sebagai payung Fase 1 yang sudah berjalan) |
| **Basis** | 11 modul dari kebutuhan pengguna, `schema.prisma` (24 model), audit keamanan 2026 |
| **Durasi estimasi** | ±7–9 bulan, solo developer |

---

## 1. Ringkasan Eksekutif

`PRD_Retalio_SBS.md` v1.0 sudah memposisikan Retalio sebagai *digital backbone* untuk UKM, dengan roadmap tertulis: payroll di Fase 2, manufaktur + multi-currency di Fase 3. Dokumen ini **mempercepat dan memperdalam** roadmap tersebut — bukan mengubah arah produk.

Momennya menguntungkan: belum ada data produksi, hanya 2 tenant seed. Artinya setiap keputusan arsitektural dapat diambil dengan *clean break* tanpa migrasi data yang berat. Enam bulan lagi, semua keputusan ini menjadi mahal.

**Kendala teknis utama yang ditemukan:** `FinancialEntry` tidak dapat menjadi General Ledger. Modelnya 1 baris = 1 debit + 1 kredit, tanpa nomor urut, tanpa periode fiskal, tanpa status posted, tanpa reversal, tanpa FK ke `ChartOfAccount`. Batasan ini sudah memicu workaround di kode yang ada — `purchasing` menulis jurnal dengan `sourceModule: 'inventory'` karena enum tidak punya nilainya. Setiap modul baru akan memperburuk kondisi ini.

---

## 2. Asumsi Kerja

| # | Asumsi | Dampak bila keliru |
|---|---|---|
| A1 | Solo developer, 7–9 bulan | Jika ada 2–3 dev paralel → 4–5 bulan, tapi hanya setelah Fase 0 selesai |
| A2 | Painkiller = **Pembelian & Inventaris** | Mengganti urutan Fase 2–3; Fase 0 tidak berubah |
| A3 | PPh 21 memakai angka `ESTIMATE` berlabel | Tidak ada — mekanisme tetap sama, hanya data |
| A4 | Shared DB + `company_id` | Isolasi keras per anak perusahaan → arsitektur berbeda total |
| A5 | Accrual accounting penuh (bukan kas) | Basis kas sederhana → GL disederhanakan, laporan laba rugi di Fase 1 |

A2 dipilih karena profil bisnis (bakery & coffee shop pada seed) biasanya paling terdorong oleh: kehabisan stok, tidak tahu harus reorder apa, supplier tidak bisa diandalkan. Accounting penting tetapi sering di-outsource atau diabaikan UKM.

---

## 3. Prinsip Arsitektur

1. **Modular monolith** — bukan microservices. Monolith modular dengan boundary ketat per domain. Saat beban nyata membuktikan perlu pemecahan, modul dapat diekstrak karena kontraknya sudah terpisah.
2. **GL sebagai satu-satunya sumber kebenaran** — tidak ada transaksi yang menyentuh laporan keuangan selain lewat jurnal.
3. **Periode fiskal terkunci** — jurnal posted tidak dapat diedit, hanya dibalik (reversal).
4. **Multi-company dari hari pertama** — `companyId` masuk di Fase 0, tidak ditambahkan belakangan.
5. **Aturan pajak = data, bukan kode** — tarif dan versioning berada di database.
6. **Setiap perubahan money-path wajib punya test.**

---

## 4. Fase 0 — Fondasi (4–5 minggu)

> Satu-satunya fase tanpa fitur yang dapat didemokan ke pengguna akhir. Ini pemborosan waktu termahal di proyek — dan pemborosan yang *menghemat* 3 bulan berikutnya.

### 0.1 Baseline Migration & Perbaikan Skema

`prisma/migrations/` belum ada — skema belum pernah di-baseline. Semua perubahan schema sejauh ini `db push` yang destruktif.

| Pekerjaan | Detail |
|---|---|
| Baseline migration | `migrate diff` → `migrate resolve` → deploy; nol `db push` lagi |
| FK hilang | `AuditLog.userId`, `AiInsightLog.userId`, `Notification.userId`, `ProductCategory.parentId` (self-relation) |
| Unique bocor tenant | `InventoryStock @@unique([productId, warehouseId])` → tambahkan `tenantId` |
| Kolom mati | `ProductCategory.parentId` → self-relation + index + guard siklus |
| Index polymorphic | `StockMovement.refId`, `JournalHeader.[sourceModule, sourceRefId]`, `AuditLog.[entity, entityId]` |
| Audit | Event auth (`login`, `register`, `refresh`, 2FA) masuk `audit_logs` |

### 0.2 Multi-Company & Multi-Currency

`Tenant` = grup / entitas billing. `Company` = entitas akuntansi. `companyId` ditambahkan ke tabel existing dan baru.

Rasional: konsolidasi lintas anak perusahaan menjadi satu query; satu backup; satu connection pool. Karena belum ada data produksi, ini clean break.

### 0.3 General Ledger v2

Menggantikan `FinancialEntry` (tabel dihapus, data seed dikonversi). `JournalHeader` (satu per jurnal, punya nomor, periode, status, reversal link) + `JournalLine` (banyak baris, satu akun per baris, dengan dimensi `partnerId` / `projectId` / `costCenterId`).

Konsekuensi:
- Multi-baris: pembelian 5 item menghasilkan jurnal dengan 5+ baris debit — tidak mungkin pada model lama
- Assertion di service: `SUM(debit) == SUM(credit)`, kalau tidak → tulis ditolak
- `ChartOfAccount` mendapat self-relation `parentId`

### 0.4 Periode Fiskal & Saldo Awal

`FiscalYear`, `FiscalPeriod` (status `open`/`closed`), `OpeningBalance`.

Neraca hanya mungkin setelah item ini: `AccountType.equity` sudah ada di enum tetapi tidak pernah dipakai, dan tanpa saldo awal plus akun modal, laporan selalu tidak seimbang.

### 0.5 Role & Permission ke Database

14 permission hardcoded di `permissions.ts` tidak akan menskala untuk 100+ permission. Dipindah ke tabel `Permission`, `Role`, `RolePermission` dengan `effect` allow/deny dan `Role.rank` untuk hierarki. `User.role` enum → `UserRole` join table.

### 0.6 Tax Engine — Tabel Dulu, Angka Menyusul

`TaxRule` dengan `effectiveFrom` / `effectiveTo` / `sourceRef` / `source` (`official` | `estimate`), dan `TaxBracket` untuk PPh 21. Angka resmi masuk lewat data, bukan deploy ulang.

Pengiriman ke DJP / e-Faktur **keluar dari scope** — sistem menghitung PPN, filing tetap manual.

### 0.7 Approval Engine Minimal

`ApprovalRequest` + `ApprovalStep`. Fondasi yang dipakai lima modul: PO, requisition, timesheet, expense, diskon.

### 0.8 Test Infrastructure

Vitest + database Postgres terpisah. Saat ini nol test di proyek. Target Fase 0: coverage penuh pada `journal-posting`, `fiscal-period`, `tax-computation`, `rbac-hierarchy`.

### 0.9 Module Scaffold Template

Pola standar (DTO + service + controller + guard + test + migration) agar sebelas modul berikutnya konsisten.

---

## 5. Fase 1 — Accounting (6–7 minggu)

| Modul | Cakupan | Model baru |
|---|---|---|
| **Buku Besar** | GL, jurnal multi-baris, posting, reversal, nomor urut | (Fase 0) |
| **AP** | Faktur pembelian, pembayaran, aging, outstanding | `Bill`, `BillLine`, `Payment`, `PaymentAllocation` |
| **AR** | Invoice, receipt, aging, outstanding | `Invoice`, `InvoiceLine`, `Receipt`, `ReceiptAllocation` |
| **Cash Flow** | Rekonsiliasi bank otomatis | `BankAccount`, `BankStatement`, `BankReconciliation` |
| **Aset Tetap** | Nilai, lokasi, depresiasi (garis lurus + declining) | `FixedAsset`, `DepreciationSchedule`, `DepreciationEntry` |
| **Pelaporan** | Laba rugi, **neraca**, arus kas, buku besar, neraca saldo | query/view |
| **PPN** | Otomatis per invoice/bill | (tax engine) |
| **BI Dashboard** | Analisis visual interaktif | — |

**Neraca** butuh: total aset = total liabilities + equity, dengan equity = modal awal + laba ditahan. Akun ekuitas belum pernah dipakai — sekarang dipakai.

Konsolidasi lintas anak perusahaan dijaga dengan `companyId` + `parentId`.

---

## 6. Fase 2 — Pembelian & Inventaris (5–6 minggu)

| Modul | Cakupan | Model baru |
|---|---|---|
| **Requisition** | Permintaan pembelian internal → approval → PO | `PurchaseRequisition`, `PurchaseRequisitionLine` |
| **PO** | Nomor urut, kirim ke vendor, multi-status | `PurchaseOrder` (revisi `status`) |
| **Vendor Management** | Scorecard: ketepatan waktu, kualitas, harga | `VendorPerformance`, `Supplier` (revisi) |
| **Stock Opname** | Barcode/RFID, hitung fisik vs sistem | `StockOpname`, `StockOpnameLine` |
| **Multi-Gudang** | Transfer antar gudang dengan status transit | `StockTransfer`, `StockTransferLine` |
| **Reorder Point** | Ambang otomatis → draft PO | `Product.reorderPoint`, `reorderQty` |

Fase paling inline dengan painkiller (A2).

---

## 7. Fase 3 — Penjualan & CRM (4–5 minggu)

| Modul | Cakupan | Model baru |
|---|---|---|
| **Lead & Opportunity** | Pipeline, siklus penjualan, forecast | `Lead`, `Opportunity` |
| **Quotation** | Surat penawaran → konversi ke Sales Order | `Quotation`, `QuotationLine` |
| **Sales Order** | Pesanan penjualan, fulfilment dari stok | `SalesOrder`, `SalesOrderLine` |
| **Invoice** | Tagihan dari SO, link ke AR | (Fase 1) |
| **Customer History** | Riwayat, interaksi, komplain | `CustomerInteraction`, `CustomerComplaint` |

---

## 8. Fase 4 — HR, Manufaktur, Proyek, SCM, EAM, GRC (8–10 minggu)

Dapat dipecah menjadi empat batch independen.

**Batch A — HRM & Payroll**
Employee master (terpisah dari User auth), struktur departemen, jabatan · Time & attendance (kehadiran, jam kerja, lembur, cuti) · Payroll: gaji, bonus, potongan, **PPh 21** (dari `TaxBracket`) · Recruitment & onboarding, KPI

**Batch B — Manufaktur**
BOM multi-level + MRP · Production scheduling, alokasi mesin · Quality control di beberapa tahapan produksi

**Batch C — Proyek & SCM**
Timesheet + billing ke klien, resource allocation, milestone/Gantt · Fleet: jadwal perawatan, konsumsi bahan bakar, rute pengiriman · Shipment tracking, demand forecasting

**Batch D — EAM & GRC**
Preventive maintenance, work order · Tax localization lanjutan, audit trail lengkap

---

## 9. Kesesuaian dengan 11 Modul yang Diminta

| Modul | Fase | Sub-fitur |
|---|---|---|
| 🪙 Keuangan & Akuntansi | **1** | Semua 5 |
| 📦 Inventaris & Gudang | **2** | Semua 4 |
| 🛒 Pembelian & Pengadaan | **2** | Semua 3 |
| 📈 Penjualan & CRM | **3** | Semua 3 |
| 👥 HRM & Payroll | **4A** | Semua 4 |
| 🏭 Manufaktur & MRP | **4B** | Semua 3 |
| 🛠️ Manajemen Proyek | **4C** | Semua 3 |
| 🚛 SCM & Logistik | **4C** | Semua 3 |
| 🏢 EAM | **4D** | Semua 2 |
| ⚖️ GRC | **0+1+4D** | Tax di 0/1, audit di 0/4D |
| 📊 Modern | **0+1+4** | RBAC & multi-company di 0, BI di 1, AI sudah ada, IoT/mobile di 4 |

Tidak ada modul yang dibuang. POS, inventaris dasar, AI assistant, dan PWA yang sudah ada dihitung sebagai Fase 1–2 yang sebagian jadi.

---

## 10. Risiko

| Risiko | Dampak | Mitigasi |
|---|---|---|
| Terlalu banyak tabel tanpa disiplin | Perubahan schema lambat & destruktif | Migrasi wajib, bukan `db push` |
| Angka PPh 21 salah | Salah gaji, trust rusak | `source: estimate` + badge UI; hanya `official` boleh dipakai produksi |
| 7–9 bulan terlalu lama | Scope tidak tercapai | Cut Fase 4 menjadi roadmap terpisah |
| Periode fiskal tidak dipakai user | Data tetap lemah, neraca tak ada | Tutup periode otomatis + reminder |
| Scope creep AI/IoT | Distraksi dari core | AI selalu non-blocking; IoT tidak masuk Fase 1–3 |
| Modular monolith jadi spaghetti | Sulit dirawat | Module scaffold + boundary guard di code review |

---

## 11. Kriteria Keberhasilan

| Fase | Syarat selesai |
|---|---|
| 0 | `migrate deploy` jalan; test hijau; satu modul contoh dari scaffold; GL menerima jurnal 5-baris yang balance |
| 1 | Laba rugi, neraca, arus kas tepat; neraca balance; PPN sesuai referensi; depresiasi 12 bulan |
| 2 | Requisition → PO → receive end-to-end; opname barcode; reorder otomatis |
| 3 | Lead → quotation → SO → invoice end-to-end; link ke AR |
| 4 | Payroll PPh 21 verified; BOM → produksi → QC → stok; timesheet → invoice |

---

## 11a. Status Real vs Kriteria (audit 11 Oktober 2026)

Tabel di atas adalah *syarat*, bukan laporan. Berikut hasil audit kode nyata terhadap
syarat tersebut. Kolom "bukti" menunjuk ke berkas yang sudah diperiksa.

### Yang selesai dan memang terverifikasi

| Area | Bukti |
|---|---|
| GL v2: multi-baris, balance assertion sen, nomor urut race-safe, period lock | `accounting/journal.service.ts`, `journal-validation.ts` |
| Reversal jurnal (tidak ada di Fase 0–4, dibangun di Batch 5) | `POST /journals/:id/reverse`, `journal-reversal.spec.ts` |
| SO → stok → jurnal → faktur AR (`Serializable`, claim atomik, COGS moving-average) | `crm/crm.service.ts:278-411` |
| MRP eksplosi rekursif + cycle guard | `manufacturing/manufacturing.service.ts` |
| Multi-level produksi (sub-order post-order) | `manufacturing.service.ts releaseMultiLevel` |
| Work center + kapasitas + capacity plan + usulan jadwal | `manufacturing/workcenter.service.ts` |
| QC bertingkat (tahap wajib berurutan) | `QcStage` enum, `workcenter.spec.ts` |
| Reorder automation → draf PO + notifikasi, anti PO ganda | `procurement.service.ts generateReorderPurchaseOrders` |
| Audit trail **readable** + before-image + auth event | `GET /audit/logs`, `audit.interceptor.ts` |
| PPN otomatis per faktur/bill + `ruleSnapshot` | `tax/tax-engine.service.ts`, `tax-engine.spec.ts` |
| Multi-currency (sebagian) | `finance/fx.service.ts`, `/finance/reports/consolidation` |
| Stock transfer transit + HPP carry | `procurement.service.ts` |
| Rekrutmen, KPI, IoT, OCR, demand forecasting, carrier webhook | Batch 3–5 |

### BELUM SELESAI — money-path (paling prioritas; corrupts data)

> Status per 11 Oktober 2026, setelah perbaikan money-path. Lihat
> tabel "Sudah Diperbaiki" di bawah untuk M1–M5 yang sudah tertutup.

| # | Isu | Bukti | Status |
|---|---|---|---|
| M1 | **Double-billing proyek.** Guard menunjuk `project.status`, yang tidak pernah di-set | `operations/billing-guard.spec.ts` (7 test, mutation-verified) | ✅ **Diperbaiki** — `Timesheet.billedAt` + klaim atomik per baris |
| M2 | **Depresiasi di luar `$transaction`**, dan `entryDate` selalu `new Date()` | `assets/assets.service.ts runDepreciation` | ✅ **Diperbaiki** — satu transaksi per aset, `Serializable`, `entryDate` di dalam periode |
| M3 | **`FinancialEntry` masih hidup** (ditulis 3×, dibaca 5×) | `grep '\.financialEntry'` | ✅ **Diperbaiki** — nol pemanggilan tersisa; `entries`/`exportCsv`/rekonsiliasi/AI sekarang baca GL |
| M4 | **Arus kas bukan dari GL**, proyeksi linear `avgIn*(1+i*0.005)` | `finance.service.ts cashflow()` | ✅ **Diperbaiki** — dari `journal_lines` akun kas; proyeksi pola mingguan |
| M5 | **Nomor PO racy** (`count()+1`) | `purchasing.service.ts:107-118` | ✅ **Diperbaiki** — `documentSequence` dengan `upsert` atomik |

### BELUM SELESAI — kode mati / belum terpasang

| # | Isu | Status |
|---|------|--------|
| D1 | `ApprovalService` nol konsumen, nol controller | ✅ **Diperbaiki** — pproval.controller.ts (list/detail/submit/decide), dipakai pproveTimesheet untuk timesheet billable |
| D2 | `VendorPerformance` nol read/write | ✅ **Diperbaiki** — computeVendorPerformance + endorScorecardHistory; sumber data kualitas ditambahkan (PurchaseOrderItem.qtyRejected dicatat saat receive) |
| D3 | `defaultCompanyId()` mengunci `code:'MAIN'` di ~25 titik | ⚠️ **Sebagian** — consolidate() sudah menerima explicitCompanyId; modul lama masih fallback MAIN |
| D4 | Biaya work order tidak pernah masuk GL | ✅ **Diperbaiki** — Dr Beban Pemeliharaan (6400) / Cr Kas saat work order ditutup, satu transaksi |
| D5 | Shipment tidak mengurangi stok, tidak jurnal | ❌ **Terbuka** |
| D6 | Jadwal perawatan tidak pernah maju | **Diperbaiki** - `advanceSchedules()` menaikkan `nextDueAt` setiap work order ditutup |
extDueAt saat work order ditutup |

### BELUM SELESAI — fitur

| # | Isu | Bukti |
|---|---|---|
| F1 | **CRM funnel masih stub.** Tidak ada endpoint advance opportunity, transisi stage lead, siklus quotation, maupun `quotation→SO convert` | ✅ **Diperbaiki** — moveLeadStage, moveOpportunity, moveQuotation, convertQuotation (baris diambil dari penawaran, klaim atomik), pipeline dengan Σ(nilai×probabilitas) + forecast per bulan |
| F2 | Milestone/Gantt tanpa startDate, dependensi, completedAt, endpoint list/complete | ✅ **Diperbaiki** — startDate/progress, model MilestoneDependency, listMilestones (Gantt + overdue), updateMilestone, completeMilestone dengan guard dependensi |
| F3 | Tidak ada GET /timesheets (hanya POST) | ✅ **Diperbaiki** — listTimesheets dengan filter + total jam/billable/unbilled |
| F4 | Tidak ada POST /hrm/departments | ✅ **Diperbaiki** — createDepartment dengan guard siklus; plus clock-in/clock-out yang menghitung jam kerja, lembur, dan keterlambatan |
| F5 | `UserRole` join table tidak ada; `User.role` enum masih authoritative | `schema.prisma` |
| F6 | Stock opname belum pakai barcode; kamera scanner masih placeholder statis | `stock-op.dto.ts`, `Inventory.tsx:754` |
| F7 | Multi-currency baru dipakai di trial-balance, balance-sheet, consolidation | ✅ **Diperbaiki** — P&L, arus kas, dan dashboard kini menerima ?currency= dan memakai FxService |

### BELUM SELESAI — pengujian

| # | Isu |
|---|---|
| T1 | **Batch 3/4/5 masih nol test.** Reversal, PPN, work center, reorder, dan proteksi double-billing punya test; resource allocation, forecasting, carrier, rekrutmen, KPI, IoT, OCR, FX belum |
| T2 | Tidak ada Postgres test DB (PRD 0.8 minta). Semua test murni unit dengan mock |
| T3 | Target test PRD §0.8: `fiscal-period` **masih nol test**; `journal-posting` & `rbac-hierarchy` hanya partial |
| T4 | Smoke test selalu dihapus setelah dipakai — tidak ada regression suite untuk money-path di DB |

### BELUM SELESAI — produk

| # | Isu |
|---|---|
| P1 | **Frontend nol untuk CRM, HRM, Manufaktur, Proyek, SCM, EAM, Audit, Rekrutmen, KPI, IoT, OCR, Forecasting.** Semua backend-only, tidak terjangkau dari UI. `src/pages/` hanya 10 halaman |
| P2 | Seed tidak punya data Fase 3–5, jadi tidak ada environment yang bisa mendemokan |
| P3 | Semua perubahan Fase 1–5 masih **uncommitted** |
| P4 | Backlog keamanan: refresh-token rotation/logout, verifikasi email, password sementara, RLS, pagination, hardcoded seed credentials |

### Definition of Done saat ini

| Fase | Status |
|---|---|
| 0 | **Sebagian** - M1-M5, D1-D3 sudah ditutup; tersisa D3, T2-T3 |
| 1 | **Sebagian** - M3, M4, F7 sudah ditutup; tersisa D3 (company selector) |
| 2 | **Sebagian** - M5 ditutup; tersisa F6 (barcode stock opname) |
| 3 | **Selesai (backend)** - F1 ditutup: lead 鈫? stage 鈫? opportunity 鈫? quotation 鈫? SO 鈫? invoice |
| 4 | **Sebagian** - M1, D4-D6, F1-F4, F7 ditutup; tersisa D5 (shipment vs stok), P1 (frontend), P2 (seed) |
| 5 | **Backend ada, belum diuji** - T1, P1 |

---

## 12. Definition of Done (seluruh fase)

- Migration committed dan dapat di-replay dari nol
- Typecheck dan build bersih
- Test suite hijau, termasuk money-path
- Tidak ada `console.log` data sensitif
- Tidak ada hardcoded secret atau angka pajak di kode
- Endpoint baru terdokumentasi dan ber-guard permission

---

*Perubahan arsitektural setelah Fase 0 selesai harus dikunci; sebelum itu, clean break masih tersedia.*
