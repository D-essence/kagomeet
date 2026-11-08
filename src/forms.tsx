import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { ArrowRight, ArrowLeft, Check, Mail, RefreshCw } from 'lucide-react';
import { EventSummary, LoadState, useEvents } from './components/Events';
import { Breadcrumb, PageHeading, NotFound } from './pages';
import { api, isDemo, registrationsOpen } from './lib';
import { yen, type Gender } from './types';
interface Applicant {
  name: string;
  gender: Gender | '';
  age: string;
  email: string;
  phone: string;
  terms: boolean;
}
const initial: Applicant = { name: '', gender: '', age: '', email: '', phone: '', terms: false };
export function ApplyPage() {
  const { id } = useParams(),
    state = useEvents(id),
    e = state.events[0];
  const [form, setForm] = useState<Applicant>(initial),
    [step, setStep] = useState<'input' | 'review' | 'demo'>('input'),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const key = useRef(''),
    payloadRef = useRef('');
  const update = (field: keyof Applicant, value: string | boolean) => {
    setForm((v) => ({ ...v, [field]: value }));
    setError('');
  };
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!e) return;
    if (
      !form.gender ||
      Number(form.age) < e.minAge ||
      Number(form.age) > e.maxAge ||
      (e.alcohol && Number(form.age) < 20)
    ) {
      setError('対象年齢と参加区分をご確認ください');
      return;
    }
    if ((form.gender === 'male' ? e.maleRemaining : e.femaleRemaining) <= 0) {
      setError('選択した区分は受付を終了しました');
      return;
    }
    setStep('review');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };
  const register = async () => {
    if (!e || busy) return;
    setBusy(true);
    setError('');
    if (isDemo) {
      setStep('demo');
      setBusy(false);
      window.scrollTo(0, 0);
      return;
    }
    try {
      const payload = { ...form, eventId: e.id, age: Number(form.age) };
      const digest = await crypto.subtle.digest(
        'SHA-256',
        new TextEncoder().encode(JSON.stringify(payload)),
      );
      const signature = Array.from(new Uint8Array(digest), (b) =>
        b.toString(16).padStart(2, '0'),
      ).join('');
      if (signature !== payloadRef.current) {
        const saved = sessionStorage.getItem(`kagomeet-registration-${e.id}`);
        let prior;
        try {
          prior = saved ? JSON.parse(saved) : null;
        } catch {
          prior = null;
        }
        key.current = prior?.signature === signature ? prior.key : crypto.randomUUID();
        payloadRef.current = signature;
        sessionStorage.setItem(
          `kagomeet-registration-${e.id}`,
          JSON.stringify({ signature, key: key.current }),
        );
      }
      const result = await api<{ bookingId: string; token: string }>('/bookings', {
        method: 'POST',
        body: JSON.stringify({ ...payload, idempotencyKey: key.current }),
      });
      sessionStorage.removeItem(`kagomeet-registration-${e.id}`);
      sessionStorage.setItem(
        'kagomeet-booking',
        JSON.stringify({ bookingId: result.bookingId, token: result.token }),
      );
      window.location.assign(`/complete?booking=${result.bookingId}&token=${result.token}`);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };
  if (state.loading || state.error)
    return (
      <div className="page-container">
        <LoadState {...state} />
      </div>
    );
  if (!e) return <NotFound />;
  if (!registrationsOpen) return <div className="page-container narrow"><div className="empty-state">参加申し込みは受付開始前です。開催情報をご確認のうえ、受付開始をお待ちください。</div><Link className="button dark" to={`/events/${e.id}`}>イベント詳細に戻る</Link></div>;
  if (step === 'demo')
    return (
      <div className="page-container narrow">
        <div className="completion">
          <div className="completion-icon">
            <Check size={34} />
          </div>
          <span className="eyebrow">DEMO PREVIEW</span>
          <h1>申し込み内容を確認しました。</h1>
          <p>
            これはデモの確認画面です。
            <br />
            <strong>実際の予約・集金・メール送信は行っていません。</strong>
          </p>
          <EventSummary event={e} />
          <p>実際の受付では、申し込み完了後に受付番号を表示します。参加費は当日会場でお支払いください。</p>
          <Link className="button dark" to="/events">
            イベント一覧へ
            <ArrowRight size={18} />
          </Link>
        </div>
      </div>
    );
  return (
    <div className="page-container narrow">
      <Breadcrumb
        items={[
          { label: 'イベント一覧', to: '/events' },
          { label: e.title, to: `/events/${e.id}` },
          { label: '参加申し込み' },
        ]}
      />
      <PageHeading en="APPLICATION" title="参加申し込み" />
      <ol className="form-steps">
        <li className={step === 'input' ? 'active' : 'done'}>
          <span>1</span>情報入力
        </li>
        <li className={step === 'review' ? 'active' : ''}>
          <span>2</span>内容確認
        </li>
        <li>
          <span>3</span>申込完了
        </li>
      </ol>
      <EventSummary event={e} />
      {error && (
        <div className="form-error" role="alert">
          {error}
        </div>
      )}
      {step === 'input' ? (
        <form className="application-form" onSubmit={submit}>
          <div className="form-intro">
            <h2>参加者情報</h2>
            <span>
              <i>*</i> 必須項目
            </span>
          </div>
          <label>
            お名前 <i>*</i>
            <input
              autoComplete="name"
              required
              minLength={2}
              maxLength={80}
              value={form.name}
              onChange={(v) => update('name', v.target.value)}
              placeholder="鹿児島 花子"
            />
          </label>
          <fieldset>
            <legend>
              参加区分 <i>*</i>
            </legend>
            <div className="gender-options">
              {(['male', 'female'] as const).map((g) => (
                <label className={`radio-card ${form.gender === g ? 'selected' : ''}`} key={g}>
                  <input
                    type="radio"
                    name="gender"
                    required
                    value={g}
                    checked={form.gender === g}
                    onChange={() => update('gender', g)}
                    disabled={(g === 'male' ? e.maleRemaining : e.femaleRemaining) === 0}
                  />
                  <span>
                    {g === 'male' ? '男性' : '女性'}
                    <strong>{yen(g === 'male' ? e.malePrice : e.femalePrice)}</strong>
                  </span>
                  <small>
                    {(g === 'male' ? e.maleRemaining : e.femaleRemaining) === 0
                      ? '受付終了'
                      : '税込'}
                  </small>
                </label>
              ))}
            </div>
          </fieldset>
          <label>
            年齢 <i>*</i>
            <div className="age-input">
              <input
                type="number"
                inputMode="numeric"
                min={e.minAge}
                max={e.maxAge}
                required
                value={form.age}
                onChange={(v) => update('age', v.target.value)}
              />
              <span>歳</span>
            </div>
            <small>
              開催日時点で{e.minAge}〜{e.maxAge}歳。当日は公的な身分証をお持ちください。
            </small>
          </label>
          <label>
            メールアドレス <i>*</i>
            <input
              type="email"
              autoComplete="email"
              required
              maxLength={254}
              value={form.email}
              onChange={(v) => update('email', v.target.value)}
              placeholder="example@email.com"
            />
            <small>運営からイベントについて連絡する場合に使用します。</small>
          </label>
          <label>
            電話番号 <i>*</i>
            <input
              type="tel"
              autoComplete="tel"
              inputMode="tel"
              required
              pattern="[0-9０-９\- ()]{10,15}"
              value={form.phone}
              onChange={(v) =>
                update(
                  'phone',
                  v.target.value.replace(/[０-９]/g, (c) =>
                    String.fromCharCode(c.charCodeAt(0) - 65248),
                  ),
                )
              }
              placeholder="09012345678"
            />
            <small>イベントに関する緊急時のご連絡に使用します。</small>
          </label>
          <div className="policy-summary">
            <h3>お支払いとキャンセル</h3>
            <p>参加費は当日会場でお支払いください。開催2時間前までは申込完了画面からキャンセルできます。</p>
          </div>
          <label className="checkbox-label">
            <input
              type="checkbox"
              required
              checked={form.terms}
              onChange={(v) => update('terms', v.target.checked)}
            />
            <span>
              <Link to="/terms" target="_blank">
                利用規約
              </Link>
              ・
              <Link to="/privacy" target="_blank">
                プライバシーポリシー
              </Link>
              ・キャンセル規定を確認し、同意します。<i>*</i>
            </span>
          </label>
          <button className="button dark wide" type="submit">
            入力内容を確認する
            <ArrowRight size={18} />
          </button>
          <p className="form-footnote">この時点では、申し込みは確定しません。</p>
        </form>
      ) : (
        <section className="review-form">
          <h2>お申し込み内容の確認</h2>
          <dl className="info-table">
            <div>
              <dt>お名前</dt>
              <dd>{form.name}</dd>
            </div>
            <div>
              <dt>参加区分・年齢</dt>
              <dd>
                {form.gender === 'male' ? '男性' : '女性'} / {form.age}歳
              </dd>
            </div>
            <div>
              <dt>メールアドレス</dt>
              <dd>{form.email}</dd>
            </div>
            <div>
              <dt>電話番号</dt>
              <dd>{form.phone}</dd>
            </div>
          </dl>
          <div className="total-price">
            <span>
              会場でのお支払い <small>（税込）</small>
            </span>
            <strong>{yen(form.gender === 'male' ? e.malePrice : e.femalePrice)}</strong>
          </div>
          <p className="notice">
            {isDemo
              ? 'デモモードです。実際の申し込みは行わず、確認画面を表示します。'
              : '申し込みを確定します。参加費のお支払いは当日会場です。'}
          </p>
          <button className="button coral wide" onClick={register} disabled={busy}>
            {busy ? '申し込みを受け付けています…' : isDemo ? 'デモの確認画面へ' : '申し込みを確定する'}
            <ArrowRight size={18} />
          </button>
          <button
            className="back-button"
            onClick={() => {
              setStep('input');
              setError('');
            }}
            disabled={busy}
          >
            <ArrowLeft size={16} />
            入力内容を修正する
          </button>
          <p className="payment-note">受付番号は申込完了画面に表示されます。画面を保存して当日ご提示ください。</p>
        </section>
      )}
    </div>
  );
}
interface Status {
  id: string;
  eventId: string;
  eventTitle: string;
  status: 'confirmed' | 'cancelled';
  amount: number;
  received: boolean;
  checkedIn: boolean;
}
export function CompletePage() {
  const [params] = useSearchParams(),
    [booking, setBooking] = useState<Status | null>(null),
    [error, setError] = useState(''),
    [cancelling, setCancelling] = useState(false),
    [attempt, setAttempt] = useState(0);
  const stored = (() => { try { return JSON.parse(sessionStorage.getItem('kagomeet-booking') || '{}'); } catch { return {}; } })();
  const id = params.get('booking') || stored.bookingId,
    token = params.get('token') || stored.token;
  useEffect(() => {
    if (!id || !token) {
      setError('確認用の情報が見つかりません。申込完了時の画面をご確認ください。');
      return;
    }
    let active = true;
    const load = async () => {
      try {
        const b = await api<Status>('/booking/status', {
          method: 'POST',
          body: JSON.stringify({ bookingId: id, token }),
        });
        if (!active) return;
        setBooking(b);
        setError('');
      } catch (err) {
        if (active) setError((err as Error).message);
      }
    };
    load();
    return () => { active = false; };
  }, [id, token, attempt]);
  const cancel = async () => {
    if (!id || !token || !confirm('この申し込みをキャンセルしますか？')) return;
    setCancelling(true); setError('');
    try {
      await api('/booking/cancel', { method: 'POST', body: JSON.stringify({ bookingId: id, token }) });
      setAttempt((v) => v + 1);
    } catch (err) { setError((err as Error).message); }
    finally { setCancelling(false); }
  };
  return (
    <div className="page-container narrow">
      <div className="completion">
        <div className="completion-icon">
          {booking?.status === 'confirmed' ? <Check size={34} /> : <RefreshCw size={28} />}
        </div>
        <span className="eyebrow">YOUR APPLICATION</span>
        <h1>{booking?.status === 'confirmed' ? 'お申し込みが確定しました。' : booking?.status === 'cancelled' ? 'キャンセルしました。' : '申し込み状況の確認'}</h1>
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        {booking && (
          <>
            <p>{booking.status === 'confirmed' ? '当日は公的な身分証をお持ちください。参加費は会場でお支払いください。' : '受付番号は無効になりました。'}</p>
            <div className="confirmation-details">
              <h2>{booking.eventTitle}</h2>
              <p>会場でのお支払い：{yen(booking.amount)}（税込）</p>
              <p>お支払い状況：{booking.received ? '受領済み' : '当日会場でお支払い'}</p>
              <small>受付番号：{booking.id.slice(0, 12).toUpperCase()}</small>
            </div>
          </>
        )}
        {booking?.status === 'confirmed' && !booking.received && (
          <button className="button outline" onClick={cancel} disabled={cancelling}>{cancelling ? '手続き中…' : '申し込みをキャンセルする'}</button>
        )}
        {(!booking || error) && (
          <button className="button outline" onClick={() => setAttempt((v) => v + 1)}>
            <RefreshCw size={17} />
            状況を再確認する
          </button>
        )}
        <Link className="button dark" to="/events">
          イベント一覧へ
          <ArrowRight size={18} />
        </Link>
        <p>
          <Link to="/contact">お問い合わせ・キャンセルのご連絡</Link>
        </p>
      </div>
    </div>
  );
}
export function ContactPage() {
  const [sent, setSent] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    const d = new FormData(e.currentTarget);
    try {
      if (!isDemo)
        await api('/contact', {
          method: 'POST',
          body: JSON.stringify({
            name: d.get('name'),
            email: d.get('email'),
            category: d.get('category'),
            message: d.get('message'),
            consent: d.get('consent') === 'on',
          }),
        });
      setSent(true);
      window.scrollTo(0, 0);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="page-container narrow">
      <Breadcrumb items={[{ label: 'お問い合わせ' }]} />
      <PageHeading
        en="CONTACT"
        title="お問い合わせ"
        description="イベントやご参加について、お気軽にご相談ください。"
      />
      {sent ? (
        <div className="completion">
          <div className="completion-icon">
            <Mail size={30} />
          </div>
          <h2>
            {isDemo ? 'お問い合わせの入力を確認しました。' : 'お問い合わせを受け付けました。'}
          </h2>
          <p>
            {isDemo
              ? 'デモモードのため、実際の送信はしていません。'
              : '内容を確認し、ご入力いただいたメールアドレスへご連絡します。'}
          </p>
          <Link className="button dark" to="/">
            トップページへ
            <ArrowRight size={18} />
          </Link>
        </div>
      ) : (
        <>
          <div className="contact-faq-link">
            <p>よくある質問もご確認ください。</p>
            <Link to="/faq">
              よくある質問
              <ArrowRight size={16} />
            </Link>
          </div>
          <form className="application-form" onSubmit={submit}>
            {error && (
              <div className="form-error" role="alert">
                {error}
              </div>
            )}
            <label>
              お名前 <i>*</i>
              <input name="name" autoComplete="name" required minLength={2} maxLength={80} />
            </label>
            <label>
              メールアドレス <i>*</i>
              <input name="email" autoComplete="email" type="email" required maxLength={254} />
            </label>
            <label>
              お問い合わせの種類
              <select name="category">
                <option>参加について</option>
                <option>キャンセル・お支払い</option>
                <option>開催について</option>
                <option>その他</option>
              </select>
            </label>
            <label>
              お問い合わせ内容 <i>*</i>
              <textarea
                name="message"
                required
                minLength={10}
                maxLength={4000}
                rows={7}
                placeholder="参加済みのイベントについては、イベント名と開催日をご記入ください。"
              />
            </label>
            <label className="checkbox-label">
              <input name="consent" type="checkbox" required />
              <span>
                <Link to="/privacy" target="_blank">
                  プライバシーポリシー
                </Link>
                に同意します。<i>*</i>
              </span>
            </label>
            <button className="button dark wide" disabled={busy}>
              {busy
                ? '送信しています…'
                : isDemo
                  ? 'デモの入力内容を確認する'
                  : 'お問い合わせを送信する'}
              <ArrowRight size={18} />
            </button>
          </form>
        </>
      )}
    </div>
  );
}
