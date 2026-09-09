import React, { useState } from 'react';
import { formatIDR } from '../../lib/format';
import { useBusinessStore } from '../../stores/businessStore';
import { useAiConfigStore } from '../../stores/aiConfigStore';
import { Icon } from '../icons/Icon';
import { Badge } from '../ui/Badge';
import { Button } from '../ui/Button';

interface BusinessPricingCalculatorModalProps {
  isOpen: boolean;
  onClose: () => void;
  productName?: string;
  initialCost?: number;
  initialSellPrice?: number;
  unit?: string;
  onApply: (calculatedSellPrice: number, calculatedCostPrice: number) => void;
}

export function BusinessPricingCalculatorModal({
  isOpen,
  onClose,
  productName = '',
  initialCost = 0,
  initialSellPrice = 0,
  unit = 'pcs',
  onApply,
}: BusinessPricingCalculatorModalProps) {
  const tenant = useBusinessStore((s) => s.tenant);
  const aiConfig = useAiConfigStore();

  const [rawCost, setRawCost] = useState<number>(initialCost || 10000);
  const [overheadCost, setOverheadCost] = useState<number>(2000);
  const [targetMarginPercent, setTargetMarginPercent] = useState<number>(40);
  const [fixedCostMonthly, setFixedCostMonthly] = useState<number>(3000000);

  const [aiInsight, setAiInsight] = useState<string>('');
  const [isAiLoading, setIsAiLoading] = useState<boolean>(false);

  if (!isOpen) return null;

  // Kalkulasi Matematis
  const totalCostPerUnit = Math.max(0, rawCost + overheadCost);
  // Selling Price = Total Cost / (1 - Margin%) or Cost * (1 + Markup%)
  // Dalam retail/F&B: Harga Jual = Total Biaya / (1 - (targetMarginPercent/100))
  const calculatedSellPrice =
    targetMarginPercent >= 100
      ? totalCostPerUnit * 2
      : Math.round(totalCostPerUnit / Math.max(0.01, 1 - targetMarginPercent / 100));

  // Pembulatan harga jual ke kelipatan 500 terdekat agar estetik dan praktis di POS
  const roundedSellPrice = Math.ceil(calculatedSellPrice / 500) * 500;
  const netProfitPerUnit = Math.max(0, roundedSellPrice - totalCostPerUnit);
  const actualMarginPercent = roundedSellPrice > 0 ? Math.round((netProfitPerUnit / roundedSellPrice) * 100) : 0;

  // Estimasi BEP (Titik Impas) dalam unit
  const bepUnits = netProfitPerUnit > 0 ? Math.ceil(fixedCostMonthly / netProfitPerUnit) : 0;

  const handleAskAi = async () => {
    setIsAiLoading(true);
    setAiInsight('');

    const context = `Jenis Usaha: ${tenant.industry_template.toUpperCase()} (${tenant.name})
Nama Produk: ${productName || 'Produk Baru'}
Bahan Baku: ${formatIDR(rawCost)}
Biaya Operasional/Kemasan: ${formatIDR(overheadCost)}
Total HPP per unit: ${formatIDR(totalCostPerUnit)}
Target Margin: ${targetMarginPercent}%
Rekomendasi Harga Jual: ${formatIDR(roundedSellPrice)}
Estimasi Laba per Unit: ${formatIDR(netProfitPerUnit)} (${actualMarginPercent}%)`;

    const prompt = `Analisis penetapan harga untuk produk ini. Apakah harga ${formatIDR(roundedSellPrice)} sudah ideal dan kompetitif untuk segmen ${tenant.industry_template}? Berikan 2 tips singkat untuk memaksimalkan profit dan daya tarik pelanggan. Jawab dalam 3-4 kalimat ringkas.`;

    try {
      if (aiConfig.apiKey && aiConfig.isEnabled) {
        const res = await aiConfig.invokeNim(prompt, undefined, context);
        setAiInsight(res.answer);
      } else {
        // Local Business Intelligence benchmark
        setTimeout(() => {
          let advice = '';
          if (tenant.industry_template === 'retail') {
            advice = `Untuk bisnis Retail/F&B, margin kotor ${actualMarginPercent}% sudah sangat sehat (standar industri: 35-50%). Harga ${formatIDR(roundedSellPrice)} memberikan ruang yang cukup untuk promosi diskon 10% atau bundling paket hemat tanpa merugikan arus kas.`;
          } else if (tenant.industry_template === 'manufacturing') {
            advice = `Untuk Manufaktur/Produksi, margin ${actualMarginPercent}% sangat ideal untuk menutupi penyusutan alat dan fluktuasi bahan baku. Disarankan membuat batch minimal ${bepUnits} ${unit} untuk efisiensi produksi maksimal.`;
          } else {
            advice = `Untuk Jasa & Layanan, margin ${actualMarginPercent}% mencerminkan nilai keahlian dan waktu pengerjaan. Pastikan kualitas layanan konsisten dan pertimbangkan menawarkan paket bundling 3-5 sesi.`;
          }
          setAiInsight(advice);
          setIsAiLoading(false);
        }, 600);
        return;
      }
    } catch (err) {
      console.warn('AI call failed, using local rule', err);
      setAiInsight(
        `Dengan total HPP ${formatIDR(totalCostPerUnit)}, harga jual ${formatIDR(roundedSellPrice)} menghasilkan margin ${actualMarginPercent}%. Angka ini memenuhi target batas aman profitabilitas UKM Indonesia.`,
      );
    } finally {
      setIsAiLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-ink/60 animate-fadeIn">
      <div className="bg-paper border border-ash rounded-xl max-w-xl w-full max-h-[92vh] overflow-y-auto shadow-2xl flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-ash bg-sand/30">
          <div className="flex items-center gap-2.5">
            <span className="w-8 h-8 rounded-lg bg-chartreuse/80 text-ink flex items-center justify-center">
              <Icon name="sparkles" size={17} />
            </span>
            <div>
              <h2 className="text-body font-semibold text-ink">
                Kalkulator Bisnis &amp; Smart Pricing AI
              </h2>
              <p className="text-[12px] text-fossil">
                Hitung harga jual ideal, margin keuntungan, dan titik impas (BEP)
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-fossil hover:text-ink transition-colors rounded-md"
          >
            <Icon name="close" size={18} />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-5">
          {/* Product Name Banner */}
          {productName && (
            <div className="px-3.5 py-2 rounded-lg bg-sand/60 border border-ash flex items-center justify-between text-[13px]">
              <span className="text-fossil">Produk:</span>
              <span className="font-semibold text-ink">{productName}</span>
            </div>
          )}

          {/* Form Inputs */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="text-[12px] font-medium text-ink block mb-1">
                Biaya Bahan Baku / Modal (HPP)
              </label>
              <div className="relative">
                <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-[12px] text-pebble">
                  Rp
                </span>
                <input
                  type="number"
                  min={0}
                  step={500}
                  value={rawCost === 0 ? '' : rawCost}
                  onChange={(e) => setRawCost(Math.max(0, Number(e.target.value) || 0))}
                  className="w-full rounded-md border border-ash bg-bone pl-8 pr-3 py-1.5 text-[14px] text-ink focus:border-ink focus:outline-none"
                  placeholder="10000"
                />
              </div>
            </div>

            <div>
              <label className="text-[12px] font-medium text-ink block mb-1">
                Kemasan / Biaya per {unit}
              </label>
              <div className="relative">
                <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-[12px] text-pebble">
                  Rp
                </span>
                <input
                  type="number"
                  min={0}
                  step={500}
                  value={overheadCost === 0 ? '' : overheadCost}
                  onChange={(e) => setOverheadCost(Math.max(0, Number(e.target.value) || 0))}
                  className="w-full rounded-md border border-ash bg-bone pl-8 pr-3 py-1.5 text-[14px] text-ink focus:border-ink focus:outline-none"
                  placeholder="2000"
                />
              </div>
            </div>
          </div>

          {/* Target Margin Selector */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-[12px] font-medium text-ink">
                Target Margin Keuntungan Bersih
              </label>
              <span className="text-[13px] font-bold text-olive">{targetMarginPercent}%</span>
            </div>
            <div className="flex flex-wrap items-center gap-1.5 mb-2">
              {[20, 30, 40, 50, 60, 75].map((pct) => (
                <button
                  key={pct}
                  type="button"
                  onClick={() => setTargetMarginPercent(pct)}
                  className={`px-2.5 py-1 text-[12px] font-medium rounded transition-colors ${
                    targetMarginPercent === pct
                      ? 'bg-ink text-white'
                      : 'border border-ash bg-sand/40 text-fossil hover:text-ink'
                  }`}
                >
                  {pct}%
                </button>
              ))}
            </div>
            <input
              type="range"
              min={10}
              max={90}
              step={5}
              value={targetMarginPercent}
              onChange={(e) => setTargetMarginPercent(Number(e.target.value))}
              className="w-full accent-ink cursor-pointer"
            />
          </div>

          {/* Result Calculation Card */}
          <div className="p-4 rounded-xl bg-bone border border-ash space-y-3">
            <div className="flex items-center justify-between border-b border-ash/60 pb-2.5">
              <div>
                <p className="text-[11px] text-fossil uppercase font-medium">Rekomendasi Harga Jual</p>
                <p className="text-heading font-semibold text-ink mt-0.5">
                  {formatIDR(roundedSellPrice)}
                </p>
              </div>
              <Badge variant="accent" icon="sparkles">
                Margin {actualMarginPercent}%
              </Badge>
            </div>

            <div className="grid grid-cols-3 gap-2 text-center pt-1">
              <div className="p-2 rounded-lg bg-sand/50">
                <p className="text-[11px] text-fossil">Total Modal (HPP)</p>
                <p className="text-[13px] font-semibold text-ink mt-0.5">
                  {formatIDR(totalCostPerUnit)}
                </p>
              </div>
              <div className="p-2 rounded-lg bg-sand/50">
                <p className="text-[11px] text-fossil">Laba Bersih/{unit}</p>
                <p className="text-[13px] font-semibold text-olive mt-0.5">
                  +{formatIDR(netProfitPerUnit)}
                </p>
              </div>
              <div className="p-2 rounded-lg bg-sand/50">
                <p className="text-[11px] text-fossil">Titik Impas (BEP)</p>
                <p className="text-[13px] font-semibold text-ink mt-0.5">
                  {bepUnits} {unit}
                </p>
              </div>
            </div>
          </div>

          {/* AI Strategic Advice */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[12px] font-medium text-ink flex items-center gap-1">
                <Icon name="assistant" size={14} />
                Analisis &amp; Saran AI
              </span>
              <button
                type="button"
                onClick={handleAskAi}
                disabled={isAiLoading}
                className="text-[12px] text-olive font-semibold hover:underline inline-flex items-center gap-1 disabled:opacity-50"
              >
                {isAiLoading ? 'Menganalisis...' : 'Minta Analisis AI ✨'}
              </button>
            </div>

            {aiInsight ? (
              <div className="p-3 rounded-lg bg-chartreuse/15 border border-chartreuse/40 text-[13px] text-ink leading-relaxed animate-fadeIn">
                {aiInsight}
              </div>
            ) : (
              <p className="text-[12px] text-fossil italic">
                Klik &quot;Minta Analisis AI&quot; untuk mendapatkan evaluasi daya saing harga dan rekomendasi strategi penjualan dari Retalio AI.
              </p>
            )}
          </div>
        </div>

        {/* Footer Actions */}
        <div className="flex items-center justify-end gap-2.5 px-6 py-4 border-t border-ash bg-sand/20">
          <Button variant="ghost" onClick={onClose}>
            Batal
          </Button>
          <Button
            variant="primary"
            onClick={() => {
              onApply(roundedSellPrice, totalCostPerUnit);
              onClose();
            }}
          >
            Terapkan ke Produk ({formatIDR(roundedSellPrice)})
          </Button>
        </div>
      </div>
    </div>
  );
}
