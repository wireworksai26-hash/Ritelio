import { useMemo, useState } from 'react';
import { SensorTrend, type SensorHistory } from '../components/iot/SensorTrend';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { Card, CardBody, CardHeader } from '../components/ui/Card';
import { Input, Select } from '../components/ui/controls';
import { DataTable, RowAction, StatRow, type Column } from '../components/ui/DataTable';
import { Modal } from '../components/ui/Modal';
import { PageHeader } from '../components/ui/PageHeader';
import { Tabs } from '../components/ui/Tabs';
import { apiFetch } from '../lib/api';
import { formatNumber, timeAgo } from '../lib/format';
import { listOf, useResource } from '../lib/useResource';
import { toast } from '../stores/toastStore';

type TabKey = 'perangkat' | 'tren' | 'uji';

const tabOptions: Array<{ value: TabKey; label: string }> = [
  { value: 'perangkat', label: 'Perangkat' },
  { value: 'tren', label: 'Tren Pembacaan' },
  { value: 'uji', label: 'Uji Kirim' },
];

interface Sensor {
  id: string;
  code: string;
  name: string;
  type: string;
  unit: string;
  warehouseId: string | null;
  workCenterId: string | null;
  isActive: boolean;
  lastSeenAt: string | null;
  _count: { readings: number };
}

interface Warehouse {
  id: string;
  name: string;
}

interface WorkCenter {
  id: string;
  code: string;
  name: string;
}

interface IssuedKey {
  code: string;
  apiKey: string;
  rotated: boolean;
}

const SENSOR_TYPES: Array<{ value: string; label: string; unit: string }> = [
  { value: 'temperature', label: 'Suhu', unit: '°C' },
  { value: 'humidity', label: 'Kelembapan', unit: '%' },
  { value: 'counter', label: 'Penghitung produksi', unit: 'unit' },
  { value: 'weight', label: 'Berat', unit: 'kg' },
  { value: 'vibration', label: 'Getaran', unit: 'mm/s' },
  { value: 'power', label: 'Daya', unit: 'kW' },
];
const typeLabel = (t: string) => SENSOR_TYPES.find((x) => x.value === t)?.label ?? t;

const HOUR_OPTIONS = [
  { value: 6, label: '6 jam' },
  { value: 24, label: '24 jam' },
  { value: 72, label: '3 hari' },
  { value: 168, label: '7 hari' },
];

// Sensor dianggap aktif bila terakhir mengirim dalam jendela ini.
const ONLINE_WINDOW_MS = 15 * 60 * 1000;
const isOnline = (s: Sensor) => s.isActive && !!s.lastSeenAt && Date.now() - new Date(s.lastSeenAt).getTime() < ONLINE_WINDOW_MS;

