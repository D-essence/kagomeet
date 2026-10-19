import { useEffect, useRef, useState } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import { ArrowUpRight, Menu, X, ArrowRight } from 'lucide-react';
import { isDemo } from '../lib';
export function Brand({ light = false }: { light?: boolean }) {
  return (
    <Link className={`brand ${light ? 'light' : ''}`} to="/" aria-label="KAGOMEET トップページ">
      <span>
        KAGO<span className="brand-meet">MEET</span>
      </span>
      <small>カゴミー</small>
    </Link>
  );
}
export default function Layout() {
  const [open, setOpen] = useState(false),
    location = useLocation(),
    menuRef = useRef<HTMLDivElement>(null),
    buttonRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    setOpen(false);
    window.scrollTo({ top: 0 });
  }, [location.pathname]);
  useEffect(() => {
    if (!open) return;
    const old = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const links = menuRef.current?.querySelectorAll<HTMLAnchorElement>('a');
    links?.[0]?.focus();
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false);
        buttonRef.current?.focus();
      }
      if (e.key === 'Tab' && links?.length) {
        const first = links[0],
          last = links[links.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          buttonRef.current?.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          buttonRef.current?.focus();
        } else if (document.activeElement === buttonRef.current) {
          e.preventDefault();
          (e.shiftKey ? last : first).focus();
        }
      }
    };
    window.addEventListener('keydown', key);
    return () => {
      document.body.style.overflow = old;
      window.removeEventListener('keydown', key);
    };
  }, [open]);
  return (
    <>
      <a className="skip-link" href="#main">
        本文へ移動
      </a>
      {isDemo && (
        <div className="demo-notice">
          サンプルサイト <span>掲載イベントはデモです。実際の予約・決済は行われません。</span>
        </div>
      )}
      <header className="site-header">
        <Brand />
        <nav className="desktop-nav" aria-label="メインナビゲーション">
          <NavLink to="/about">ABOUT</NavLink>
          <NavLink to="/events">EVENTS</NavLink>
          <NavLink to="/faq">FAQ</NavLink>
          <NavLink to="/contact">CONTACT</NavLink>
        </nav>
        <Link className="header-cta" to="/contact">
          お問い合わせ
        </Link>
        <button
          ref={buttonRef}
          className="menu-button"
          onClick={() => setOpen(!open)}
          aria-expanded={open}
          aria-controls="mobile-menu"
          aria-label={open ? 'メニューを閉じる' : 'メニューを開く'}
        >
          {open ? <X /> : <Menu />}
        </button>
      </header>
      {open && (
        <div
          ref={menuRef}
          id="mobile-menu"
          className="mobile-menu"
          role="dialog"
          aria-modal="true"
          aria-label="メニュー"
        >
          <NavLink to="/">
            トップページ
            <ArrowRight />
          </NavLink>
          <NavLink to="/about">
            初めての方へ
            <ArrowRight />
          </NavLink>
          <NavLink to="/events">
            イベント一覧
            <ArrowRight />
          </NavLink>
          <NavLink to="/faq">
            よくある質問
            <ArrowRight />
          </NavLink>
          <NavLink to="/contact">
            お問い合わせ
            <ArrowRight />
          </NavLink>
          <p>鹿児島で、気軽につながる。</p>
        </div>
      )}
      <main id="main" tabIndex={-1}>
        <Outlet />
      </main>
      <footer className="site-footer">
        <div className="footer-top">
          <Brand light />
          <p>
            鹿児島で、気軽につながる。
            <br />
            飲み会・交流イベント KAGOMEET
          </p>
          <Link className="footer-event" to="/events">
            次のイベントを探す
            <ArrowUpRight />
          </Link>
        </div>
        <div className="footer-links">
          <Link to="/about">初めての方へ</Link>
          <Link to="/events">イベント一覧</Link>
          <Link to="/faq">よくある質問</Link>
          <Link to="/contact">お問い合わせ</Link>
        </div>
        <div className="footer-bottom">
          <div>
            <Link to="/terms">利用規約</Link>
            <Link to="/privacy">プライバシーポリシー</Link>
            <Link to="/legal">特定商取引法に基づく表記</Link>
            <Link to="/admin">運営者ログイン</Link>
          </div>
          <small>© {new Date().getFullYear()} KAGOMEET</small>
        </div>
      </footer>
    </>
  );
}
