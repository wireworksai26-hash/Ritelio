import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { plans } from '../../data/plans';
import { cn, formatIDR } from '../../lib/format';
import { useContactSalesStore } from '../../stores/contactSalesStore';
import { Reveal } from '../Reveal';
import { Badge } from '../ui/Badge';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';
import { Icon } from '../icons/Icon';
import { Tabs } from '../ui/Tabs';

type Billing = 'monthly' | 'yearly';

// Section pricing 3 paket: Basic / +AI (featured) / Custom
export function Pricing() {
  const [billing, setBilling] = useState<Billing>('monthly');
  const navigate = useNavigate();
  const showContactSales = useContactSalesStore((s) => s.show);

  return (
    <div className="mx-auto max-w-[1200px] px-4 sm:px-6 lg:px-8">
      <Reveal className="text-center">
        <p className="inline-flex items-center gap-2 text-caption text-fossil">
          <span className="inline-block h-1.5 w-1.5 rounded-full bg-olive" />
          HARGA
        </p>
        <h2 className="mt-4 text-heading-lg font-light text-ink">Harga yang tumbuh bersama bisnismu.</h2>
        <p className="mt-4 text-[17px] text-fossil max-w-xl mx-auto">
          Mulai dari kasir, stok, dan laporan keuangan. Naik ke +AI untuk prediksi dan asisten, atau Custom untuk modul ERP lengkap.
        </p>
        <div className="mt-8 flex justify-center">
          <Tabs<Billing>
            options={[
              { value: 'monthly', label: 'Bulanan' },
              { value: 'yearly', label: 'Tahunan · hemat 20%' },
            ]}
            value={billing}
            onChange={setBilling}
          />
        </div>
      </Reveal>

      <div className="mt-12 grid lg:grid-cols-3 gap-5 items-stretch">
        {plans.map((plan, idx) => {
          const price = billing === 'monthly' ? plan.monthlyPrice : plan.yearlyPrice;
          return (
            <Reveal key={plan.id} delay={idx * 0.06} className="h-full">
              <Card
                className={cn(
                  'relative h-full rounded-2xl p-7 flex flex-col',
                  plan.featured && 'border-ink',
                )}
              >
                {plan.badge && (
                  <Badge variant="accent" icon="assistant" className="absolute -top-3 left-6">
                    {plan.badge}
                  </Badge>
                )}
                <h3 className="text-heading-sm font-light text-ink">{plan.name}</h3>
                <p className="mt-1.5 text-body-sm text-fossil min-h-[40px]">{plan.tagline}</p>

                <div className="mt-6">
                  {price === null ? (
                    <span className="text-heading font-light text-ink">Harga kustom</span>
                  ) : (
                    <>
                      <span className="tnum text-[40px] leading-none font-light text-ink">
                        {formatIDR(price)}
                      </span>
                      <span className="text-caption text-fossil"> /bulan</span>
                      {billing === 'yearly' && (
                        <p className="mt-1.5 text-caption text-fossil">Ditagih tahunan · hemat 20%</p>
                      )}
                    </>
                  )}
                </div>

                <div className="my-6 border-t border-ash" />

                <ul className="flex-1 space-y-3">
                  {plan.features.map((f) => (
                    <li key={f} className="flex gap-2.5">
                      <Icon name="check" size={15} className="mt-[3px] shrink-0 text-olive" />
                      <span className="text-body-sm text-ink">{f}</span>
                    </li>
                  ))}
                </ul>

                <div className="mt-7">
                  <Button
                    full
                    size="lg"
                    variant={plan.featured ? 'primary' : 'ghost'}
                    onClick={() => {
                      if (plan.id === 'custom') {
                        showContactSales('Paket Custom');
                      } else {
                        navigate('/onboarding');
                      }
                    }}
                  >
                    {plan.cta}
                  </Button>
                </div>
              </Card>
            </Reveal>
          );
        })}
      </div>

      <p className="mt-8 text-center text-caption text-fossil">
        Harga dalam IDR, belum termasuk PPN. Upgrade, downgrade, atau berhenti kapan saja. Datamu tetap milikmu.
      </p>
    </div>
  );
}