export default function Iot() {
  const [tab, setTab] = useState<TabKey>('perangkat');
  const [query, setQuery] = useState('');

  const sensors = useResource<Sensor[]>('/v1/iot/sensors');
  const warehouses = useResource<Warehouse[]>('/v1/inventory/warehouses');
  const workCenters = useResource<WorkCenter[]>('/v1/manufacturing/work-centers');
  const sensorRows = useMemo(() => listOf<Sensor>(sensors.data), [sensors.data]);
  const warehouseRows = useMemo(() => listOf<Warehouse>(warehouses.data), [warehouses.data]);
  const workCenterRows = useMemo(() => listOf<WorkCenter>(workCenters.data), [workCenters.data]);

  const filtered = useMemo(
    () => sensorRows.filter((s) => `${s.code} ${s.name}`.toLowerCase().includes(query.toLowerCase())),
    [sensorRows, query],
  );

  // ── Tren ──
  const [trendCode, setTrendCode] = useState('');
  const [hours, setHours] = useState(24);
  const activeTrendCode = trendCode || sensorRows[0]?.code || '';
  const history = useResource<SensorHistory>(
    activeTrendCode ? `/v1/iot/sensors/${encodeURIComponent(activeTrendCode)}?hours=${hours}` : null,
  );

  // ── Daftar sensor ──
  const [registerOpen, setRegisterOpen] = useState(false);
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [type, setType] = useState('temperature');
  const [unit, setUnit] = useState('°C');
  const [warehouseId, setWarehouseId] = useState('');
  const [workCenterId, setWorkCenterId] = useState('');
  const [saving, setSaving] = useState(false);
  const [issued, setIssued] = useState<IssuedKey | null>(null);

  // ── Uji kirim ──
  const [testCode, setTestCode] = useState('');
  const [testKey, setTestKey] = useState('');
  const [testValue, setTestValue] = useState('');
  const [sending, setSending] = useState(false);

  function changeType(next: string) {
    setType(next);
    setUnit(SENSOR_TYPES.find((t) => t.value === next)?.unit ?? '');
  }

  function openTrend(sensor: Sensor) {
    setTrendCode(sensor.code);
    setTab('tren');
  }

  async function registerSensor() {
    if (code.trim().length < 2 || name.trim().length < 2) {
      toast({ title: 'Kode dan nama sensor wajib diisi (min. 2 karakter).', icon: 'warning' });
      return;
    }
    setSaving(true);
    try {
      const res = await apiFetch<{ code: string; apiKey: string }>('/v1/iot/sensors', {
        method: 'POST',
        body: JSON.stringify({
          code: code.trim(),
          name: name.trim(),
          type,
          unit: unit.trim(),
          ...(warehouseId ? { warehouseId } : {}),
          ...(workCenterId ? { workCenterId } : {}),
        }),
      });
      setRegisterOpen(false);
      setIssued({ code: res.code, apiKey: res.apiKey, rotated: false });
      setCode('');
      setName('');
      setWarehouseId('');
      setWorkCenterId('');
      sensors.reload();
    } catch (err) {
      toast({ title: err instanceof Error ? err.message : 'Gagal mendaftarkan sensor.', icon: 'warning' });
    } finally {
      setSaving(false);
    }
  }

  async function rotateKey(sensor: Sensor) {
    if (!window.confirm(`Putar ulang API key ${sensor.code}? Perangkat harus diperbarui dengan key baru.`)) return;
    try {
      const res = await apiFetch<{ code: string; apiKey: string }>(`/v1/iot/sensors/${encodeURIComponent(sensor.code)}/rotate-key`, {
        method: 'POST',
      });
      setIssued({ code: res.code, apiKey: res.apiKey, rotated: true });
    } catch (err) {
      toast({ title: err instanceof Error ? err.message : 'Gagal memutar key.', icon: 'warning' });
    }
  }

  async function copyKey(value: string) {
    try {
      await navigator.clipboard.writeText(value);
      toast({ title: 'API key disalin.', icon: 'check' });
    } catch {
      toast({ title: 'Gagal menyalin. Salin manual dari kotak.', icon: 'warning' });
    }
  }

  async function sendTestReading() {
    const code = testCode || sensorRows[0]?.code || '';
    const value = Number(testValue.replace(',', '.'));
    if (!code || testKey.trim().length < 16 || !Number.isFinite(value)) {
      toast({ title: 'Pilih sensor, isi API key lengkap, dan nilai berupa angka.', icon: 'warning' });
      return;
    }
    setSending(true);
    try {
      await apiFetch('/v1/iot/readings', {
        method: 'POST',
        body: JSON.stringify({ deviceCode: code, apiKey: testKey.trim(), value }),
      });
      toast({ title: 'Pembacaan diterima.', icon: 'check' });
      setTestValue('');
      sensors.reload();
      if (code === activeTrendCode) history.reload();
    } catch (err) {
      toast({ title: err instanceof Error ? err.message : 'Gagal mengirim pembacaan.', icon: 'warning' });
    } finally {
      setSending(false);
    }
  }

  const columns: Column<Sensor>[] = [
    {
      key: 'name',
      header: 'Sensor',
      render: (s) => (
        <div className="min-w-0">
          <p className="text-ink truncate">{s.name}</p>
          <p className="text-caption text-fossil">{s.code}</p>
        </div>
      ),
    },
    { key: 'type', header: 'Jenis', render: (s) => `${typeLabel(s.type)}${s.unit ? ` (${s.unit})` : ''}` },
    {
      key: 'status',
      header: 'Status',
      render: (s) =>
        !s.isActive ? (
          <Badge variant="outline">Nonaktif</Badge>
        ) : isOnline(s) ? (
          <Badge variant="accent">Mengirim</Badge>
        ) : (
          <Badge variant="neutral">Diam</Badge>
        ),
    },
    { key: 'seen', header: 'Terakhir aktif', render: (s) => (s.lastSeenAt ? timeAgo(s.lastSeenAt) : 'Belum pernah') },
    { key: 'count', header: 'Pembacaan', align: 'right', hideOnMobile: true, render: (s) => <span className="tnum">{formatNumber(s._count.readings)}</span> },
  ];

  const online = sensorRows.filter(isOnline).length;
  const totalReadings = sensorRows.reduce((sum, s) => sum + s._count.readings, 0);

  return (
    <div className="space-y-5 sm:space-y-6">
      <PageHeader
        title="IoT & Sensor"
        subtitle="Pantau suhu gudang dan penghitung produksi. Sensor hanya melaporkan angka; stok tidak berubah otomatis."
        actions={
          <Button icon="plus" onClick={() => setRegisterOpen(true)}>
            Daftarkan sensor
          </Button>
        }
      />

      <StatRow
        items={[
          { label: 'Sensor terdaftar', value: sensorRows.length },
          { label: 'Sedang mengirim', value: online, tone: 'accent' },
          { label: 'Diam / nonaktif', value: sensorRows.length - online },
          { label: 'Total pembacaan', value: formatNumber(totalReadings) },
        ]}
      />

      <Tabs options={tabOptions} value={tab} onChange={setTab} />

      {tab === 'perangkat' && (
        <div className="space-y-3">
          <Input
            aria-label="Cari sensor"
            placeholder="Cari kode atau nama sensor"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            type="search"
          />
          <DataTable
            rows={filtered}
            columns={columns}
            rowKey={(s) => s.id}
            loading={sensors.loading}
            error={sensors.error}
            onRetry={sensors.reload}
            emptyIcon="sensor"
            emptyTitle={query ? 'Sensor tidak ditemukan' : 'Belum ada sensor'}
            emptyBody={query ? 'Coba kata kunci lain.' : 'Daftarkan sensor pertama untuk mulai memantau gudang atau mesin.'}
            emptyAction={
              query ? undefined : (
                <Button icon="plus" onClick={() => setRegisterOpen(true)}>
                  Daftarkan sensor
                </Button>
              )
            }
            onRowClick={openTrend}
            rowActions={(s) => (
              <>
                <RowAction icon="chart" label="Lihat tren" onClick={() => openTrend(s)} />
                <RowAction icon="lock" label="Putar ulang API key" onClick={() => rotateKey(s)} />
              </>
            )}
          />
        </div>
      )}

      {tab === 'tren' && (
        <div className="space-y-3 sm:space-y-4">
          {sensorRows.length === 0 && !sensors.loading ? (
            <DataTable
              rows={[]}
              columns={columns}
              rowKey={(s) => s.id}
              emptyIcon="sensor"
              emptyTitle="Belum ada sensor"
              emptyBody="Daftarkan sensor di tab Perangkat untuk melihat tren."
            />
          ) : (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Select label="Sensor" value={activeTrendCode} onChange={(e) => setTrendCode(e.target.value)}>
                  {sensorRows.map((s) => (
                    <option key={s.id} value={s.code}>
                      {s.code} — {s.name}
                    </option>
                  ))}
                </Select>
                <Select label="Rentang waktu" value={String(hours)} onChange={(e) => setHours(Number(e.target.value))}>
                  {HOUR_OPTIONS.map((h) => (
                    <option key={h.value} value={h.value}>
                      {h.label}
                    </option>
                  ))}
                </Select>
              </div>
              <SensorTrend history={history.data} loading={history.loading} error={history.error} hours={hours} onRetry={history.reload} />
            </>
          )}
        </div>
      )}

      {tab === 'uji' && (
        <Card>
          <CardHeader
            title="Uji kirim pembacaan"
            subtitle="Simulasikan perangkat mengirim satu angka. API key hanya tampil sekali saat pendaftaran atau putar ulang key."
          />
          <CardBody className="space-y-3">
            {sensorRows.length === 0 ? (
              <p className="text-body-sm text-fossil">Daftarkan sensor terlebih dahulu.</p>
            ) : (
              <>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <Select label="Sensor" value={testCode || sensorRows[0].code} onChange={(e) => setTestCode(e.target.value)}>
                    {sensorRows.map((s) => (
                      <option key={s.id} value={s.code}>
                        {s.code} — {s.name}
                      </option>
                    ))}
                  </Select>
                  <Input
                    label="Nilai"
                    value={testValue}
                    onChange={(e) => setTestValue(e.target.value)}
                    inputMode="decimal"
                    placeholder="mis. 5.5"
                  />
                  <div className="sm:col-span-2">
                    <Input
                      label="API key sensor"
                      value={testKey}
                      onChange={(e) => setTestKey(e.target.value)}
                      type="password"
                      autoComplete="off"
                    />
                  </div>
                </div>
                <Button onClick={sendTestReading} disabled={sending} full>
                  {sending ? 'Mengirim…' : 'Kirim pembacaan'}
                </Button>
              </>
            )}
          </CardBody>
        </Card>
      )}

      <Modal open={registerOpen} onClose={() => setRegisterOpen(false)} title="Daftarkan Sensor" maxWidth="lg">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Input label="Kode" value={code} onChange={(e) => setCode(e.target.value)} placeholder="mis. TEMP-GDG-01" />
          <Input label="Nama" value={name} onChange={(e) => setName(e.target.value)} placeholder="mis. Chiller gudang utama" />
          <Select label="Jenis" value={type} onChange={(e) => changeType(e.target.value)}>
            {SENSOR_TYPES.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </Select>
          <Input label="Satuan" value={unit} onChange={(e) => setUnit(e.target.value)} maxLength={20} />
          <Select label="Gudang (opsional)" value={warehouseId} onChange={(e) => setWarehouseId(e.target.value)}>
            <option value="">Tidak dikaitkan</option>
            {warehouseRows.map((w) => (
              <option key={w.id} value={w.id}>
                {w.name}
              </option>
            ))}
          </Select>
          <Select label="Work center (opsional)" value={workCenterId} onChange={(e) => setWorkCenterId(e.target.value)}>
            <option value="">Tidak dikaitkan</option>
            {workCenterRows.map((w) => (
              <option key={w.id} value={w.id}>
                {w.code} — {w.name}
              </option>
            ))}
          </Select>
        </div>
        <div className="mt-5 flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
          <Button variant="ghost" onClick={() => setRegisterOpen(false)}>
            Batal
          </Button>
          <Button onClick={registerSensor} disabled={saving}>
            {saving ? 'Menyimpan…' : 'Daftarkan'}
          </Button>
        </div>
      </Modal>

      <Modal
        open={!!issued}
        onClose={() => setIssued(null)}
        title={issued?.rotated ? 'API key baru' : 'Sensor terdaftar'}
        maxWidth="md"
      >
        {issued && (
          <div className="space-y-3">
            <p className="text-body-sm text-fossil">
              Simpan API key untuk <span className="text-ink">{issued.code}</span> sekarang. Key ini tidak akan ditampilkan lagi.
            </p>
            <div className="rounded-lg border border-ash bg-bone px-3 py-2.5 font-mono text-[13px] text-ink break-all select-all">
              {issued.apiKey}
            </div>
            <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
              <Button variant="ghost" onClick={() => setIssued(null)}>
                Tutup
              </Button>
              <Button icon="copy" onClick={() => copyKey(issued.apiKey)}>
                Salin key
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
