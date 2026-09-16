interface Props {
  title: string;
  phase: string;
}

/** 2-bosqichda to'ldiriladigan ekranlar uchun vaqtinchalik sahifa. */
export function Placeholder({ title, phase }: Props) {
  return (
    <div>
      <h1 className="text-xl font-semibold">{title}</h1>
      <p className="mt-2 text-sm text-slate-400">Bu ekran {phase} da qo'shiladi.</p>
    </div>
  );
}
