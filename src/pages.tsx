import { useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import {
  ArrowRight,
  ArrowUpRight,
  MapPin,
  Users,
  GlassWater,
  Clock3,
  Check,
  Plus,
  Minus,
  ShieldCheck,
} from 'lucide-react';
import { EventCard, EventStatus, LoadState, useEvents } from './components/Events';
import { areas, cities, dateParts, fullDate, yen, type Area } from './types';
import { faqs } from './data';
import { isDemo, business } from './lib';
export function PageHeading({
  en,
  title,
  description,
}: {
  en: string;
  title: string;
  description?: string;
}) {
  return (
    <div className="page-heading">
      <span className="eyebrow">{en}</span>
      <h1>{title}</h1>
      {description && <p>{description}</p>}
    </div>
  );
}
export function Breadcrumb({ items }: { items: { label: string; to?: string }[] }) {
  return (
    <nav className="breadcrumb" aria-label="パンくず">
      <Link to="/">HOME</Link>
      {items.map((item, i) => (
        <span key={i}>
          <span aria-hidden="true">/</span>
          {item.to ? <Link to={item.to}>{item.label}</Link> : item.label}
        </span>
      ))}
    </nav>
  );
}
export function Home() {
  const state = useEvents();
  const [area, setArea] = useState<Area>('tenmonkan');
  return (
    <>
      <section className="hero">
        <img
          className="hero-photo"
          src="/images/hero.png"
          alt="グラスを合わせて乾杯する交流イベントのイメージ"
          fetchPriority="high"
        />
        <div className="hero-shade" />
        <div className="hero-inner">
          <div className="hero-wordmark" aria-label="KAGOMEET">
            KAGO
            <br />
            MEET<span>カゴミー</span>
          </div>
          <p className="hero-location">TENMONKAN ・ KAGOSHIMA</p>
          <h1>
            <span>鹿児島で、</span>
            <span>気軽につながる。</span>
          </h1>
          <p className="hero-description">
            ひとりでも、友達とでも。
            <br />
            同世代と楽しむ、飲み会・交流イベント。
          </p>
          <div className="hero-actions">
            <a className="button cream" href="#schedule">
              開催イベントを見る
            </a>
            <Link className="button outline" to="/about">
              初めての方へ
            </Link>
          </div>
        </div>
        <a href="#about" className="scroll-hint">
          SCROLL
          <span />
        </a>
      </section>
      <section id="about" className="host-note">
        <div className="reveal">
          <span className="eyebrow">A NOTE FROM KAGOMEET</span>
          <h2>
            いつもの街で、
            <br />
            新しいつながりを。
          </h2>
          <p>
            仕事や学校の外で、
            <br />
            気の合う友達を見つけたい。
            <br />
            そんな気持ちで集まれる場所を、鹿児島に。
          </p>
          <p>
            おいしいごはんと、ドリンクを囲んで。
            <br />
            趣味の話も、何気ない話も、
            <br />
            気負わず楽しめるひとときをつくります。
          </p>
          <p>
            まずは天文館から。
            <br />
            普段のあなたで、お越しください。
          </p>
          <span className="host-sign">— KAGOMEET</span>
        </div>
      </section>
      <section className="reason-section" id="reason">
        <div className="section reveal">
          <span className="eyebrow">ABOUT KAGOMEET</span>
          <h2>心地よく、集まれる理由。</h2>
          <div className="reasons">
            {[
              [
                'i',
                'ひとり参加も、歓迎。',
                '初めての方も気軽に参加できるよう、スタッフが受付から交流までサポートします。',
              ],
              [
                'ii',
                '同世代と、話しやすく。',
                'イベントごとに対象年齢を設定。近い世代だからこそ、気負わず話せる時間を。',
              ],
              [
                'iii',
                '友達づくりの、きっかけに。',
                '婚活に限らず、日常のつながりを広げたい方へ。いろいろな出会いを楽しむ場です。',
              ],
              [
                'iv',
                '安心して楽しめる場を。',
                '年齢確認を行い、勧誘・迷惑行為は禁止。困ったことはスタッフにご相談ください。',
              ],
            ].map(([n, title, body]) => (
              <div className="reason" key={n}>
                <span>{n}</span>
                <div>
                  <h3>{title}</h3>
                  <p>{body}</p>
                </div>
              </div>
            ))}
          </div>
          <Link className="text-link" to="/about">
            参加の流れを見る
            <ArrowRight size={17} />
          </Link>
        </div>
      </section>
      <section id="schedule" className="section event-section reveal">
        <div className="section-header">
          <div>
            <span className="eyebrow">SCHEDULE</span>
            <h2>開催エリアとイベント。</h2>
          </div>
          <Link className="text-link" to="/events">
            すべて見る
            <ArrowUpRight size={18} />
          </Link>
        </div>
        <div className="home-area-heading">
          <span>KAGOMEET</span>
          <small>
            {areas[area]} / {cities[area]}
          </small>
        </div>
        <div className="area-tabs" role="group" aria-label="開催エリア">
          {Object.entries(areas).map(([key, name]) => (
            <button
              key={key}
              className={area === key ? 'selected' : ''}
              aria-pressed={area === key}
              onClick={() => setArea(key as Area)}
            >
              {name}
              {key !== 'tenmonkan' && <small>準備中</small>}
            </button>
          ))}
        </div>
        <div className="schedule-label">
          <h3>次の開催</h3>
          <span>UPCOMING</span>
          <i />
        </div>
        <p className="muted">日時・会場・対象年齢を確認して、気になるイベントへ。</p>
        <LoadState {...state} />
        <div className="event-grid">
          {state.events
            .filter((e) => e.area === area)
            .slice(0, 3)
            .map((e) => (
              <EventCard key={e.id} event={e} />
            ))}
        </div>
        {!state.loading && !state.error && !state.events.some((e) => e.area === area) && (
          <div className="empty-state">
            <MapPin size={28} />
            <h3>{areas[area]}での開催を準備しています。</h3>
            <p>開催が決まり次第、こちらでご案内します。</p>
          </div>
        )}
        <Link className="button outline centered" to={`/events?area=${area}`}>
          開催日程をもっと見る
          <ArrowRight size={18} />
        </Link>
        <div className="reservation-help">
          <span className="eyebrow">お申し込み済みの方へ</span>
          <h3>ご予約の確認・キャンセル</h3>
          <p>
            確認メール内のリンクから申し込み状況をご確認いただけます。
            <br />
            キャンセルのご相談は、<Link to="/contact">お問い合わせ</Link>へ。
          </p>
        </div>
      </section>
      <section id="faq" className="section home-faq reveal">
        <div className="section-header">
          <div>
            <span className="eyebrow">FAQ</span>
            <h2>よくある質問。</h2>
          </div>
        </div>
        <FAQList items={faqs.slice(0, 5)} />
        <Link className="button outline centered" to="/faq">
          すべての質問を見る
          <ArrowRight size={17} />
        </Link>
      </section>
      <section className="contact-banner" id="contact">
        <div className="reveal">
          <span className="eyebrow">CONTACT</span>
          <h2>お問い合わせ。</h2>
          <p>
            参加前の気になることや、開催について。
            <br />
            お気軽にご相談ください。
          </p>
          <Link className="button cream" to="/contact">
            お問い合わせはこちら
            <ArrowUpRight size={17} />
          </Link>
        </div>
      </section>
    </>
  );
}
export function EventsPage() {
  const [params, setParams] = useSearchParams(),
    area = params.get('area') || 'all',
    state = useEvents();
  const filtered = state.events.filter((e) => area === 'all' || e.area === area);
  return (
    <div className="page-container">
      <Breadcrumb items={[{ label: 'イベント一覧' }]} />
      <PageHeading
        en="EVENTS"
        title="イベント一覧"
        description="気になるイベントを見つけて、次の週末の予定に。"
      />
      <div className="filter-panel">
        <span>開催エリア</span>
        <div className="filter-tabs" role="group" aria-label="開催エリアで絞り込み">
          {[['all', 'すべて'], ...Object.entries(areas)].map(([key, name]) => (
            <button
              key={key}
              className={area === key ? 'active' : ''}
              aria-pressed={area === key}
              onClick={() => setParams(key === 'all' ? {} : { area: key })}
            >
              {name}
              {(key === 'kokubu' || key === 'kanoya') && <small>準備中</small>}
            </button>
          ))}
        </div>
      </div>
      <div className="result-heading">
        <p>
          <strong>{filtered.length}</strong> 件のイベント
        </p>
        <span>開催日が近い順</span>
      </div>
      <LoadState {...state} />
      <div className="event-grid">
        {filtered.map((e) => (
          <EventCard key={e.id} event={e} />
        ))}
      </div>
      {!state.loading && !state.error && !filtered.length && (
        <div className="empty-state">
          <MapPin size={32} />
          <h2>
            {area !== 'all'
              ? `${areas[area as Area] || 'このエリア'}での開催を準備しています。`
              : '次のイベントを準備しています。'}
          </h2>
          <p>開催が決まり次第、このページでお知らせします。</p>
          <button className="button outline" onClick={() => setParams({})}>
            すべてのエリアを見る
            <ArrowRight size={17} />
          </button>
        </div>
      )}
      <div className="list-note">
        <ShieldCheck size={22} />
        <p>
          飲酒を伴うイベントは20歳以上が対象です。
          <br />
          18〜19歳の方は、対象年齢に含まれるノンアルコールイベントにご参加ください。
        </p>
      </div>
    </div>
  );
}
export function EventDetail() {
  const { id } = useParams(),
    state = useEvents(id),
    e = state.events[0];
  if (state.loading || state.error)
    return (
      <div className="page-container">
        <LoadState {...state} />
      </div>
    );
  if (!e) return <NotFound />;
  const d = dateParts(e.startsAt),
    closed =
      Date.parse(e.startsAt) <= Date.now() + 7200000 ||
      (e.maleRemaining === 0 && e.femaleRemaining === 0);
  return (
    <div className="page-container event-detail">
      <Breadcrumb items={[{ label: 'イベント一覧', to: '/events' }, { label: e.title }]} />
      <div className="detail-layout">
        <article>
          <div className="detail-visual">
            <img src={e.image || '/images/hero.png'} alt={`${e.title}のイメージ`} />
            <span className="image-tag">{e.tag}</span>
          </div>
          <div className="detail-heading">
            <span className="eyebrow">
              {areas[e.area]} / {cities[e.area]}
            </span>
            <h1>{e.title}</h1>
            <p>
              <Clock3 size={17} />
              {fullDate(e.startsAt)}〜{dateParts(e.endsAt).time}
            </p>
          </div>
          {isDemo && (
            <div className="notice">
              このイベントは動作確認用のサンプルです。開催予定・会場・料金は実際のものではありません。
            </div>
          )}
          <section className="detail-section">
            <h2>イベントについて</h2>
            <p className="multiline">{e.description}</p>
          </section>
          <section className="detail-section">
            <h2>開催概要</h2>
            <dl className="info-table">
              <div>
                <dt>開催日時</dt>
                <dd>
                  {fullDate(e.startsAt)}〜{dateParts(e.endsAt).time}
                </dd>
              </div>
              <div>
                <dt>会場</dt>
                <dd>
                  {e.venue}
                  <small>{e.address}</small>
                </dd>
              </div>
              <div>
                <dt>対象年齢</dt>
                <dd>
                  {e.minAge}〜{e.maxAge}歳
                </dd>
              </div>
              <div>
                <dt>参加条件</dt>
                <dd>{e.conditions}</dd>
              </div>
              <div>
                <dt>参加費</dt>
                <dd>
                  男性 {yen(e.malePrice)} / 女性 {yen(e.femalePrice)}
                  <small>税込・1名あたり</small>
                </dd>
              </div>
              <div>
                <dt>募集人数</dt>
                <dd>
                  男性 {e.maleCapacity}名 / 女性 {e.femaleCapacity}名
                </dd>
              </div>
            </dl>
          </section>
          <section className="detail-section">
            <h2>当日の流れ</h2>
            <ol className="timeline">
              {e.schedule.map((s, i) => (
                <li key={i}>
                  <time>{s.time}</time>
                  <span />
                  <p>{s.text}</p>
                </li>
              ))}
            </ol>
          </section>
          <section className="detail-section">
            <h2>アクセス</h2>
            <p>
              {e.venue}
              <br />
              {e.address}
            </p>
            <MapEmbed address={e.address} />
          </section>
          <section className="detail-section">
            <h2>ご参加にあたって</h2>
            <p className="multiline">{e.notes}</p>
            <ul className="check-list">
              <li>当日は生年月日の確認できる公的な身分証をご持参ください。</li>
              <li>営業・宗教・ネットワークビジネス等の勧誘は禁止です。</li>
              <li>お相手への配慮を忘れず、無理な連絡先交換はお控えください。</li>
            </ul>
            <h3>キャンセル・返金について</h3>
            <p>
              開催日の7日前の同時刻までは全額返金、それ以降の参加者都合によるキャンセルは返金対象外です。運営都合の中止は全額返金します。
              <Link to="/contact">お問い合わせ</Link>からご連絡ください。
            </p>
          </section>
        </article>
        <aside className="booking-aside">
          <div className="booking-box">
            <span className="eyebrow">JOIN THIS EVENT</span>
            <h2>
              {d.month}月{d.day}日 <small>（{d.weekday}）</small>
              <span>
                {d.time}〜{dateParts(e.endsAt).time}
              </span>
            </h2>
            <p>
              <MapPin size={15} />
              {areas[e.area]}
              <span>
                {e.minAge}〜{e.maxAge}歳
              </span>
            </p>
            <div className="price-line">
              <span>男性</span>
              <strong>{yen(e.malePrice)}</strong>
              <EventStatus remaining={e.maleRemaining} />
            </div>
            <div className="price-line">
              <span>女性</span>
              <strong>{yen(e.femalePrice)}</strong>
              <EventStatus remaining={e.femaleRemaining} />
            </div>
            <small className="tax-note">
              税込 / {e.alcohol ? 'お食事・飲み放題付き' : 'ノンアルコールイベント'}
            </small>
            {closed ? (
              <div className="button disabled">受付を終了しました</div>
            ) : (
              <Link className="button coral" to={`/events/${e.id}/apply`}>
                このイベントに申し込む
                <ArrowRight size={18} />
              </Link>
            )}
            <p className="payment-note">
              <ShieldCheck size={14} />
              Stripeによる安全なオンライン決済
            </p>
          </div>
          <Link className="aside-help" to="/faq">
            参加前の疑問はこちら
            <ArrowUpRight size={16} />
          </Link>
        </aside>
      </div>
      {!closed && (
        <div className="mobile-booking">
          <div>
            <small>
              {d.month}/{d.day}（{d.weekday}）{d.time}〜
            </small>
            <strong>
              {yen(Math.min(e.malePrice, e.femalePrice))}〜<small>（税込）</small>
            </strong>
          </div>
          <Link className="button coral" to={`/events/${e.id}/apply`}>
            申し込む
            <ArrowRight size={17} />
          </Link>
        </div>
      )}
    </div>
  );
}
function MapEmbed({ address }: { address: string }) {
  const [show, setShow] = useState(false);
  return (
    <div className="map-wrap">
      {show ? (
        <iframe
          title="会場のGoogleマップ"
          src={`https://maps.google.com/maps?q=${encodeURIComponent(address)}&output=embed`}
          loading="lazy"
          referrerPolicy="no-referrer-when-downgrade"
        />
      ) : (
        <button className="map-placeholder" onClick={() => setShow(true)}>
          <MapPin size={34} />
          <span>Google マップを表示</span>
          <small>Google に接続して地図を読み込みます</small>
        </button>
      )}
      <a
        className="text-link"
        href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`}
        target="_blank"
        rel="noreferrer"
      >
        Google マップで開く
        <ArrowUpRight size={16} />
      </a>
    </div>
  );
}
export function FAQList({ items }: { items: typeof faqs }) {
  return (
    <div className="faq-list">
      {items.map((f, i) => (
        <details key={i}>
          <summary>
            <span>Q.</span>
            {f.q}
            <Plus className="faq-plus" size={20} />
            <Minus className="faq-minus" size={20} />
          </summary>
          <div className="faq-answer">
            <span>A.</span>
            <p>{f.a}</p>
          </div>
        </details>
      ))}
    </div>
  );
}
export function FAQPage() {
  const [category, setCategory] = useState('すべて');
  return (
    <div className="page-container narrow">
      <Breadcrumb items={[{ label: 'よくある質問' }]} />
      <PageHeading
        en="FAQ"
        title="よくある質問"
        description="参加前の気になることを、こちらでご確認ください。"
      />
      <div className="faq-categories">
        {['すべて', ...new Set(faqs.map((f) => f.category))].map((c) => (
          <button
            key={c}
            className={c === category ? 'active' : ''}
            onClick={() => setCategory(c)}
            aria-pressed={c === category}
          >
            {c}
          </button>
        ))}
      </div>
      <FAQList items={faqs.filter((f) => category === 'すべて' || f.category === category)} />
      <div className="help-panel">
        <h2>解決しなかった場合は</h2>
        <p>お問い合わせフォームから、お気軽にご連絡ください。</p>
        <Link className="button dark" to="/contact">
          お問い合わせ
          <ArrowUpRight size={18} />
        </Link>
      </div>
    </div>
  );
}
export function AboutPage() {
  return (
    <div className="page-container">
      <Breadcrumb items={[{ label: '初めての方へ' }]} />
      <PageHeading
        en="FIRST TIME"
        title="初めての方へ"
        description="ひとりでも、友達とでも。普段のあなたでお越しください。"
      />
      <section className="about-intro">
        <div>
          <span className="eyebrow">WHAT IS KAGOMEET?</span>
          <h2>
            鹿児島の日常に、
            <br />
            新しいつながりを。
          </h2>
          <p>KAGOMEET（カゴミー）は、鹿児島で開催する20〜30代中心の飲み会・交流イベントです。</p>
          <p>
            友達をつくりたい。いつもと違う人と話したい。
            <br />
            そんな気持ちで、気軽に参加できる場所を目指しています。
          </p>
          <p>サービス開始時は天文館で開催。国分・鹿屋にも、少しずつ輪を広げていきます。</p>
        </div>
        <img src="/images/hero.png" alt="テーブルでの交流を表現したイラスト" />
      </section>
      <section className="detail-section">
        <span className="eyebrow">HOW TO JOIN</span>
        <h2>参加までの3ステップ</h2>
        <div className="steps-grid">
          {[
            ['01', 'イベントを探す', '日程や対象年齢を確認して、気になるイベントを選びましょう。'],
            [
              '02',
              '申し込み・お支払い',
              '必要事項を入力してオンライン決済へ。決済が確認できたら参加確定です。',
            ],
            [
              '03',
              '当日は、気軽に会場へ',
              '確認メールをチェック。公的な身分証を持って、受付時間にお越しください。',
            ],
          ].map(([num, title, body]) => (
            <div key={num}>
              <span>{num}</span>
              <h3>{title}</h3>
              <p>{body}</p>
            </div>
          ))}
        </div>
      </section>
      <section className="community-rules">
        <ShieldCheck size={32} />
        <div>
          <h2>みんなが心地よく過ごすために</h2>
          <ul className="check-list">
            <li>年齢確認にご協力ください。飲酒を伴うイベントは20歳以上が対象です。</li>
            <li>お酒や連絡先交換の強要、迷惑行為は禁止です。</li>
            <li>営業・宗教・ネットワークビジネスなどの勧誘はお断りします。</li>
            <li>お困りのことがあれば、その場でスタッフにお声がけください。</li>
          </ul>
        </div>
      </section>
      <Link className="button dark centered" to="/events">
        イベントを探す
        <ArrowUpRight size={18} />
      </Link>
    </div>
  );
}
export function NotFound() {
  return (
    <div className="page-container empty-state">
      <span className="eyebrow">404 / NOT FOUND</span>
      <h1>ページが見つかりません。</h1>
      <p>URLをご確認いただくか、トップページへお戻りください。</p>
      <Link className="button dark" to="/">
        トップページへ
        <ArrowRight size={18} />
      </Link>
    </div>
  );
}
export function LegalPage({ kind }: { kind: 'terms' | 'privacy' | 'legal' }) {
  const name = {
    terms: '利用規約',
    privacy: 'プライバシーポリシー',
    legal: '特定商取引法に基づく表記',
  }[kind];
  const pending = (v: string) => v || '未設定（受付開始前に公開します）';
  return (
    <div className="page-container narrow legal-page">
      <Breadcrumb items={[{ label: name }]} />
      <PageHeading en={kind.toUpperCase()} title={name} />
      {kind === 'terms' ? (
        <>
          <p>
            本規約は、KAGOMEET（以下「本サービス」）が提供するイベントの参加条件を定めます。お申し込みの前に内容をご確認ください。
          </p>
          <h2>1. 参加条件</h2>
          <p>
            各イベントに記載された対象年齢・条件を満たす方が対象です。飲酒を伴うイベントは20歳以上に限ります。18〜19歳の方は飲酒を伴わない対象イベントのみ参加できます。年齢・本人確認のため公的な身分証をご提示いただきます。
          </p>
          <h2>2. お申し込み・契約成立</h2>
          <p>
            所定のフォームに正確な情報を入力し、オンライン決済を行ってください。決済完了をシステムが確認した時点で参加が確定します。入力途中や決済画面での一時的な席の確保は参加確定ではありません。
          </p>
          <h2>3. 料金・お支払い</h2>
          <p>
            参加費は各イベントページに税込で表示します。Stripeを通じたクレジットカード決済でお支払いいただきます。会場までの交通費等は参加者の負担です。
          </p>
          <h2>4. キャンセル・返金</h2>
          <p>
            開催日時の7日前の同時刻までは全額返金します。それ以降の参加者都合によるキャンセル、遅刻、無断欠席は返金対象外です。キャンセルはお問い合わせフォームからご連絡ください。運営都合で中止する場合は全額返金します。返金は元のお支払い方法へ行い、反映には通常5〜10営業日かかります。
          </p>
          <h2>5. 禁止事項</h2>
          <p>
            勧誘・営業行為、ハラスメント、飲酒や連絡先交換の強要、虚偽の申告、他の参加者に迷惑をかける行為、無断での撮影・公開、飲酒運転は禁止します。安全を守るため、違反が認められる場合は参加をお断りすることがあります。
          </p>
          <h2>6. 開催変更・中止</h2>
          <p>
            災害、交通機関の停止、会場の事情その他のやむを得ない事情により開催内容を変更・中止することがあります。その際はお申し込み時の連絡先にご案内します。
          </p>
          <h2>7. 責任の範囲</h2>
          <p>
            本サービスは特定の出会いや交際の成立を保証しません。当事者間の交流は互いを尊重して行ってください。運営者の責任については適用法令に従い、故意・重過失による責任や法令上制限できない責任を免除するものではありません。
          </p>
          <h2>8. お問い合わせ・規約の変更</h2>
          <p>
            お問い合わせは<Link to="/contact">専用フォーム</Link>
            からお願いします。規約を変更する場合は本サイトに掲示し、必要に応じて適切な方法で周知します。
          </p>
        </>
      ) : kind === 'privacy' ? (
        <>
          <p>KAGOMEETは、イベント運営に必要な個人情報を以下の方針に従って取り扱います。</p>
          <h2>1. 取得する情報</h2>
          <p>
            氏名、性別、年齢、メールアドレス、電話番号、参加イベント、決済・返金の状況、出欠、お問い合わせ内容、アクセスに関する情報を取得します。カード番号はStripeで処理され、当サービスでは保存しません。
          </p>
          <h2>2. 利用目的</h2>
          <p>
            申し込み受付、本人・年齢確認、決済・返金、イベント連絡、確認メール送信、お問い合わせへの対応、不正利用の防止とサービス改善に使用します。
          </p>
          <h2>3. 外部サービスの利用</h2>
          <p>
            データ管理・認証にGoogle
            Firebase、決済にStripe、メール送信にResendを利用します。地図表示にはGoogle
            マップを使用し、表示ボタンを押した際にGoogleへ接続します。不正利用防止のためFirebase App
            CheckおよびreCAPTCHAを利用する場合があります。これらの事業者は国外の設備でデータを処理する場合があります。委託先の規約・安全管理体制を確認し、必要な範囲で情報を取り扱います。
          </p>
          <h2>4. 安全管理と保存期間</h2>
          <p>
            権限を持つ運営者のみが参加者情報にアクセスできます。情報は利用目的の達成と法令上必要な期間に限って保存し、不要になった情報は適切に削除します。
          </p>
          <h2>5. 第三者提供</h2>
          <p>
            法令に基づく場合や本人の同意がある場合を除き、業務委託に必要な範囲を超えて第三者に情報を提供しません。
          </p>
          <h2>6. 開示・訂正・削除等</h2>
          <p>
            ご本人から情報の開示、訂正、削除、利用停止等の請求があった場合は、本人確認のうえ法令に従って対応します。
            <Link to="/contact">お問い合わせフォーム</Link>からご連絡ください。
          </p>
        </>
      ) : (
        <>
          {(!business.name || !business.address || !business.phone) && (
            <div className="notice">
              運営者情報は未設定です。実際の参加申し込みの受付前に、すべての情報を公開します。
            </div>
          )}
          <dl className="info-table">
            <div>
              <dt>販売事業者</dt>
              <dd>{pending(business.name)}</dd>
            </div>
            <div>
              <dt>運営責任者</dt>
              <dd>{pending(business.representative)}</dd>
            </div>
            <div>
              <dt>所在地</dt>
              <dd>{pending(business.address)}</dd>
            </div>
            <div>
              <dt>電話番号</dt>
              <dd>{pending(business.phone)}</dd>
            </div>
            <div>
              <dt>メールアドレス</dt>
              <dd>{pending(business.email)}</dd>
            </div>
            <div>
              <dt>販売価格</dt>
              <dd>各イベントページに税込価格を表示しています。</dd>
            </div>
            <div>
              <dt>追加費用</dt>
              <dd>会場までの交通費、インターネット通信費はお客様の負担となります。</dd>
            </div>
            <div>
              <dt>支払方法・時期</dt>
              <dd>Stripeを利用したクレジットカード決済。申し込み時に決済します。</dd>
            </div>
            <div>
              <dt>サービス提供時期</dt>
              <dd>各イベントページに記載した開催日時。</dd>
            </div>
            <div>
              <dt>キャンセル・返金</dt>
              <dd>
                開催日時の7日前の同時刻までは全額返金。それ以降の参加者都合のキャンセルは返金対象外。運営都合の中止は全額返金します。お問い合わせフォームからご連絡ください。
              </dd>
            </div>
            <div>
              <dt>受付期限・定員</dt>
              <dd>
                開催2時間前または定員到達まで。男女別の募集状況は各イベントページをご確認ください。
              </dd>
            </div>
          </dl>
        </>
      )}
      <p className="legal-date">最終更新：2026年10月19日</p>
    </div>
  );
}
