import { useState, useEffect } from 'react';

export interface ReceiptData {
  id: string;
  status: string;
  startedAt: string;
  endedAt?: string | null;
  station: { number: number; type: string };
  club?: { name: string } | null;
  operator?: { fullName: string } | null;
  customer?: { fullName: string; balance?: number } | null;
  gamepads: number;
  paymentMode: string;
  segments: { tariffName: string; billedMinutes: number; amount: number }[];
  items: { name: string; qty: number; unitPrice: number; amount: number }[];
  totals: {
    gameAmount: number;
    itemsAmount: number;
    discount: number;
    totalAmount: number;
    paidAmount: number;
    debt: number;
  };
  payments?: { method: string; amount: number }[];
  shares?: number;
}

const summa = (v: number) => v.toLocaleString('uz-UZ');

export function ReceiptModal({
  data,
  onClose,
}: {
  data: ReceiptData;
  onClose: () => void;
}) {
  const [paperWidth, setPaperWidth] = useState<'58' | '80'>('80');

  useEffect(() => {
    const handleAfterPrint = () => {
      document.body.classList.remove('printing-receipt');
    };
    window.addEventListener('afterprint', handleAfterPrint);
    return () => {
      window.removeEventListener('afterprint', handleAfterPrint);
      document.body.classList.remove('printing-receipt');
    };
  }, []);

  const handlePrint = () => {
    document.body.classList.add('printing-receipt');
    window.print();
    setTimeout(() => {
      document.body.classList.remove('printing-receipt');
    }, 1500);
  };

  const startDate = new Date(data.startedAt);
  const endDate = data.endedAt ? new Date(data.endedAt) : new Date();
  const durationMinutes = Math.max(0, Math.round((endDate.getTime() - startDate.getTime()) / 60000));
  const hours = Math.floor(durationMinutes / 60);
  const mins = durationMinutes % 60;
  const durationText = hours > 0 ? `${hours} soat ${mins} daq` : `${mins} daqiqa`;

  const receiptId = data.id.slice(0, 8).toUpperCase();
  const clubName = data.club?.name || 'PLAYSTATION KLUB';
  const opName = data.operator?.fullName || 'Operator';
  const customerName = data.customer?.fullName || 'Mehmon';

  const widthClass = paperWidth === '58' ? 'max-w-[58mm] text-[11px]' : 'max-w-[80mm] text-xs';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/80 p-4 backdrop-blur-sm">
      <div className="flex max-h-[95vh] w-full max-w-md flex-col overflow-hidden rounded-2xl border border-slate-700 bg-slate-900 shadow-2xl">
        {/* Modal Header */}
        <div className="flex items-center justify-between border-b border-slate-800 px-5 py-3.5">
          <div className="flex items-center gap-2">
            <span className="text-lg font-bold text-white">Chek / Kvitansiya</span>
            <span className="rounded bg-slate-800 px-2 py-0.5 text-xs text-slate-400">#{receiptId}</span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-800 hover:text-white"
          >
            ✕
          </button>
        </div>

        {/* Paper Size selector */}
        <div className="flex items-center justify-between border-b border-slate-800/80 bg-slate-950/40 px-5 py-2.5 text-xs text-slate-300">
          <span>Qog'oz o'lchami:</span>
          <div className="flex gap-1.5">
            <button
              type="button"
              onClick={() => setPaperWidth('58')}
              className={`rounded px-2.5 py-1 font-medium transition ${
                paperWidth === '58' ? 'bg-emerald-600 text-white' : 'bg-slate-800 text-slate-400 hover:text-white'
              }`}
            >
              58 mm
            </button>
            <button
              type="button"
              onClick={() => setPaperWidth('80')}
              className={`rounded px-2.5 py-1 font-medium transition ${
                paperWidth === '80' ? 'bg-emerald-600 text-white' : 'bg-slate-800 text-slate-400 hover:text-white'
              }`}
            >
              80 mm
            </button>
          </div>
        </div>

        {/* Printable Area / Visual Preview */}
        <div className="flex-1 overflow-y-auto p-4 flex justify-center bg-slate-950/70">
          <div
            id="receipt-print-area"
            className={`w-full ${widthClass} bg-white text-black p-4 font-mono shadow-md select-text leading-tight`}
            style={{ minHeight: '320px' }}
          >
            {/* Club Header */}
            <div className="text-center pb-2 border-b border-dashed border-gray-400">
              <h2 className="text-sm font-black uppercase tracking-wider">{clubName}</h2>
              <p className="text-[10px] text-gray-700 mt-0.5">Xizmat ko'rsatish cheki</p>
              <p className="text-[10px] text-gray-600">Chek #{receiptId}</p>
            </div>

            {/* Info rows */}
            <div className="py-2 border-b border-dashed border-gray-400 text-[10px] space-y-0.5">
              <div className="flex justify-between">
                <span>Joy:</span>
                <span className="font-bold">{data.station.number}-joy ({data.station.type})</span>
              </div>
              <div className="flex justify-between">
                <span>Mijoz:</span>
                <span className="font-semibold">{customerName}</span>
              </div>
              <div className="flex justify-between">
                <span>Operator:</span>
                <span>{opName}</span>
              </div>
              <div className="flex justify-between">
                <span>Pultlar:</span>
                <span>{data.gamepads} ta</span>
              </div>
              <div className="flex justify-between">
                <span>Boshlandi:</span>
                <span>{startDate.toLocaleDateString('uz-UZ')} {startDate.toLocaleTimeString('uz-UZ', { hour: '2-digit', minute: '2-digit' })}</span>
              </div>
              <div className="flex justify-between">
                <span>{data.status === 'CLOSED' ? 'Yopildi:' : 'Vaqt:'}</span>
                <span>{endDate.toLocaleDateString('uz-UZ')} {endDate.toLocaleTimeString('uz-UZ', { hour: '2-digit', minute: '2-digit' })}</span>
              </div>
              <div className="flex justify-between">
                <span>Davomiyligi:</span>
                <span className="font-bold">{durationText}</span>
              </div>
            </div>

            {/* Segments / Tariffs */}
            {data.segments && data.segments.length > 0 && (
              <div className="py-2 border-b border-dashed border-gray-400">
                <div className="text-[10px] font-bold uppercase mb-1">O'yin vaqti:</div>
                {data.segments.map((s, idx) => (
                  <div key={idx} className="flex justify-between text-[10px] py-0.5">
                    <span className="truncate pr-1">{s.tariffName} ({s.billedMinutes} daq)</span>
                    <span className="font-semibold whitespace-nowrap">{summa(s.amount)}</span>
                  </div>
                ))}
                <div className="flex justify-between text-[10px] font-bold pt-1 border-t border-dotted border-gray-300">
                  <span>Jami o'yin:</span>
                  <span>{summa(data.totals.gameAmount)} so'm</span>
                </div>
              </div>
            )}

            {/* Bar / Items */}
            {data.items && data.items.length > 0 && (
              <div className="py-2 border-b border-dashed border-gray-400">
                <div className="text-[10px] font-bold uppercase mb-1">Bufet / Mahsulotlar:</div>
                {data.items.map((item, idx) => (
                  <div key={idx} className="text-[10px] py-0.5">
                    <div className="flex justify-between">
                      <span className="font-medium">{item.name}</span>
                      <span className="font-semibold">{summa(item.amount)}</span>
                    </div>
                    <div className="text-[9px] text-gray-600 pl-2">
                      {item.qty} dona x {summa(item.unitPrice)}
                    </div>
                  </div>
                ))}
                <div className="flex justify-between text-[10px] font-bold pt-1 border-t border-dotted border-gray-300">
                  <span>Jami bufet:</span>
                  <span>{summa(data.totals.itemsAmount)} so'm</span>
                </div>
              </div>
            )}

            {/* Totals & Financials */}
            <div className="py-2 border-b border-dashed border-gray-400 text-[10px] space-y-1">
              <div className="flex justify-between">
                <span>Hisob:</span>
                <span>{summa(data.totals.gameAmount + data.totals.itemsAmount)} so'm</span>
              </div>
              {data.totals.discount > 0 && (
                <div className="flex justify-between text-gray-700">
                  <span>Chegirma:</span>
                  <span>-{summa(data.totals.discount)} so'm</span>
                </div>
              )}
              <div className="flex justify-between text-xs font-black pt-1 border-t border-gray-800">
                <span>JAMI TO'LOV:</span>
                <span>{summa(data.totals.totalAmount)} so'm</span>
              </div>

              {/* Payments breakdown */}
              {data.payments && data.payments.length > 0 && (
                <div className="pt-1 text-[9px] space-y-0.5">
                  <div className="font-semibold text-gray-700">To'langan:</div>
                  {data.payments.map((p, idx) => (
                    <div key={idx} className="flex justify-between pl-2">
                      <span>{p.method === 'CASH' ? 'Naqd pul' : p.method === 'CARD' ? 'Plastik karta' : 'Mijoz balansi'}:</span>
                      <span>{summa(p.amount)} so'm</span>
                    </div>
                  ))}
                </div>
              )}

              {data.totals.debt > 0 && (
                <div className="flex justify-between text-[10px] font-bold text-red-700 pt-1">
                  <span>Qoldiq qarz:</span>
                  <span>{summa(data.totals.debt)} so'm</span>
                </div>
              )}

              {/* Split info if applicable */}
              {data.shares && data.shares > 1 && (
                <div className="mt-1 pt-1 border-t border-dotted border-gray-300 text-[9px]">
                  <div className="flex justify-between font-bold">
                    <span>{data.shares} kishiga bo'linganda:</span>
                    <span>~{summa(Math.ceil(data.totals.totalAmount / data.shares))} so'm / kishi</span>
                  </div>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="pt-3 text-center text-[9px] text-gray-700 space-y-0.5">
              <p className="font-bold">TASHRIFINGIZ UCHUN RAHMAT!</p>
              <p>Yana kutib qolamiz</p>
              <p className="text-[8px] text-gray-500 pt-1">
                {new Date().toLocaleDateString('uz-UZ')} {new Date().toLocaleTimeString('uz-UZ', { hour: '2-digit', minute: '2-digit' })}
              </p>
            </div>
          </div>
        </div>

        {/* Modal Actions */}
        <div className="flex gap-2 border-t border-slate-800 p-4 bg-slate-900">
          <button
            type="button"
            onClick={onClose}
            className="tap flex-1 rounded-lg bg-slate-800 py-2.5 text-sm font-medium text-slate-300 transition hover:bg-slate-700 hover:text-white"
          >
            Yopish
          </button>
          <button
            type="button"
            onClick={handlePrint}
            className="tap flex-1 flex items-center justify-center gap-2 rounded-lg bg-emerald-600 py-2.5 text-sm font-bold text-white shadow-lg transition hover:bg-emerald-500"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
            </svg>
            Chop etish
          </button>
        </div>
      </div>
    </div>
  );
}
