import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { ArrowRight, ArrowLeft, Check, ShieldCheck, Mail, RefreshCw } from 'lucide-react';
import { EventSummary, LoadState, useEvents } from './components/Events';
import { Breadcrumb, PageHeading, NotFound } from './pages';
import { api, isDemo } from './lib';
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
  const pay = async () => {
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
        const saved = sessionStorage.getItem(`kagomeet-checkout-${e.id}`);
        let prior;
        try {
          prior = saved ? JSON.parse(saved) : null;
        } catch {
          prior = null;
        }
        key.current = prior?.signature === signature ? prior.key : crypto.randomUUID();
        payloadRef.current = signature;
        sessionStorage.setItem(
          `kagomeet-checkout-${e.id}`,
          JSON.stringify({ signature, key: key.current }),
        );
      }
      const result = await api<{ url: string; bookingId: string; token: string }>('/checkout', {
        method: 'POST',
        body: JSON.stringify({ ...payload, idempotencyKey: key.current }),
      });
      // Do not retain personal input in browser storage after redirecting to Stripe.
      sessionStorage.removeItem(`kagomeet-checkout-${e.id}`);
      sessionStorage.setItem(
        'kagomeet-booking',
        JSON.stringify({ bookingId: result.bookingId, token: result.token }),
      );
      const url = new URL(result.url);
      if (url.hostname !== 'checkout.stripe.com') throw new Error('決済先の確認に失敗しました');
      window.location.assign(url.toString());
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
            <strong>実際の予約・決済・メール送信は行っていません。</strong>
          </p>
          <EventSummary event={e} />
          <p>
            本番ではこのあとStripeの決済画面へ移動し、
            <br />
            決済通知を受信した時点で参加が確定します。
          </p>
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
          <span>3</span>お支払い
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
            <small>申し込み確認と当日のご案内をお送りします。</small>
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
            <h3>キャンセルについて</h3>
            <p>
              開催日時の7日前の同時刻までは全額返金。それ以降の参加者都合のキャンセルは返金対象外です。運営都合の中止は全額返金します。
            </p>
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
              お支払い金額 <small>（税込）</small>
            </span>
            <strong>{yen(form.gender === 'male' ? e.malePrice : e.femalePrice)}</strong>
          </div>
          <p className="notice">
            {isDemo
              ? 'デモモードです。実際の決済は行わず、確認画面を表示します。'
              : 'Stripeの決済画面へ移動します。カード決済の完了を確認した時点で参加が確定します。'}
          </p>
          <button className="button coral wide" onClick={pay} disabled={busy}>
            {busy ? '決済画面を準備しています…' : isDemo ? 'デモの確認画面へ' : '決済画面へ進む'}
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
          <p className="payment-note">
            <ShieldCheck size={15} />
            カード情報はKAGOMEETに保存されません。
          </p>
        </section>
      )}
    </div>
  );
}
interface Status {
  id: string;
  eventId: string;
  eventTitle: string;
  status: 'holding' | 'paid' | 'expired' | 'refunded';
  amount: number;
  refundedAmount: number;
  expiresAt: number;
}
export function CompletePage() {
  const [resuming, setResuming] = useState(false);
  const [params] = useSearchParams(),
    [booking, setBooking] = useState<Status | null>(null),
    [error, setError] = useState(''),
    [attempt, setAttempt] = useState(0);
  const id = params.get('booking'),
    token = params.get('token');
  useEffect(() => {
    if (!id || !token) {
      setError('確認用の情報が見つかりません。確認メールのリンクから開いてください。');
      return;
    }
    let active = true;
    let timer: ReturnType<typeof setTimeout>;
    let count = 0;
    const load = async () => {
      try {
        const b = await api<Status>('/booking/status', {
          method: 'POST',
          body: JSON.stringify({ bookingId: id, token }),
        });
        if (!active) return;
        setBooking(b);
        setError('');
        if (b.status === 'holding' && ++count < 18) timer = setTimeout(load, 5000);
      } catch (err) {
        if (active) setError((err as Error).message);
      }
    };
    load();
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [id, token, attempt]);
  const messages = {
    holding: [
      '決済状況を確認しています。',
      '決済済みの場合は、反映まで少しお待ちください。画面を閉じても、確認が取れ次第メールでご案内します。',
    ],
    paid: [
      'お申し込みが確定しました。',
      'ご参加ありがとうございます。確認メールをお送りします。当日は公的な身分証をお持ちください。',
    ],
    expired: [
      'お申し込みの受付時間が終了しました。',
      'お支払いは確定していません。ご希望の場合は、イベントページから改めてお申し込みください。',
    ],
    refunded: [
      'キャンセル・返金を受け付けました。',
      '元のお支払い方法に返金します。反映には通常5〜10営業日かかります。',
    ],
  };
  return (
    <div className="page-container narrow">
      <div className="completion">
        <div className="completion-icon">
          {booking?.status === 'paid' ? <Check size={34} /> : <ClockIcon />}
        </div>
        <span className="eyebrow">YOUR APPLICATION</span>
        <h1>{booking ? messages[booking.status][0] : '申し込み状況の確認'}</h1>
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        {booking && (
          <>
            <p>{messages[booking.status][1]}</p>
            <div className="confirmation-details">
              <h2>{booking.eventTitle}</h2>
              <p>お支払い金額：{yen(booking.amount)}（税込）</p>
              {booking.refundedAmount > 0 && <p>返金額：{yen(booking.refundedAmount)}</p>}
              <small>受付番号：{booking.id.slice(0, 12).toUpperCase()}</small>
            </div>
            {booking.status === 'holding' && params.has('cancelled') && (
              <p>決済画面から戻りました。未決済の席は約30分後に解放されます。</p>
            )}
          </>
        )}
        {booking?.status === 'holding' && (
          <button
            className="button cream"
            disabled={resuming}
            onClick={async () => {
              setResuming(true);
              try {
                const result = await api<{ url: string }>('/booking/resume', {
                  method: 'POST',
                  body: JSON.stringify({ bookingId: id, token }),
                });
                const url = new URL(result.url);
                if (url.hostname !== 'checkout.stripe.com')
                  throw new Error('決済先の確認に失敗しました');
                window.location.assign(url.toString());
              } catch (e) {
                setError((e as Error).message);
              } finally {
                setResuming(false);
              }
            }}
          >
            {resuming ? '確認しています…' : '決済を再開する'}
            <ArrowRight size={17} />
          </button>
        )}
        {(!booking || booking.status === 'holding' || error) && (
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
function ClockIcon() {
  return <RefreshCw size={28} />;
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
                <option>キャンセル・返金</option>
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
                placeholder="参加済みのイベントについては、イベント名と開催日をご記入ください。カード番号などの決済情報は入力しないでください。"
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
