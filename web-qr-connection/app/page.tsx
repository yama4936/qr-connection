import Link from "next/link";

export default function Home() {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-3xl flex-col justify-center px-6 py-20">
      <section className="rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
        <h1 className="text-3xl font-bold text-slate-900">
          QRコード通信
        </h1>
        <p className="mt-3 text-slate-600">
          QRコードを複数生成し、通信を使わずに情報を送信します。
        </p>
        <div className="mt-8 grid gap-3 sm:grid-cols-2">
          <Link
            href="/send"
            className="rounded-lg bg-slate-900 px-5 py-4 text-center font-medium text-white"
          >
            送る
          </Link>
          <Link
            href="/receive"
            className="rounded-lg border border-slate-300 px-5 py-4 text-center font-medium text-slate-700"
          >
            受け取る
          </Link>
        </div>
      </section>
    </main>
  );
}
