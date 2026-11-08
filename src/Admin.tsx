import { useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import {
  onAuthStateChanged,
  signInWithRedirect,
  getRedirectResult,
  GoogleAuthProvider,
  signOut,
  type User,
} from 'firebase/auth';
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
  Settings2,
} from 'lucide-react';
import { api, auth, isDemo } from './lib';
import { demoEvents } from './data';
import { areas, fullDate, yen, type EventData, type Participant } from './types';
import { Brand } from './components/Layout';
import ImageCropper from './components/ImageCropper';
const statuses = { confirmed: '参加確定', cancelled: 'キャンセル済み' };
type Sale = { eventId: string; title: string; gross: number; outstanding: number; bookings: number; receivedCount: number };
type SocialSettings = { instagramUrl: string; lineUrl: string };
type Inquiry = {
  id: string;
  name: string;
  email: string;
  message: string;
  category: string;
  createdAt: number;
};
export default function Admin() {
  const [user, setUser] = useState<User | null>(null),
    [allowed, setAllowed] = useState(false),
    [checking, setChecking] = useState(true),
    [demo, setDemo] = useState(false),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    const firebaseAuth = auth;
    if (!firebaseAuth) {
      setChecking(false);
      return;
    }
    let active = true;
    let unsubscribe: (() => void) | undefined;
    void getRedirectResult(firebaseAuth)
      .catch((err: { code?: string }) => {
        if (active) setError(`ログインを完了できませんでした。${err.code ? `（${err.code}）` : ''}`);
      })
      .finally(() => {
        if (!active) return;
        unsubscribe = onAuthStateChanged(firebaseAuth, async (u) => {
          setUser(u);
          setChecking(true);
          try {
            if (u) { await api('/admin/session', {}, true); setAllowed(true); setError(''); }
            else setAllowed(false);
          } catch {
            setAllowed(false);
            setError('このアカウントには管理者権限がありません。');
          } finally {
            setChecking(false);
          }
        });
      });
    return () => { active = false; unsubscribe?.(); };
  }, []);
  const login = async () => {
    setBusy(true);
    setError('');
    try {
      if (!auth) throw new Error('Firebaseの接続設定が必要です。READMEの手順で設定してください。');
      await signInWithRedirect(auth, new GoogleAuthProvider());
    } catch (err) {
      setError(
        auth
          ? `ログインできませんでした。運営者アカウントでお試しください。${(err as { code?: string }).code ? `（${(err as { code?: string }).code}）` : ''}`
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
          <button className="button dark wide" onClick={login} disabled={busy}>{busy ? 'ログイン中…' : 'Google アカウントでログイン'}</button>
          {user && (
            <button className="back-button" onClick={() => auth && signOut(auth)}>
              別のアカウントでログイン
            </button>
          )}
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
    [busy, setBusy] = useState(false),
    [editing, setEditing] = useState<EventData | null | undefined>(undefined),
    [selected, setSelected] = useState(demo ? demoEvents[0].id : ''),
    [participants, setParticipants] = useState<Participant[]>([]),
    [query, setQuery] = useState(''),
    [sales, setSales] = useState<Sale[]>([]),
    [inquiries, setInquiries] = useState<Inquiry[]>([]),
    [social, setSocial] = useState<SocialSettings>({ instagramUrl: '', lineUrl: '' });
  const load = async () => {
    setError('');
    setLoading(true);
    try {
      if (!demo) {
        const e = await api<EventData[]>('/admin/events', {}, true);
        setEvents(e);
        setSelected((v) => v || e[0]?.id || '');
        if (tab === 'sales') setSales(await api<Sale[]>('/admin/sales', {}, true));
        if (tab === 'settings') setSocial(await api<SocialSettings>('/admin/settings', {}, true));
        if (tab === 'inbox') {
          setInquiries(await api<Inquiry[]>('/admin/inquiries', {}, true));
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
  const payment = async (p: Participant) => {
    if (!confirm(`${p.name}様の参加費 ${yen(p.amount)} を${p.received ? '未収に戻し' : '受領済みにし'}ますか？`)) return;
    setPending((v) => [...v, p.id]);
    try {
      await api(`/admin/bookings/${p.id}/payment`, { method: 'PATCH', body: JSON.stringify({ received: !p.received }) }, true);
      setParticipants((v) => v.map((x) => x.id === p.id ? { ...x, received: !p.received } : x));
      setNotice('集金記録を更新しました。');
    } catch (err) { setError((err as Error).message); }
    finally { setPending((v) => v.filter((id) => id !== p.id)); }
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
      outstanding: a.outstanding + s.outstanding,
      count: a.count + s.bookings,
      receivedCount: a.receivedCount + s.receivedCount,
    }),
    { gross: 0, outstanding: 0, count: 0, receivedCount: 0 },
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
            ['sales', '集金', ChartNoAxesCombined],
            ['inbox', 'お問い合わせ', Mail],
            ['settings', '連絡先設定', Settings2],
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
                        sales: '集金管理',
                        inbox: 'お問い合わせ',
                        settings: '連絡先設定',
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
                              disabled={p.status !== 'confirmed' || pending.includes(p.id)}
                              onChange={() => attendance(p)}
                            />
                            <span>出席</span>
                          </label>
                          {p.status === 'confirmed' && <button className="button outline small" onClick={() => payment(p)} disabled={pending.includes(p.id)}>{p.received ? '受領済み' : '代金の受領を記録'}</button>}
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
                      <span>受領額</span>
                      <strong>{yen(total.gross)}</strong>
                    </div>
                    <div>
                      <span>未収金額</span>
                      <strong>{yen(total.outstanding)}</strong>
                    </div>
                    <div>
                      <span>受領人数</span>
                      <strong>{total.receivedCount}人</strong>
                    </div>
                  </div>
                  <p className="muted">
                    会場で受領を記録した金額です。未収額は参加確定者の参加費を集計しています。
                  </p>
                  <h2>イベント別の集金</h2>
                  <div className="sales-list">
                    {sales.map((s) => (
                      <div key={s.eventId}>
                        <h3>{s.title}</h3>
                        <p>
                          {s.bookings}件 / 受領済み {s.receivedCount}件 / 未収 {yen(s.outstanding)}
                        </p>
                        <strong>{yen(s.gross)}</strong>
                      </div>
                    ))}
                  </div>
                  {!sales.length && !loading && (
                    <div className="empty-state">集金データはまだありません。</div>
                  )}
                </>
              )}
              {tab === 'settings' && (
                <form className="event-editor settings-editor" onSubmit={async (e) => {
                  e.preventDefault(); setError(''); setBusy(true);
                  try {
                    if (!demo) await api('/admin/settings', { method: 'PUT', body: JSON.stringify(social) }, true);
                    setNotice(demo ? 'デモの設定を変更しました。再読み込みで元に戻ります。' : '連絡先を保存しました。公開サイトに反映されます。');
                  } catch (err) { setError((err as Error).message); }
                  finally { setBusy(false); }
                }}>
                  <p>参加者が開く公式アカウントの URL を設定します。空欄のアイコンは公開画面に表示されません。</p>
                  <label>Instagram の URL<input type="url" value={social.instagramUrl} placeholder="https://www.instagram.com/..." onChange={(e) => setSocial((v) => ({ ...v, instagramUrl: e.target.value }))} /></label>
                  <label>LINE の URL<input type="url" value={social.lineUrl} placeholder="https://lin.ee/..." onChange={(e) => setSocial((v) => ({ ...v, lineUrl: e.target.value }))} /></label>
                  <button className="button dark" disabled={busy}>{busy ? '保存中…' : '連絡先を保存'}<Check size={18} /></button>
                </form>
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
    category: '交流会',
    venue: '',
    address: '',
    description: '',
    conditions: '公的な身分証をご提示いただける方。',
    notes: '飲酒運転・迷惑行為・勧誘は禁止です。',
    schedule: [{ time: '', text: '' }],
    malePrice: 0,
    femalePrice: 0,
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
        const bytes = new Uint8Array(await imageBlob.arrayBuffer());
        let binary = '';
        for (const byte of bytes) binary += String.fromCharCode(byte);
        const uploaded = await api<{ url: string }>('/admin/images', {
          method: 'POST',
          body: JSON.stringify({ base64: btoa(binary), contentType: 'image/jpeg' }),
        }, true);
        image = uploaded.url;
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
        <label>カテゴリ
          <select value={form.category || '交流会'} onChange={(e) => update('category', e.target.value)}>
            {['飲み会', '交流会', '季節イベント', 'アウトドア', 'スポーツ', 'その他'].map((category) => <option key={category}>{category}</option>)}
          </select>
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
            ['malePrice', '男性料金（税込・円）', 0, 100000],
            ['femalePrice', '女性料金（税込・円）', 0, 100000],
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
