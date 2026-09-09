import React, { useState } from 'react';
import { formatIDR } from '../../lib/format';
import { Icon } from '../icons/Icon';

interface PriceInputWithQuickAddProps {
  label: string;
  value: number;
  onChange: (value: number) => void;
  costPrice?: number;
  min?: number;
  max?: number;
  step?: number;
  onOpenCalculator?: () => void;
  hint?: string;
  required?: boolean;
}

export function PriceInputWithQuickAdd({
  label,
  value,
  onChange,
  costPrice,
  min = 0,
  max = 2000000,
  step = 1000,
  onOpenCalculator,
  hint,
  required,
}: PriceInputWithQuickAddProps) {
  const [showSlider, setShowSlider] = useState(false);

  const addAmount = (amount: number) => {
    const current = Number(value) || 0;
    onChange(Math.max(0, current + amount));
  };

  const roundToThousand = () => {
    const current = Number(value) || 0;
    if (current <= 0) return;
    onChange(Math.ceil(current / 1000) * 1000);
  };

  const applyMargin = (percent: number) => {
    if (!costPrice || costPrice <= 0) return;
    const targetPrice = Math.round(costPrice * (1 + percent / 100));
    // Round to nearest 500 or 1000
    const rounded = Math.ceil(targetPrice / 500) * 500;
    onChange(rounded);
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <label className="text-[13px] font-medium text-ink flex items-center gap-1.5">
          {label}
          {required && <span className="text-red-500">*</span>}
        </label>
        <div className="flex items-center gap-2">
          {onOpenCalculator && (
            <button
              type="button"
              onClick={onOpenCalculator}
              className="text-[12px] text-olive font-medium hover:underline inline-flex items-center gap-1"
            >
              <Icon name="sparkles" size={13} />
              Kalkulator Bisnis AI
            </button>
          )}
          <button
            type="button"
            onClick={() => setShowSlider(!showSlider)}
            className="text-[11px] text-fossil hover:text-ink px-1.5 py-0.5 rounded bg-sand/60 transition-colors"
          >
            {showSlider ? 'Tutup Slider' : 'Gunakan Slider'}
          </button>
        </div>
      </div>

      <div className="relative">
        <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
          <span className="text-caption font-medium text-pebble">Rp</span>
        </div>
        <input
          type="number"
          min={min}
          step={step}
          value={value === 0 ? '' : value}
          onChange={(e) => onChange(Math.max(0, Number(e.target.value) || 0))}
          placeholder="0"
          className="w-full rounded-md border border-ash bg-bone pl-9 pr-24 py-2 text-body text-ink placeholder:text-pebble focus:border-ink focus:outline-none focus:ring-1 focus:ring-ink"
        />
        <div className="absolute inset-y-0 right-0 flex items-center pr-3 pointer-events-none">
          <span className="text-caption font-semibold text-fossil">
            {formatIDR(value || 0)}
          </span>
        </div>
      </div>

      {showSlider && (
        <div className="p-3 bg-sand/50 rounded-lg border border-ash/60 space-y-2">
          <div className="flex justify-between text-[11px] text-fossil font-medium">
            <span>{formatIDR(min)}</span>
            <span className="text-ink font-semibold">{formatIDR(value || 0)}</span>
            <span>{formatIDR(max)}</span>
          </div>
          <input
            type="range"
            min={min}
            max={max}
            step={step}
            value={value || 0}
            onChange={(e) => onChange(Number(e.target.value))}
            className="w-full accent-ink cursor-pointer"
          />
        </div>
      )}

      {/* Quick Add Buttons */}
      <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
        <span className="text-[11px] text-fossil mr-0.5">Tambah:</span>
        {[
          { label: '+1 rb', val: 1000 },
          { label: '+5 rb', val: 5000 },
          { label: '+10 rb', val: 10000 },
          { label: '+25 rb', val: 25000 },
          { label: '+50 rb', val: 50000 },
          { label: '+100 rb', val: 100000 },
        ].map((btn) => (
          <button
            key={btn.label}
            type="button"
            onClick={() => addAmount(btn.val)}
            className="px-2 py-0.5 text-[11px] font-medium rounded border border-ash bg-paper text-fossil hover:text-ink hover:border-pebble hover:bg-sand transition-colors"
          >
            {btn.label}
          </button>
        ))}
        <button
          type="button"
          onClick={roundToThousand}
          title="Bulatkan ke kelipatan Rp 1.000 terdekat"
          className="px-2 py-0.5 text-[11px] font-medium rounded border border-ash bg-paper text-fossil hover:text-ink hover:bg-sand transition-colors"
        >
          Bulatkan
        </button>
        <button
          type="button"
          onClick={() => onChange(0)}
          title="Reset ke 0"
          className="px-2 py-0.5 text-[11px] text-red-500 rounded border border-ash/60 bg-paper hover:bg-red-50 transition-colors"
        >
          Reset
        </button>
      </div>

      {/* Margin Presets if costPrice exists */}
      {costPrice && costPrice > 0 ? (
        <div className="flex flex-wrap items-center gap-1.5 pt-1 border-t border-ash/40">
          <span className="text-[11px] text-fossil mr-0.5">
            Margin dari HPP ({formatIDR(costPrice)}):
          </span>
          {[20, 30, 50, 100].map((margin) => (
            <button
              key={margin}
              type="button"
              onClick={() => applyMargin(margin)}
              className="px-2 py-0.5 text-[11px] font-medium rounded border border-chartreuse/60 bg-chartreuse/20 text-olive hover:bg-chartreuse/40 transition-colors"
            >
              +{margin}%
            </button>
          ))}
        </div>
      ) : null}

      {hint && <p className="text-[12px] text-fossil">{hint}</p>}
    </div>
  );
}
