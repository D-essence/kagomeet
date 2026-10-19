import { useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
  sendPasswordResetEmail,
  type User,
} from 'firebase/auth';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import {
  CalendarDays,
  Users,
  ChartNoAxesCombined,
  LogOut,
  Plus,
  Search,
  Pencil,
  Trash2,
  ArrowLeft,
  ImagePlus,
  Mail,
  RefreshCw,
  Check,
} from 'lucide-react';
import { api, auth, isDemo, storage } from './lib';
import { demoEvents } from './data';
import { areas, fullDate, yen, type EventData, type Participant } from './types';
import { Brand } from './components/Layout';
import ImageCropper from './components/ImageCropper';
const statuses = {
  holding: '決済待ち',
  paid: '参加確定',
  expired: '期限切れ',
  refunded: '返金済み',
};
type Sale = { eventId: string; title: string; gross: number; refunded: number; bookings: number };
type Inquiry = {
  id: string;
  name: string;
  email: string;
  message: string;
  category: string;
  createdAt: number;
};
type MailJob = { id: string; bookingId: string; kind: string; status: string; attempts: number };
export default function Admin() {
  const [user, setUser] = useState<User | null>(null),
    [allowed, setAllowed] = useState(false),
    [checking, setChecking] = useState(true),
    [demo, setDemo] = useState(false),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!auth) {
      setChecking(false);
      return;
    }
    return onAuthStateChanged(auth, async (u) => {
      setUser(u);
      setChecking(true);
      try {
        setAllowed(Boolean(u && (await u.getIdTokenResult(true)).claims.admin));
        if (u && !(await u.getIdTokenResult()).claims.admin)
          setError('このアカウントには管理者権限がありません。');
      } catch {
        setError('権限の確認に失敗しました');
      } finally {
        setChecking(false);
      }
    });
  }, []);
  const login = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    const d = new FormData(e.currentTarget);
    try {
      if (!auth) throw new Error('Firebaseの接続設定が必要です。READMEの手順で設定してください。');
      await signInWithEmailAndPassword(auth, String(d.get('email')), String(d.get('password')));
    } catch {
      setError(
        auth
          ? 'ログインできませんでした。メールアドレスとパスワードをご確認ください。'
          : 'Firebaseの接続設定が必要です。READMEをご確認ください。',
      );
    } finally {
      setBusy(false);
    }
  };
  if (checking) return <div className="loading">管理者権限を確認しています…</div>;
  if (!allowed && !demo)
    return (
      <div className="admin-login">
        <Brand />
        <div className="login-panel">
          <span className="eyebrow">FOR ORGANIZERS</span>
          <h1>運営者ログイン</h1>
          <p>イベントと参加者を管理します。</p>
          {error && (
            <p role="alert" className="form-error">
              {error}
            </p>
          )}
          <form onSubmit={login}>
            <label>
              メールアドレス
              <input name="email" autoComplete="username" type="email" required />
            </label>
            <label>
              パスワード
              <input
                name="password"
                autoComplete="current-password"
                type="password"
                required
                minLength={8}
              />
            </label>
            <button className="button dark wide" disabled={busy}>
              {busy ? 'ログイン中…' : 'ログイン'}
            </button>
          </form>
          {user && (
            <button className="back-button" onClick={() => auth && signOut(auth)}>
              別のアカウントでログイン
            </button>
          )}
          <button
            className="back-button"
            onClick={async () => {
              const email = prompt('パスワード再設定用のメールアドレスを入力してください');
              if (email && auth) {
                try {
                  await sendPasswordResetEmail(auth, email);
                  setError('対象アカウントがある場合、再設定メールを送信しました。');
                } catch {
                  setError('再設定メールを送信できませんでした。');
                }
              }
            }}
          >
            パスワードを忘れた方
          </button>
          {isDemo && (
            <button className="button outline wide" onClick={() => setDemo(true)}>
              デモ管理画面を見る
            </button>
          )}
          <Link className="back-button" to="/">
            公開サイトに戻る
          </Link>
        </div>
      </div>
    );
  return (
    <Dashboard
      demo={demo}
      logout={async () => {
        setDemo(false);
        if (auth) await signOut(auth);
      }}
    />
  );
}
function Dashboard({ demo, logout }: { demo: boolean; logout: () => void }) {
  const [pending, setPending] = useState<string[]>([]);
  const [tab, setTab] = useState('events'),
    [events, setEvents] = useState<EventData[]>(demo ? demoEvents : []),
    [error, setError] = useState(''),
    [notice, setNotice] = useState(''),
    [loading, setLoading] = useState(false),
    [editing, setEditing] = useState<EventData | null | undefined>(undefined),
    [selected, setSelected] = useState(demo ? demoEvents[0].id : ''),
    [participants, setParticipants] = useState<Participant[]>([]),
    [query, setQuery] = useState(''),
    [sales, setSales] = useState<Sale[]>([]),
    [inquiries, setInquiries] = useState<Inquiry[]>([]),
    [jobs, setJobs] = useState<MailJob[]>([]);
  const load = async () => {
    setError('');
    setLoading(true);
    try {
      if (!demo) {
        const e = await api<EventData[]>('/admin/events', {}, true);
        setEvents(e);
        setSelected((v) => v || e[0]?.id || '');
        if (tab === 'sales') setSales(await api<Sale[]>('/admin/sales', {}, true));
        if (tab === 'inbox') {
          setInquiries(await api<Inquiry[]>('/admin/inquiries', {}, true));
          setJobs(await api<MailJob[]>('/admin/mail', {}, true));
        }
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  };
  const loadParticipants = async () => {
    if (!selected) return;
    setLoading(true);
    setError('');
    try {
      if (demo) {
        setParticipants([]);
        return;
      }
      let cursor: string | null = null;
      let all: Participant[] = [];
      do {
        const data: { items: Participant[]; cursor: string | null } = await api(
          `/admin/bookings?eventId=${selected}${cursor ? `&cursor=${cursor}` : ''}`,
          {},
          true,
        );
        all = [...all, ...data.items];
        cursor = data.cursor;
      } while (cursor);
      setParticipants(all);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    void load();
  }, [tab]);
  useEffect(() => {
    if (tab === 'participants') void loadParticipants();
  }, [selected, tab]);
  const remove = async (e: EventData) => {
    if (!confirm(`「${e.title}」を削除しますか？予約があるイベントは削除できません。`)) return;
    setError('');
    try {
      if (demo) setEvents((v) => v.filter((x) => x.id !== e.id));
      else {
        await api(`/admin/events/${e.id}`, { method: 'DELETE' }, true);
        await load();
      }
      setNotice('イベントを削除しました。');
    } catch (err) {
      setError((err as Error).message);
    }
  };
  const attendance = async (p: Participant) => {
    if (pending.includes(p.id)) return;
    setPending((v) => [...v, p.id]);
    setParticipants((v) => v.map((x) => (x.id === p.id ? { ...x, checkedIn: !p.checkedIn } : x)));
    try {
      await api(
        `/admin/bookings/${p.id}/attendance`,
        { method: 'PATCH', body: JSON.stringify({ checkedIn: !p.checkedIn }) },
        true,
      );
    } catch (err) {
      setParticipants((v) => v.map((x) => (x.id === p.id ? { ...x, checkedIn: p.checkedIn } : x)));
      setError((err as Error).message);
    } finally {
      setPending((v) => v.filter((id) => id !== p.id));
    }
  };
  const refund = async (p: Participant) => {
    const reason = prompt(
      `${p.name}様へ${yen(p.amount - p.refundedAmount)}を返金します。返金理由を入力してください。`,
    );
    if (!reason) return;
    if (!confirm('元の決済方法への返金を実行します。よろしいですか？')) return;
    try {
      await api(
        `/admin/bookings/${p.id}/refund`,
        { method: 'POST', body: JSON.stringify({ reason }) },
        true,
      );
      setNotice('返金を依頼しました。決済通知の受信後に返金済みへ変わります。');
      await loadParticipants();
    } catch (err) {
      setError((err as Error).message);
    }
  };
  const save = async (data: EventData) => {
    if (demo) {
      setEvents((v) =>
        editing
          ? [...v.map((e) => (e.id === editing.id ? data : e))]
          : [...v, { ...data, id: crypto.randomUUID() }],
      );
      setEditing(undefined);
      setNotice('デモのイベントを保存しました。この画面を閉じると元に戻ります。');
      return;
    }
    const {
      id,
      maleRemaining,
      femaleRemaining,
      reservedMale,
      reservedFemale,
      confirmedMale,
      confirmedFemale,
      ...payload
    } = data;
    await api(
      editing ? `/admin/events/${editing.id}` : '/admin/events',
      { method: editing ? 'PUT' : 'POST', body: JSON.stringify(payload) },
      true,
    );
    setEditing(undefined);
    setNotice('イベントを保存しました。');
    await load();
  };
  const visible = participants.filter((p) =>
    [p.name, p.email, p.phone, statuses[p.status]].some((v) =>
      v.toLowerCase().includes(query.toLowerCase()),
    ),
  );
  const total = sales.reduce(
    (a, s) => ({
      gross: a.gross + s.gross,
      refunded: a.refunded + s.refunded,
      count: a.count + s.bookings,
    }),
    { gross: 0, refunded: 0, count: 0 },
  );
  return (
    <div className="admin-shell">
      <header className="admin-header">
        <Brand />
        <span>運営管理</span>
        <div>
          <Link to="/">公開サイト</Link>
          <button className="icon-button" onClick={logout} aria-label="ログアウト">
            <LogOut size={20} />
          </button>
        </div>
      </header>
      <div className="admin-layout">
        <nav className="admin-nav" aria-label="管理メニュー">
          {[
            ['events', 'イベント', CalendarDays],
            ['participants', '参加者', Users],
            ['sales', '売上', ChartNoAxesCombined],
            ['inbox', 'お問い合わせ', Mail],
          ].map(([key, label, Icon]) => {
            const I = Icon as typeof Users;
            return (
              <button
                key={String(key)}
                className={tab === key ? 'active' : ''}
                onClick={() => {
                  setTab(String(key));
                  setEditing(undefined);
                  setNotice('');
                }}
              >
                <I size={18} />
                {String(label)}
              </button>
            );
          })}
        </nav>
        <main className="admin-content">
          {demo && (
            <div className="notice">
              デモ管理画面：変更は一時的な表示のみです。本番データへのアクセスや保存は行いません。
            </div>
          )}
          {error && (
            <div className="form-error" role="alert">
              {error}
            </div>
          )}
          {notice && (
            <div className="success-message" role="status">
              {notice}
            </div>
          )}
          {editing !== undefined ? (
            <EventEditor
              value={editing}
              demo={demo}
              onSave={save}
              onCancel={() => setEditing(undefined)}
            />
          ) : (
            <>
              <div className="admin-title">
                <div>
                  <span className="eyebrow">MANAGEMENT</span>
                  <h1>
                    {
                      {
                        events: 'イベント管理',
                        participants: '参加者管理',
                        sales: '売上',
                        inbox: 'お問い合わせ・メール',
                      }[tab]
                    }
                  </h1>
                </div>
                {tab === 'events' ? (
                  <button className="button dark" onClick={() => setEditing(null)}>
                    <Plus size={18} />
                    イベントを作成
                  </button>
                ) : (
                  <button
                    className="icon-button"
                    onClick={() => (tab === 'participants' ? loadParticipants() : load())}
                    aria-label="再読み込み"
                  >
                    <RefreshCw size={20} />
                  </button>
                )}
              </div>
              {loading && <p role="status">読み込み中…</p>}
              {tab === 'events' && (
                <div className="admin-events">
                  {events.map((e) => (
                    <article key={e.id}>
                      <img src={e.image || '/images/hero.png'} alt="" />
                      <div>
                        <span className={`status-badge ${e.status}`}>
                          {e.status === 'published'
                            ? '公開中'
                            : e.status === 'draft'
                              ? '下書き'
                              : '中止'}
                        </span>
                        <h2>{e.title}</h2>
                        <p>
                          {fullDate(e.startsAt)} / {areas[e.area]}
                        </p>
                        <p>
                          男性 {yen(e.malePrice)}・{e.maleCapacity}名 / 女性 {yen(e.femalePrice)}・
                          {e.femaleCapacity}名
                        </p>
                      </div>
                      <div className="admin-row-actions">
                        <button className="button outline small" onClick={() => setEditing(e)}>
                          <Pencil size={16} />
                          編集
                        </button>
                        <button
                          className="icon-button danger"
                          onClick={() => remove(e)}
                          aria-label={`${e.title}を削除`}
                        >
                          <Trash2 size={18} />
                        </button>
                      </div>
                    </article>
                  ))}
                  {!events.length && !loading && (
                    <div className="empty-state">
                      イベントを作成して、開催の準備を始めましょう。
                    </div>
                  )}
                </div>
              )}
              {tab === 'participants' && (
                <>
                  <div className="admin-filters">
                    <label>
                      イベント
                      <select
                        aria-label="イベント"
                        value={selected}
                        onChange={(e) => setSelected(e.target.value)}
                      >
                        <option value="">選択してください</option>
                        {events.map((e) => (
                          <option value={e.id} key={e.id}>
                            {e.title}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      参加者を検索
                      <div className="search-input">
                        <Search size={18} />
                        <input
                          type="search"
                          value={query}
                          onChange={(e) => setQuery(e.target.value)}
                          placeholder="名前・メール・電話番号・状況"
                        />
                      </div>
                    </label>
                  </div>
                  <p>
                    {visible.length} 件 / 出席 {participants.filter((p) => p.checkedIn).length} 名
                  </p>
                  <div className="participant-list">
                    {visible.map((p) => (
                      <article key={p.id}>
                        <div>
                          <strong>{p.name}</strong>
                          <span className="status-badge">{statuses[p.status]}</span>
                          <p>
                            {p.gender === 'male' ? '男性' : '女性'} / {p.age}歳 / {yen(p.amount)}
                          </p>
                          <a href={`mailto:${p.email}`}>{p.email}</a>
                          <a href={`tel:${p.phone}`}>{p.phone}</a>
                        </div>
                        <div>
                          <label className="checkbox-label">
                            <input
                              type="checkbox"
                              checked={p.checkedIn}
                              disabled={p.status !== 'paid' || pending.includes(p.id)}
                              onChange={() => attendance(p)}
                            />
                            <span>出席</span>
                          </label>
                          {p.status === 'paid' && (
                            <button className="button outline small" onClick={() => refund(p)}>
                              キャンセル・返金
                            </button>
                          )}
                        </div>
                      </article>
                    ))}
                  </div>
                  {!visible.length && !loading && (
                    <div className="empty-state">
                      {demo
                        ? 'デモには実際の参加者情報はありません。'
                        : '該当する参加者はいません。'}
                    </div>
                  )}
                </>
              )}
              {tab === 'sales' && (
                <>
                  <div className="stat-grid">
                    <div>
                      <span>決済総額</span>
                      <strong>{yen(total.gross)}</strong>
                    </div>
                    <div>
                      <span>返金総額</span>
                      <strong>{yen(total.refunded)}</strong>
                    </div>
                    <div>
                      <span>売上（返金差引後）</span>
                      <strong>{yen(total.gross - total.refunded)}</strong>
                    </div>
                  </div>
                  <p className="muted">
                    税込・Stripe手数料控除前。決済通知で確定したデータを集計します。
                  </p>
                  <h2>イベント別売上</h2>
                  <div className="sales-list">
                    {sales.map((s) => (
                      <div key={s.eventId}>
                        <h3>{s.title}</h3>
                        <p>
                          {s.bookings}件 / 返金 {yen(s.refunded)}
                        </p>
                        <strong>{yen(s.gross - s.refunded)}</strong>
                      </div>
                    ))}
                  </div>
                  {!sales.length && !loading && (
                    <div className="empty-state">売上データはまだありません。</div>
                  )}
                </>
              )}
              {tab === 'inbox' && (
                <>
                  <h2>お問い合わせ（最新100件）</h2>
                  {inquiries.map((i) => (
                    <article className="inquiry" key={i.id}>
                      <small>
                        {fullDate(new Date(i.createdAt).toISOString())} / {i.category}
                      </small>
                      <h3>{i.name}</h3>
                      <a href={`mailto:${i.email}`}>{i.email}</a>
                      <p className="multiline">{i.message}</p>
                    </article>
                  ))}
                  {!inquiries.length && <p className="muted">お問い合わせはありません。</p>}
                  <h2>未送信・失敗した確認メール</h2>
                  {jobs.map((j) => (
                    <div className="mail-job" key={j.id}>
                      <span>
                        {j.kind} / {j.status} / 再試行 {j.attempts}回
                        <small>受付番号 {j.bookingId.slice(0, 12)}</small>
                      </span>
                      <button
                        className="button outline small"
                        onClick={async () => {
                          try {
                            await api(`/admin/mail/${j.id}/retry`, { method: 'POST' }, true);
                            await load();
                            setNotice('再送キューに登録しました。');
                          } catch (e) {
                            setError((e as Error).message);
                          }
                        }}
                      >
                        再送する
                      </button>
                    </div>
                  ))}
                  {!jobs.length && <p className="muted">未送信のメールはありません。</p>}
                </>
              )}
            </>
          )}
        </main>
      </div>
    </div>
  );
}
function localDate(s: string) {
  const d = new Date(s);
  return new Date(d.getTime() + 9 * 3600000).toISOString().slice(0, 16);
}
function blankEvent(): EventData {
  const start = new Date(Date.now() + 7 * 86400000);
  start.setUTCHours(10, 0, 0, 0);
  return {
    ...demoEvents[0],
    id: '',
    title: '',
    venue: '',
    address: '',
    description: '',
    conditions: '公的な身分証をご提示いただける方。',
    notes: '飲酒運転・迷惑行為・勧誘は禁止です。',
    image: '',
    tag: '',
    startsAt: start.toISOString(),
    endsAt: new Date(start.getTime() + 7200000).toISOString(),
    status: 'draft',
    maleRemaining: 12,
    femaleRemaining: 12,
  };
}
function EventEditor({
  value,
  demo,
  onSave,
  onCancel,
}: {
  value: EventData | null;
  demo: boolean;
  onSave: (event: EventData) => Promise<void>;
  onCancel: () => void;
}) {
  const [form, setForm] = useState<EventData>(value ? { ...value } : blankEvent()),
    [file, setFile] = useState<File | null>(null),
    [imageBlob, setImageBlob] = useState<Blob | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const update = (k: keyof EventData, v: unknown) => setForm((f) => ({ ...f, [k]: v }));
  const save = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      if (form.minAge > form.maxAge) throw new Error('対象年齢の上限をご確認ください');
      if (form.alcohol && form.minAge < 20)
        throw new Error('飲酒を伴うイベントは20歳以上に設定してください');
      if (Date.parse(form.endsAt) <= Date.parse(form.startsAt))
        throw new Error('終了日時は開始日時より後にしてください');
      let image = form.image;
      if (imageBlob && !demo) {
        if (!storage) throw new Error('Storageが未設定です');
        const fileRef = ref(storage, `event-images/${crypto.randomUUID()}.jpg`);
        await uploadBytes(fileRef, imageBlob, {
          contentType: 'image/jpeg',
          cacheControl: 'public,max-age=31536000',
        });
        image = await getDownloadURL(fileRef);
      }
      await onSave({ ...form, image });
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <button className="back-button" onClick={onCancel}>
        <ArrowLeft size={16} />
        イベント一覧へ戻る
      </button>
      <h1>{value ? 'イベントを編集' : 'イベントを作成'}</h1>
      <form onSubmit={save} className="event-editor">
        {error && (
          <div role="alert" className="form-error">
            {error}
          </div>
        )}
        <label>
          イベント名
          <input
            required
            minLength={3}
            maxLength={100}
            value={form.title}
            onChange={(e) => update('title', e.target.value)}
          />
        </label>
        <div className="editor-image">
          {form.image ? (
            <img src={form.image} alt="イベント画像プレビュー" />
          ) : (
            <ImagePlus size={40} />
          )}
          <label className="button outline small">
            画像を選んでトリミング
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="visually-hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) {
                  if (
                    !['image/jpeg', 'image/png', 'image/webp'].includes(f.type) ||
                    f.size > 10 * 1024 * 1024
                  ) {
                    setError('JPEG・PNG・WebP形式で10MB以下の画像を選択してください');
                    return;
                  }
                  setFile(f);
                }
                e.target.value = '';
              }}
            />
          </label>
          <small>3:2の比率で切り抜きます。</small>
        </div>
        <div className="form-grid">
          <label>
            開催エリア
            <select value={form.area} onChange={(e) => update('area', e.target.value)}>
              {Object.entries(areas).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </label>
          <label>
            公開状態
            <select value={form.status} onChange={(e) => update('status', e.target.value)}>
              <option value="draft">下書き</option>
              <option value="published">公開</option>
              <option value="cancelled">中止</option>
            </select>
          </label>
          <label>
            開始日時（日本時間）
            <input
              type="datetime-local"
              required
              value={localDate(form.startsAt)}
              onChange={(e) => {
                if (e.target.value)
                  update('startsAt', new Date(e.target.value + ':00+09:00').toISOString());
              }}
            />
          </label>
          <label>
            終了日時（日本時間）
            <input
              type="datetime-local"
              required
              value={localDate(form.endsAt)}
              onChange={(e) => {
                if (e.target.value)
                  update('endsAt', new Date(e.target.value + ':00+09:00').toISOString());
              }}
            />
          </label>
        </div>
        <label>
          会場名
          <input
            required
            maxLength={120}
            value={form.venue}
            onChange={(e) => update('venue', e.target.value)}
          />
        </label>
        <label>
          会場住所
          <input
            required
            minLength={5}
            maxLength={250}
            value={form.address}
            onChange={(e) => update('address', e.target.value)}
          />
        </label>
        <label className="checkbox-label">
          <input
            type="checkbox"
            checked={form.alcohol}
            onChange={(e) => update('alcohol', e.target.checked)}
          />
          <span>飲酒を伴うイベント（20歳以上）</span>
        </label>
        <div className="form-grid">
          {[
            ['minAge', '対象年齢（下限）', 18, 80],
            ['maxAge', '対象年齢（上限）', 18, 80],
            ['malePrice', '男性料金（税込・円）', 100, 100000],
            ['femalePrice', '女性料金（税込・円）', 100, 100000],
            ['maleCapacity', '男性定員', 1, 500],
            ['femaleCapacity', '女性定員', 1, 500],
          ].map(([k, label, min, max]) => (
            <label key={k}>
              {label}
              <input
                required
                type="number"
                min={min}
                max={max}
                value={form[k as keyof EventData] as number}
                onChange={(e) => update(k as keyof EventData, Number(e.target.value))}
              />
            </label>
          ))}
        </div>
        <label>
          カードのタグ
          <input
            maxLength={40}
            value={form.tag}
            onChange={(e) => update('tag', e.target.value)}
            placeholder="例：おひとり参加歓迎"
          />
        </label>
        <label>
          イベントの説明
          <textarea
            required
            minLength={10}
            maxLength={5000}
            rows={6}
            value={form.description}
            onChange={(e) => update('description', e.target.value)}
          />
        </label>
        <label>
          参加条件
          <textarea
            required
            maxLength={2000}
            rows={3}
            value={form.conditions}
            onChange={(e) => update('conditions', e.target.value)}
          />
        </label>
        <fieldset>
          <legend>当日の流れ</legend>
          {form.schedule.map((s, i) => (
            <div className="schedule-row" key={i}>
              <input
                aria-label={`流れ${i + 1}の時刻`}
                value={s.time}
                required
                maxLength={30}
                onChange={(e) =>
                  update(
                    'schedule',
                    form.schedule.map((v, n) => (n === i ? { ...v, time: e.target.value } : v)),
                  )
                }
              />
              <input
                aria-label={`流れ${i + 1}の内容`}
                value={s.text}
                required
                maxLength={200}
                onChange={(e) =>
                  update(
                    'schedule',
                    form.schedule.map((v, n) => (n === i ? { ...v, text: e.target.value } : v)),
                  )
                }
              />
              <button
                type="button"
                className="icon-button"
                disabled={form.schedule.length === 1}
                onClick={() =>
                  update(
                    'schedule',
                    form.schedule.filter((_, n) => n !== i),
                  )
                }
                aria-label={`流れ${i + 1}を削除`}
              >
                <Trash2 size={16} />
              </button>
            </div>
          ))}
          <button
            type="button"
            className="button outline small"
            disabled={form.schedule.length >= 20}
            onClick={() => update('schedule', [...form.schedule, { time: '', text: '' }])}
          >
            <Plus size={15} />
            行を追加
          </button>
        </fieldset>
        <label>
          注意事項
          <textarea
            rows={4}
            maxLength={3000}
            value={form.notes}
            onChange={(e) => update('notes', e.target.value)}
          />
        </label>
        <div className="editor-actions">
          <button type="button" className="button outline" onClick={onCancel} disabled={busy}>
            キャンセル
          </button>
          <button className="button dark" disabled={busy}>
            {busy ? '保存しています…' : 'イベントを保存'}
            <Check size={18} />
          </button>
        </div>
      </form>
      {file && (
        <ImageCropper
          file={file}
          onClose={() => setFile(null)}
          onSave={(blob) => {
            setImageBlob(blob);
            if (form.image.startsWith('blob:')) URL.revokeObjectURL(form.image);
            update('image', URL.createObjectURL(blob));
          }}
        />
      )}
    </>
  );
}
